import { serve, type ServerType } from "@hono/node-server";
import { createClock, type Clock } from "./clock.ts";
import { readCommit } from "./commit.ts";
import { runMigrations } from "./db/migrate.ts";
import { createPool } from "./db/pool.ts";
import { createApp, type Migrations } from "./http/app.ts";
import type { JobRegistry } from "./jobs/define.ts";
import { createWorker, type Worker } from "./jobs/worker.ts";
import { errorFields, jsonLog, type Log } from "./log.ts";
import { createOperations, type Operations } from "./operations.ts";

export interface BootOptions {
  env: NodeJS.ProcessEnv;
  log?: Log;
  /** How long to wait before trying the migrations again after a failure. */
  retryMs?: number;
  /** How long a database connection may take, handshake included, before the attempt fails and is retried. */
  connectTimeoutMs?: number;
  /** How long `stop` waits for the database's connections to close before it gives up on them. */
  stopTimeoutMs?: number;
  /** Every job the worker can run, the crons' included. */
  registry?: JobRegistry;
  /** How long `stop` lets running jobs finish, within the host's grace period after SIGTERM. */
  jobGraceMs?: number;
  /** How often the worker looks for due jobs and crons. */
  pollMs?: number;
}

export interface Service {
  port: number;
  /** Resolves once the migrations are done; never resolves without a database. */
  migrated: Promise<void>;
  clock: Clock;
  /** The operation runner, when a database is set. */
  operations: Operations | undefined;
  /** The job worker, when a database is set; it starts once the migrations are done, unless the app is off. */
  worker: Worker | undefined;
  stop(): Promise<void>;
}

/**
 * Starts the service: listens on `0.0.0.0:$PORT` at once, then brings the database up to date.
 * `/healthz` answers from the first moment; every other route answers 503 until the migrations are done.
 */
export async function boot({
  env,
  log = jsonLog(),
  retryMs = 5_000,
  connectTimeoutMs = 10_000,
  stopTimeoutMs = 5_000,
  registry = new Map(),
  jobGraceMs = 20_000,
  pollMs,
}: BootOptions): Promise<Service> {
  const databaseUrl = env.DATABASE_URL || undefined;
  const off = env.HEDGEHUG_OFF === "1" || env.HEDGEHUG_OFF === "true";
  let migrations: Migrations = databaseUrl ? "pending" : "no-database";
  let stopping = false;

  const clock = createClock();
  const pool = databaseUrl ? createPool(databaseUrl, { connectTimeoutMs }) : undefined;
  pool?.on("error", (error) => log.error("database connection lost", errorFields(error)));
  const operations = pool ? createOperations({ pool, clock, log }) : undefined;
  const held = () => false; // the load's hold: S18's load control (PostHog/kudos#903) answers this
  const worker = operations ? createWorker({ operations, log, registry, held, ...(pollMs ? { pollMs } : {}) }) : undefined;

  const testSecret = env.HEDGEHUG_TEST_SECRET || undefined;
  const app = createApp({
    commit: readCommit(env),
    readiness: { migrations: () => migrations, held },
    off,
    log,
    clock,
    ...(testSecret ? { testSecret } : {}),
    ...(worker ? { worker } : {}),
  });
  const server = await listen(app.fetch, Number(env.PORT ?? 8080));
  const port = (server.address() as { port: number }).port;
  log.info("listening", { port, migrations, off });

  const migrated = new Promise<void>((resolve) => {
    if (!pool) return;
    const attempt = async () => {
      if (stopping) return;
      try {
        await runMigrations(pool);
        migrations = "done";
        log.info("migrations done");
        resolve();
        if (worker && !off) startWorker(worker);
      } catch (error) {
        log.error("migrations failed, retrying", { ...errorFields(error), retryMs });
        setTimeout(attempt, retryMs).unref();
      }
    };
    void attempt();
  });

  // The crons' first runs are written before the worker polls; a failure tries again like the migrations.
  function startWorker(worker: Worker): void {
    if (stopping) return;
    worker.start().then(
      () => log.info("worker started"),
      (error: unknown) => {
        log.error("worker start failed, retrying", { ...errorFields(error), retryMs });
        setTimeout(() => startWorker(worker), retryMs).unref();
      },
    );
  }

  return {
    port,
    migrated,
    clock,
    operations,
    worker,
    async stop() {
      stopping = true;
      // Take no new job, and let the running ones finish while the connections are still open.
      await worker?.stop(jobGraceMs);
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      // A connection stuck mid-query would hold `end` forever; the process exits after `stop` either way.
      if (pool) await Promise.race([pool.end(), new Promise((resolve) => setTimeout(resolve, stopTimeoutMs).unref())]);
    },
  };
}

function listen(fetch: (request: Request) => Response | Promise<Response>, port: number): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch, port, hostname: "0.0.0.0" }, () => resolve(server));
    server.once("error", reject);
  });
}
