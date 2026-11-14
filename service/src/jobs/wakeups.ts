// Wakes the worker when a due job commits. `enqueue` notifies its schema's channel in the caller's transaction, which
// Postgres delivers only on commit, and a listener on a connection of its own ticks the worker; the worker's poll stays
// the fallback, so a lost listener only delays jobs until it is back. Copies on other schemas never wake each other.
// The same connection hears the live channel (live.ts): one listener per process wakes both the worker and live views.
import { sql } from "drizzle-orm";
import type pg from "pg";
import { errorFields, type Log } from "../log.ts";
import { liveChannel } from "../live.ts";
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

/** What a wake on each channel calls: `jobs` when a due job commits, `live` when a write a website view shows commits. */
export interface Wakes {
  jobs?: () => void;
  live?: () => void;
}

/**
 * Calls the channel's wake on each notify, and every wake each time it starts listening, for what committed while it
 * did not. It holds one connection of `pool`'s for as long as it listens.
 */
export function listenForWakes({ pool, log, wakes, retryMs = 5_000 }: { pool: Pick<pg.Pool, "connect">; log: Log; wakes: Wakes; retryMs?: number }): Listener {
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
      const { rows } = await connection.query<{ schema: string }>("select current_schema() as schema");
      const schema = rows[0]!.schema;
      const channels = new Map([
        [liveChannel(schema), wakes.live],
        [jobsChannel(schema), wakes.jobs],
      ]);
      connection.on("notification", ({ channel }) => channels.get(channel)?.());
      for (const channel of channels.keys()) await connection.query(`listen "${channel.replaceAll('"', '""')}"`);
      listened();
      wakes.live?.();
      wakes.jobs?.();
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
