// The three kinds of operation the app has, run by one runner:
// - a mutation: one SERIALIZABLE transaction, re-run whole on a serialization failure or a deadlock, with one `now`
//   read before the first attempt and kept across every retry;
// - a query: one REPEATABLE READ READ ONLY transaction, so every read sees one snapshot, with one `now`;
// - an action: no transaction; it reads the clock live and runs mutations and queries through the runner.
// A failure is logged with the operation's name; never its message, which may quote SQL.
import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Clock } from "./clock.ts";
import { errorFields, type Log } from "./log.ts";

export type Database = NodePgDatabase<Record<string, never>>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

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
  db: Database;
  clock: Clock;
  log: Log;
  /** Attempts a mutation gets before a serialization failure or deadlock is its answer. */
  maxAttempts?: number;
  /** The wait before attempt `attempt + 1`: exponential with jitter, so conflicting retries spread out. */
  retryDelayMs?: (attempt: number) => number;
}

// Postgres's serialization failure and deadlock: the transaction did nothing, and running it again may succeed.
const retryable = new Set(["40001", "40P01"]);

export function createOperations({ db, clock, log, maxAttempts = 10, retryDelayMs = jitteredBackoff }: OperationsOptions): Operations {
  let lastCreationTime = Number.NEGATIVE_INFINITY;
  const newRow = (now: number): NewRow => {
    // Rows inserted in one operation keep their order; the step is the smallest that still changes a float64 near now.
    lastCreationTime = Math.max(now, nextAfter(lastCreationTime));
    return { _id: randomUUID(), _creationTime: lastCreationTime };
  };

  const failed = (name: string, kind: string) => (error: unknown) => {
    log.error("operation failed", { operation: name, kind, ...errorFields(error) });
    throw error;
  };

  const operations: Operations = {
    async mutation(name, handler) {
      const now = clock.now();
      for (let attempt = 1; ; attempt++) {
        try {
          return await db.transaction((tx) => handler({ tx, now, newRow: () => newRow(now) }), { isolationLevel: "serializable" });
        } catch (error) {
          const fields = errorFields(error);
          if (!fields.code || !retryable.has(fields.code)) return failed(name, "mutation")(error);
          if (attempt >= maxAttempts) {
            log.error("mutation retries exhausted", { operation: name, attempts: attempt, ...fields });
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
        }
      }
    },
    query(name, handler) {
      const now = clock.now();
      return db.transaction((tx) => handler({ tx, now }), { isolationLevel: "repeatable read", accessMode: "read only" }).catch(failed(name, "query"));
    },
    action(name, handler) {
      return handler({ clock, run: operations }).catch(failed(name, "action"));
    },
  };
  return operations;
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
