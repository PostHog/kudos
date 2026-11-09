// The three kinds of operation the app has, run by one runner:
// - a mutation: one SERIALIZABLE transaction, re-run whole on a serialization failure or a deadlock, with one `now`
//   read before the first attempt and kept across every retry;
// - a query: one REPEATABLE READ READ ONLY transaction, so every read sees one snapshot, with one `now`;
// - an action: no transaction; it reads the clock live and runs mutations and queries through the runner.
// A mutation or query never runs another: the inner one would commit on its own, outside the outer's transaction.
// The transaction is the runner's: a handler can't begin, commit or roll it back, only use savepoints inside it.
// A failure is logged with the operation's name; never its message, which may quote SQL.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { publish, type DomainEvent, type Subscribers } from "./bus/publish.ts";
import type { Clock } from "./clock.ts";
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
  /** Stamps a new row from the operation's instant; each call strictly after the last in this process. */
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

// Postgres's serialization failure and deadlock: the transaction did nothing, and running it again may succeed.
const retryable = new Set(["40001", "40P01"]);

// The runner sends each handler statement on its own (pg's extended protocol), so Postgres refuses a text of several,
// and a statement's first words decide whether it begins or ends a transaction.

// The mutation or query whose transaction is open, so another one started inside it is refused. Work its handler
// left behind keeps the store after the operation ends; `open` turns false then, and nothing is refused.
const running = new AsyncLocalStorage<{ name: string; open: boolean }>();

export function createOperations({ pool, clock, log, maxAttempts = 10, retryDelayMs = jitteredBackoff, subscribers = new Map() }: OperationsOptions): Operations {
  let lastCreationTime = Number.NEGATIVE_INFINITY;
  const newRow = (now: number): NewRow => {
    // Rows inserted in one operation keep their order; the step is the smallest that still changes a float64 near now.
    lastCreationTime = Math.max(now, nextAfter(lastCreationTime));
    return { _id: randomUUID(), _creationTime: lastCreationTime };
  };

  const failed = (name: string, kind: string, error: unknown): never => {
    log.error("operation failed", { operation: name, kind, ...errorFields(error) });
    throw error;
  };

  // One transaction on a connection of its own, which always goes back to the pool: dropped when the connection may
  // be broken, kept when the transaction ended cleanly either way.
  async function inTransaction<T>(name: string, begin: string, handler: (tx: Transaction) => Promise<T>): Promise<T> {
    refuseNesting(name);
    const client = await pool.connect();
    let broken: unknown;
    // A checked-out client has no listener of the pool's; without one, a dropped connection would crash the process.
    const onError = (error: unknown) => (broken ??= error);
    client.on("error", onError);
    // The first statement Postgres failed. It aborts the transaction on it, even when the handler catches it; pg's own
    // refusals, such as a prepared statement's name used twice, never reach Postgres and abort nothing.
    let aborted: unknown;
    // Open while the handler runs; work it left behind then finds its transaction gone, never a pooled connection.
    const scope = { name, open: true };
    const tracked = {
      query: (...args: Parameters<pg.PoolClient["query"]>) => {
        if (!scope.open) return Promise.reject(operationEnded(name));
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
            if (!hasSqlState(error)) throw error;
            // Every statement after a failed one answers 25P02; the failure the handler went on after is the answer.
            if (error.code === "25P02" && aborted !== undefined) throw wentOnAfter(aborted);
            aborted ??= error;
            throw error;
          },
        );
      },
    };
    try {
      await client.query(begin).catch((error: unknown) => {
        broken ??= error;
        throw error;
      });
      let result: T;
      try {
        result = await running.run(scope, () => handler(drizzle({ client: tracked as unknown as pg.PoolClient })));
      } catch (error) {
        scope.open = false;
        await client.query("ROLLBACK").catch((rollbackError: unknown) => (broken ??= rollbackError));
        throw error;
      }
      scope.open = false;
      const commit = await client.query("COMMIT").catch((error: unknown) => {
        // The connection may be gone even when Postgres answered: a session ended at COMMIT answers 57P01 first.
        broken ??= error;
        throw error;
      });
      // On an aborted transaction Postgres answers COMMIT with ROLLBACK: the handler went on after a failed statement.
      if (commit.command !== "COMMIT") throw wentOnAfter(aborted);
      return result;
    } finally {
      scope.open = false;
      client.removeListener("error", onError);
      client.release(broken !== undefined);
    }
  }

  const operations: Operations = {
    async mutation(name, handler) {
      const now = clock.now();
      for (let attempt = 1; ; attempt++) {
        try {
          return await inTransaction(name, "BEGIN ISOLATION LEVEL SERIALIZABLE", (tx) => {
            const stamp = () => newRow(now);
            const jobs = createScheduler(tx, now, stamp);
            return handler({ tx, now, newRow: stamp, jobs, publish: (event) => publish(jobs, subscribers, event) });
          });
        } catch (error) {
          const fields = errorFields(error);
          if (!fields.code || !retryable.has(fields.code)) return failed(name, "mutation", error);
          if (attempt >= maxAttempts) {
            log.error("mutation retries exhausted", { operation: name, attempts: attempt, ...fields });
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
        }
      }
    },
    async query(name, handler) {
      const now = clock.now();
      try {
        return await inTransaction(name, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", (tx) => handler({ tx, now }));
      } catch (error) {
        return failed(name, "query", error);
      }
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
