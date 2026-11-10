// The three kinds of operation the app has, run by one runner:
// - a mutation: one SERIALIZABLE transaction, re-run whole on a serialization failure or a deadlock, with one `now`
//   read before the first attempt and kept across every retry;
// - a query: one REPEATABLE READ READ ONLY transaction, so every read sees one snapshot, with one `now`;
// - an action: no transaction; it reads the clock live and runs mutations and queries through the runner.
// A mutation or query never runs another: the inner one would commit on its own, outside the outer's transaction.
// The transaction is the runner's: a handler can't begin, commit or roll it back, only use savepoints inside it.
// A failure is logged with the operation's name; never its message, which may quote SQL.
// A mutation or query never reaches the network either: it may run again, and it holds its transaction while it waits.
// Any fetch or http(s) request made while one runs throws, and fails the operation even when its handler catches it,
// unless it ran behind the operation's one `fence`, which undoes everything behind it and lets the operation go on.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { publish, type DomainEvent, type Subscribers } from "./bus/publish.ts";
import type { Clock } from "./clock.ts";
import { advanceCreationClock, creationClockFloor, readCreationClock } from "./db/creationClock.ts";
import { createScheduler, type Scheduler } from "./jobs/schedule.ts";
import { errorFields, type Log } from "./log.ts";

export type Database = NodePgDatabase<Record<string, never>>;
/** The operation's transaction: everything a Drizzle database does, except open a transaction or reach its session. */
export type Transaction = Omit<Database, "transaction" | "_" | "$client">;

/** What a new row is born with: a UUID, which no Convex ID can equal, and its creation time. */
export interface NewRow {
  _id: string;
  _creationTime: number;
}

export interface QueryContext {
  tx: Transaction;
  /** The operation's one instant, test offset included. */
  now: number;
}

export interface MutationContext extends QueryContext {
  /**
   * Stamps a new row from the operation's instant; each call strictly after the last in this process, and after every
   * row any runner committed before this attempt began, so the row written last sorts last by `_creationTime`.
   */
  newRow(): NewRow;
  /** Schedules and cancels jobs in this transaction: they commit or roll back with it. */
  jobs: Scheduler;
  /** Publishes a domain event on the bus: one job per subscriber, in this transaction. */
  publish(event: DomainEvent): Promise<void>;
}

export interface ActionContext {
  /** Read live: a deadline computed after a Slack call must use the time after it. */
  clock: Clock;
  run: Pick<Operations, "mutation" | "query">;
}

export interface Operations {
  mutation<T>(name: string, handler: (ctx: MutationContext) => Promise<T>): Promise<T>;
  query<T>(name: string, handler: (ctx: QueryContext) => Promise<T>): Promise<T>;
  action<T>(name: string, handler: (ctx: ActionContext) => Promise<T>): Promise<T>;
}

export interface OperationsOptions {
  pool: Pick<pg.Pool, "connect">;
  clock: Clock;
  log: Log;
  /** Attempts a mutation gets before a serialization failure or deadlock is its answer. */
  maxAttempts?: number;
  /** The wait before attempt `attempt + 1`: exponential with jitter, so conflicting retries spread out. */
  retryDelayMs?: (attempt: number) => number;
  /** The bus's subscribers, which `publish` schedules. */
  subscribers?: Subscribers;
}

/** One attempt's stamps: the creation clock when it began, and the highest stamp it took, if any. */
interface Stamps {
  floor: number;
  highest?: number;
}

// pg answers a text of several statements with one result each.
function lastOf(answer: pg.QueryResult | pg.QueryResult[]): pg.QueryResult {
  return Array.isArray(answer) ? answer.at(-1)! : answer;
}

// Postgres's serialization failure and deadlock: the transaction did nothing, and running it again may succeed.
const retryable = new Set(["40001", "40P01"]);

// Failures that provably committed nothing because the connection was lost before COMMIT was sent: a failover, a
// restart, a network fault. Such an operation runs again on a new connection, as Convex re-ran a mutation after a
// transient error. A loss during COMMIT leaves the outcome unknown, so that one is never run again blindly.
const ranNothing = new WeakSet<object>();

/** Postgres's answers that the session is gone: a connection exception, or a shutdown that ended it. */
function endsSession(error: unknown): boolean {
  return hasSqlState(error) && (error.code.startsWith("08") || ["57P01", "57P02", "57P03"].includes(error.code));
}

// The runner sends each handler statement on its own (pg's extended protocol), so Postgres refuses a text of several,
// and a statement's first words decide whether it begins or ends a transaction.

// The mutation or query whose transaction is open, so another one started inside it is refused. Work its handler
// left behind keeps the store after the operation ends; `open` turns false then, and nothing is refused. Code behind
// the fence runs in a scope of its own, whose `parent` is the operation's.
interface Scope {
  name: string;
  open: boolean;
  network?: Error;
  /** A refusal behind the operation's fence: it fails the operation unless the fence undoes it. Apart from `network`, so
   *  the fence never clears a refusal of the operation's own. */
  networkBehind?: Error;
  parent?: Scope;
  /** A fence's scope once the fence undid it: whatever it left running writes nothing more. */
  undone?: boolean;
  /** The operation's fence, until it is taken; a fence's own scope has none. */
  fence?: <T>(inner: () => Promise<T>) => Promise<T>;
}
const running = new AsyncLocalStorage<Scope>();

/**
 * Throws when a mutation or query is running, and marks it failed, so a handler that catches the error still fails.
 * Every fetch and http(s) request passes here (installed below); a test's stand-in for the network calls it too.
 */
export function refuseNetworkInOperation(what: string): void {
  const scope = running.getStore();
  if (!scope?.open) return;
  const error = new Error(`${what} inside "${scope.name}": a mutation or query never reaches the network; do it in an action, outside its mutations and queries`);
  error.name = "NetworkInOperationError";
  scope.network ??= error;
  // Behind the fence, the operation fails too, unless the fence undoes it first: a stray refusal after that fails it.
  if (scope.parent) scope.parent.networkBehind ??= error;
  throw error;
}

/**
 * Runs `inner` behind a savepoint only the runner can name. When `inner` fails, or reaches for the network even if it
 * catches the refusal, everything it did is rolled back and the failure is its answer; the operation goes on, and
 * nothing `inner` left running writes in it again. One fence per attempt, never nested: the job worker takes it before
 * a job's handler runs (jobs/worker.ts), so a handler can't.
 */
export function fence<T>(inner: () => Promise<T>): Promise<T> {
  const scope = running.getStore();
  if (!scope?.open || !scope.fence) {
    const error = new Error("A fence runs inside a mutation or query, once per attempt, and never inside another");
    error.name = "FenceTakenError";
    return Promise.reject(error);
  }
  const taken = scope.fence;
  scope.fence = undefined;
  return taken(inner);
}

/** Whether `error` is a network call an operation refused. */
export function isNetworkInOperation(error: unknown): boolean {
  return error instanceof Error && error.name === "NetworkInOperationError";
}

// The tests' fetch stand-ins find it here without importing the runner (service/testing/fakePostHog.ts).
(globalThis as { [key: symbol]: unknown })[Symbol.for("kudos.refuseNetworkInOperation")] = refuseNetworkInOperation;

// Installed once, when the runner loads. `fetch` stays assignable: whatever is put in its place is refused the same.
// `vi.stubGlobal` replaces the property itself, so the tests' fetch stand-ins call `refuseNetworkInOperation` too.
const guarded = new WeakMap<object, typeof fetch>();
const unguarded = new WeakMap<object, typeof fetch>();
function guard(inner: typeof fetch): typeof fetch {
  const known = guarded.get(inner);
  if (known) return known;
  const outer = ((...args: Parameters<typeof fetch>) => {
    refuseNetworkInOperation("A fetch");
    return inner(...args);
  }) as typeof fetch;
  guarded.set(inner, outer);
  unguarded.set(outer, inner);
  return outer;
}
let currentFetch = globalThis.fetch;
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  enumerable: true,
  get: () => guard(currentFetch),
  set: (value: typeof fetch) => void (currentFetch = unguarded.get(value) ?? value),
});
for (const module of [http, https] as Array<Record<"request" | "get", (...args: unknown[]) => unknown>>) {
  for (const method of ["request", "get"] as const) {
    const original = module[method];
    module[method] = (...args) => (refuseNetworkInOperation("An http request"), original(...args));
  }
}
syncBuiltinESMExports();

export function createOperations({ pool, clock, log, maxAttempts = 10, retryDelayMs = jitteredBackoff, subscribers = new Map() }: OperationsOptions): Operations {
  let lastCreationTime = Number.NEGATIVE_INFINITY;
  // A stamp comes after every row this process stamped and every row any runner committed before the attempt began
  // (its `floor`), so a row written later sorts later whichever runner wrote it and however its clock runs. Otherwise
  // it is the operation's now, as Convex's was; the step is the smallest that still changes a float64 near now.
  const newRow = (now: number, stamps: Stamps): NewRow => {
    lastCreationTime = Math.max(now, nextAfter(stamps.floor), nextAfter(lastCreationTime));
    stamps.highest = lastCreationTime;
    return { _id: randomUUID(), _creationTime: lastCreationTime };
  };

  const failed = (name: string, kind: string, error: unknown): never => {
    log.error("operation failed", { operation: name, kind, ...errorFields(error) });
    throw error;
  };

  // One transaction on a connection of its own, which always goes back to the pool: dropped when the connection may
  // be broken, kept when the transaction ended cleanly either way.
  // A mutation reads the creation clock in the statement that takes its snapshot, so every runner's commit it sees is
  // under its floor; before it commits, it moves the clock to its highest stamp. Both ride its BEGIN and COMMIT.
  async function inTransaction<T>(name: string, begin: string, handler: (tx: Transaction, stamps: Stamps) => Promise<T>, { stamping = false } = {}): Promise<T> {
    refuseNesting(name);
    const stamps: Stamps = { floor: Number.NEGATIVE_INFINITY };
    // Without a connection, nothing began. pg's own failures to connect have no SQLSTATE; one with a SQLSTATE that
    // doesn't say the server is unreachable, such as a refused password, would fail every time.
    const client = await pool.connect().catch((error: unknown) => {
      if (!hasSqlState(error) || endsSession(error)) markRanNothing(error);
      throw error;
    });
    let broken: unknown;
    // The connection lost before COMMIT was sent: the transaction ended with it, so nothing it did committed.
    let lost: unknown;
    let committing = false;
    // A checked-out client has no listener of the pool's; without one, a dropped connection would crash the process.
    // pg emits it when the socket fails or ends, before it fails the statements that were waiting on it.
    const onError = (error: unknown) => {
      broken ??= error;
      if (!committing) lost ??= error;
    };
    client.on("error", onError);
    // The first statement Postgres failed. It aborts the transaction on it, even when the handler catches it; pg's own
    // refusals, such as a prepared statement's name used twice, never reach Postgres and abort nothing.
    let aborted: unknown;
    // Open while the handler runs; work it left behind then finds its transaction gone, never a pooled connection.
    const scope: Scope = { name, open: true, fence: fenced };
    const tracked = {
      query: (...args: Parameters<pg.PoolClient["query"]>) => {
        if (!scope.open) return Promise.reject(operationEnded(name));
        // After a refused network call nothing more runs in the attempt, not even a rollback to a savepoint, so no
        // write of it commits however the handler goes on. Behind a fence that undid it, only the fenced code stays
        // refused.
        const current = running.getStore();
        const behind = current?.parent === scope ? current : undefined;
        const refused = scope.network ?? scope.networkBehind ?? behind?.network;
        if (refused !== undefined) return Promise.reject(refused);
        if (behind?.undone) return Promise.reject(operationEnded(name));
        const [query, values] = args as unknown as [string | pg.QueryConfig, unknown[] | undefined];
        const config: pg.QueryConfig = typeof query === "string" ? { text: query } : { ...query };
        if (values !== undefined) config.values = values;
        const kind = statementKind(config.text);
        if (kind === "transaction") return Promise.reject(transactionOwned(name));
        return client.query({ ...config, queryMode: "extended" } as pg.QueryConfig).then(
          (result) => {
            // The transaction is usable again; what failed inside the savepoint no longer aborts it.
            if (kind === "rollback to savepoint") aborted = undefined;
            return result;
          },
          (error: unknown) => {
            // The server may answer that it ends the session before the socket closes.
            if (endsSession(error)) (lost ??= error), (broken ??= error);
            if (!hasSqlState(error)) throw error;
            // Every statement after a failed one answers 25P02; the failure the handler went on after is the answer.
            if (error.code === "25P02" && aborted !== undefined) throw wentOnAfter(aborted);
            aborted ??= error;
            throw error;
          },
        );
      },
    };
    async function fenced<T>(inner: () => Promise<T>): Promise<T> {
      const savepoint = `fence_${randomUUID().replaceAll("-", "")}`;
      // Tracked like any statement: after a failure the handler swallowed, it answers with that failure's code.
      await (tracked.query as (text: string) => Promise<unknown>)(`savepoint ${savepoint}`);
      const behind: Scope = {
        name,
        get open() {
          return scope.open;
        },
        parent: scope,
      };
      let failure: { error: unknown } | undefined;
      let result: T | undefined;
      try {
        result = await running.run(behind, inner);
      } catch (error) {
        failure = { error };
      }
      if (behind.network) failure = { error: behind.network };
      if (failure === undefined) return result as T;
      // Straight to the client: the refusal stops every other statement. If it fails too, the transaction is lost and
      // the operation fails with it. Once the operation has ended, the connection may be another's: it is left alone.
      behind.undone = true;
      if (!scope.open) throw failure.error;
      await client.query(`rollback to savepoint ${savepoint}`);
      aborted = undefined;
      scope.networkBehind = undefined;
      throw failure.error;
    }
    try {
      const began = await client.query(stamping ? `${begin}; ${readCreationClock}` : begin).catch((error: unknown) => {
        broken ??= error;
        if (!hasSqlState(error) || endsSession(error)) lost ??= error;
        throw error;
      });
      if (stamping) stamps.floor = creationClockFloor(lastOf(began));
      let result: T;
      try {
        result = await running.run(scope, () => handler(drizzle({ client: tracked as unknown as pg.PoolClient }), stamps));
        const refused = scope.network ?? scope.networkBehind;
        if (refused) throw refused;
      } catch (error) {
        scope.open = false;
        await client.query("ROLLBACK").catch((rollbackError: unknown) => (broken ??= rollbackError));
        throw scope.network ?? scope.networkBehind ?? error;
      }
      scope.open = false;
      // A handler that caught the lost connection and went on: COMMIT is never sent on it, so nothing committed.
      if (lost !== undefined) throw lost;
      // Only a transaction still able to commit moves the clock; an aborted one answers COMMIT with ROLLBACK below.
      const advance = stamps.highest !== undefined && aborted === undefined ? `${advanceCreationClock(stamps.highest)}; ` : "";
      committing = true;
      const committed = await client.query(`${advance}COMMIT`).catch((error: unknown) => {
        // The connection may be gone even when Postgres answered: a session ended at COMMIT answers 57P01 first. A
        // failed advance drops it too, and with it any lock the advance held, and the transaction it left aborted.
        broken ??= error;
        // A statement the handler left running failed after it returned, so the advance found the transaction aborted:
        // that statement's failure is the answer, as COMMIT's ROLLBACK would have given it, so a serialization failure
        // still retries.
        if (hasSqlState(error) && error.code === "25P02" && aborted !== undefined) throw wentOnAfter(aborted);
        throw error;
      });
      const commit = lastOf(committed);
      // On an aborted transaction Postgres answers COMMIT with ROLLBACK: the handler went on after a failed statement.
      if (commit.command !== "COMMIT") throw wentOnAfter(aborted);
      return result;
    } catch (error) {
      // `lost` is only ever set before COMMIT is sent.
      if (lost !== undefined) markRanNothing(error);
      throw error;
    } finally {
      scope.open = false;
      client.removeListener("error", onError);
      client.release(broken !== undefined);
    }
  }

  // Runs an operation's attempts: again, after a jittered wait, when an attempt did nothing that committed, up to
  // `maxAttempts`; every other failure is the operation's answer.
  async function attempts<T>(name: string, kind: "mutation" | "query", attempt: () => Promise<T>): Promise<T> {
    for (let count = 1; ; count++) {
      try {
        return await attempt();
      } catch (error) {
        const fields = errorFields(error);
        const again = (fields.code !== undefined && retryable.has(fields.code)) || (error instanceof Object && ranNothing.has(error));
        if (!again) return failed(name, kind, error);
        if (count >= maxAttempts) {
          log.error(`${kind} retries exhausted`, { operation: name, attempts: count, ...fields });
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(count)));
      }
    }
  }

  const operations: Operations = {
    async mutation(name, handler) {
      const now = clock.now();
      return attempts(name, "mutation", () =>
        inTransaction(
          name,
          "BEGIN ISOLATION LEVEL SERIALIZABLE",
          (tx, stamps) => {
            const stamp = () => newRow(now, stamps);
            const jobs = createScheduler(tx, now, stamp);
            return handler({ tx, now, newRow: stamp, jobs, publish: (event) => publish(jobs, subscribers, event) });
          },
          { stamping: true },
        ),
      );
    },
    async query(name, handler) {
      const now = clock.now();
      return attempts(name, "query", () => inTransaction(name, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", (tx) => handler({ tx, now })));
    },
    async action(name, handler) {
      try {
        refuseNesting(name);
        return await handler({ clock, run: operations });
      } catch (error) {
        return failed(name, "action", error);
      }
    },
  };
  return operations;
}

function refuseNesting(name: string): void {
  const outer = running.getStore();
  if (!outer?.open) return;
  const error = new Error(`"${name}" was started inside "${outer.name}"; call the shared code directly, or run both from an action`);
  error.name = "NestedOperationError";
  throw error;
}

/**
 * What a statement's first words make it: one that begins or ends a transaction (`begin`, `start transaction`,
 * `commit`, `end`, `abort`, `rollback`, `prepare transaction`, `commit prepared`), a rollback to a savepoint, or any
 * other. Only whitespace, comments and empty statements (`;`) can come before a statement's first word, and Postgres
 * allows comments between its words, so those are all this reads past.
 */
function statementKind(text: string): "transaction" | "rollback to savepoint" | "other" {
  const words: string[] = [];
  let i = 0;
  while (words.length < 3 && i < text.length) {
    if (/[ \t\n\r\f\v;]/.test(text[i]!) && words.length === 0) i += 1; // Postgres skips empty statements before it
    else if (/[ \t\n\r\f\v]/.test(text[i]!)) i += 1;
    else if (text.startsWith("--", i)) while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i += 1;
    else if (text.startsWith("/*", i)) {
      let depth = 0;
      do {
        if (text.startsWith("/*", i)) (depth += 1), (i += 2);
        else if (text.startsWith("*/", i)) (depth -= 1), (i += 2);
        else i += 1;
      } while (depth > 0 && i < text.length);
    } else {
      const word = /^[A-Za-z_]+/.exec(text.slice(i))?.[0];
      if (!word) break;
      words.push(word.toLowerCase());
      i += word.length;
    }
  }
  const [first, second, third] = words;
  if (first === "rollback") {
    const to = second === "to" || ((second === "work" || second === "transaction") && third === "to");
    return to ? "rollback to savepoint" : "transaction";
  }
  if (first === "prepare") return second === "transaction" ? "transaction" : "other";
  return first !== undefined && ["begin", "start", "commit", "end", "abort"].includes(first) ? "transaction" : "other";
}

function operationEnded(name: string): Error {
  const error = new Error(`"${name}" has ended; work it left behind runs its own operation, not its transaction`);
  error.name = "OperationEndedError";
  return error;
}

function transactionOwned(name: string): Error {
  const error = new Error(`"${name}" tried to begin or end its transaction, which is the runner's; use a savepoint inside it`);
  error.name = "TransactionOwnedError";
  return error;
}

// The handler caught a failed statement and went on; the error carries that statement's SQLSTATE, so a serialization
// failure it hid is still retried, and anything else is logged by its code.
function wentOnAfter(aborted: unknown): Error {
  const error = new Error("The operation went on after a failed statement, so its transaction rolled back", { cause: aborted });
  return Object.assign(error, { code: hasSqlState(aborted) ? aborted.code : "25P02" });
}

function markRanNothing(error: unknown): void {
  if (error instanceof Object) ranNothing.add(error);
}

// An error Postgres answered with, as opposed to one of the connection's.
function hasSqlState(error: unknown): error is pg.DatabaseError & { code: string } {
  return error instanceof pg.DatabaseError && typeof error.code === "string";
}

function jitteredBackoff(attempt: number): number {
  return Math.min(5 * 2 ** attempt, 500) * (0.5 + Math.random() / 2);
}

/** The next float64 above `value`. */
function nextAfter(value: number): number {
  if (!Number.isFinite(value)) return value;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  view.setBigUint64(0, value >= 0 ? bits + 1n : bits - 1n);
  return value === 0 ? Number.MIN_VALUE : view.getFloat64(0);
}
