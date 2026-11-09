// Wakes the worker when a due job commits. `enqueue` notifies its schema's channel in the caller's transaction, which
// Postgres delivers only on commit, and a listener on a connection of its own ticks the worker; the worker's poll stays
// the fallback, so a lost listener only delays jobs until it is back. Copies on other schemas never wake each other.
import { sql } from "drizzle-orm";
import type pg from "pg";
import { errorFields, type Log } from "../log.ts";
import type { Transaction } from "../operations.ts";

/** The channel that wakes the workers of this schema's jobs. */
export function jobsChannel(schema: string): string {
  return `jobs.${schema}`;
}

/** Wakes the listening workers once the caller's transaction commits; Postgres sends one per transaction. */
export async function notifyDue(tx: Transaction): Promise<void> {
  await tx.execute(sql`select pg_notify('jobs.' || current_schema(), '')`);
}

export interface Listener {
  /** Resolves once the listener first listens. */
  listening: Promise<void>;
  /** Stops listening and gives its connection back. */
  stop(): void;
}

/** Calls `onDue` on each wake, and once each time it starts listening, for jobs that came due while it did not. */
export function listenForDueJobs({ pool, log, onDue, retryMs = 5_000 }: { pool: Pick<pg.Pool, "connect">; log: Log; onDue: () => void; retryMs?: number }): Listener {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let drop: (() => void) | undefined;
  let listened!: () => void;
  const listening = new Promise<void>((resolve) => (listened = resolve));

  async function listen(): Promise<void> {
    let connection: pg.PoolClient | undefined;
    let released = false;
    // Destroys the connection, once; its LISTEN ends with it.
    const release = () => {
      if (!connection || released) return;
      released = true;
      connection.release(true);
    };
    drop = release;
    // A dropped connection reports an error, its end or both, a failed connect neither: each loss retries once.
    const lost = (error?: unknown) => {
      const first = !released;
      release();
      if (!first || stopped) return;
      log.info("job wakeups lost, polling until they are back", { retryMs, ...(error === undefined ? {} : errorFields(error)) });
      timer = setTimeout(() => void listen(), retryMs).unref();
    };
    try {
      connection = await pool.connect();
      if (stopped) return release();
      connection.on("error", lost);
      connection.on("end", lost);
      connection.on("notification", onDue);
      const { rows } = await connection.query<{ schema: string }>("select current_schema() as schema");
      await connection.query(`listen "${jobsChannel(rows[0]!.schema).replaceAll('"', '""')}"`);
      listened();
      onDue();
    } catch (error) {
      lost(error);
    }
  }

  void listen();
  return {
    listening,
    stop() {
      stopped = true;
      clearTimeout(timer);
      drop?.();
    },
  };
}
