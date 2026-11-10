import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { createClock, type Clock } from "./clock.ts";
import { readCommit } from "./commit.ts";
import { runMigrations } from "./db/migrate.ts";
import { createPool } from "./db/pool.ts";
import { configuredHost } from "./analytics/browser.ts";
import { createApp, type Migrations } from "./http/app.ts";
import { listenForWakes, type Listener } from "./jobs/wakeups.ts";
import { createWorker, type Worker } from "./jobs/worker.ts";
import { createLiveFeed } from "./live.ts";
import { createLoadControl } from "./load/control.ts";
import { errorFields, jsonLog, type Log } from "./log.ts";
import { createOperations, type Operations } from "./operations.ts";
import type { Registry } from "./registration.ts";
import { serviceRegistry } from "./registry.ts";
import { createFrontDoor } from "./slack/frontDoor.ts";
import { websiteFiles } from "./website/hosting.ts";

/** Where the image puts the website's build (the Dockerfile); `HEDGEHUG_WEBSITE_DIR` names another, as a local run's. */
const builtWebsite = fileURLToPath(new URL("../website", import.meta.url));

export interface BootOptions {
  env: NodeJS.ProcessEnv;
  log?: Log;
  /** How long to wait before trying the migrations again after a failure. */
  retryMs?: number;
  /** How long a database connection may take, handshake included, before the attempt fails and is retried. */
  connectTimeoutMs?: number;
  /** How long `stop` waits for the database's connections to close before it gives up on them. */
  stopTimeoutMs?: number;
  /** What the domains registered: jobs, the crons' included, bus subscribers, Slack handlers and website routes. */
  registry?: Registry;
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
  registry = serviceRegistry,
  jobGraceMs = 20_000,
  pollMs,
}: BootOptions): Promise<Service> {
  const databaseUrl = env.DATABASE_URL || undefined;
  const off = env.HEDGEHUG_OFF === "1" || env.HEDGEHUG_OFF === "true";
  let migrations: Migrations = databaseUrl ? "pending" : "no-database";
  let stopping = false;
  let wakeups: Listener | undefined;
  let workerStarted = false;

  const clock = createClock();
  const pool = databaseUrl ? createPool(databaseUrl, { connectTimeoutMs }) : undefined;
  pool?.on("error", (error) => log.error("database connection lost", errorFields(error)));
  // The listener's one connection, beside the pool's: a live view never takes one of the pool's.
  const listenerPool = databaseUrl ? createPool(databaseUrl, { max: 1, connectTimeoutMs }) : undefined;
  listenerPool?.on("error", (error) => log.error("database connection lost", errorFields(error)));
  const live = createLiveFeed();
  const load = pool ? createLoadControl({ pool, token: env.HEDGEHUG_ADMIN_TOKEN || undefined, log, jobs: registry.jobs, now: clock.now }) : undefined;
  const operations = pool ? createOperations({ pool, clock, log, subscribers: registry.subscribers }) : undefined;
  // While a load holds, no cron is written or fired and no job starts.
  const worker = operations && load ? createWorker({ operations, log, registry: registry.jobs, held: load.held, ...(pollMs ? { pollMs } : {}) }) : undefined;

  const testSecret = env.HEDGEHUG_TEST_SECRET || undefined;
  const slack = createFrontDoor({ signingSecret: env.SLACK_SIGNING_SECRET || undefined, clock, off, log, ...(operations ? { operations } : {}), handlers: registry.slack });
  const app = createApp({
    commit: readCommit(env),
    readiness: { migrations: () => migrations },
    off,
    log,
    clock,
    ...(testSecret ? { testSecret } : {}),
    ...(worker ? { worker } : {}),
    ...(load ? { load } : {}),
    slack,
    // Without a database no domain route could answer: the gate holds every one at 503.
    routes: operations ? registry.routes.map((routes) => routes({ operations, clock, log, live })) : [],
    website: websiteFiles({ dir: env.HEDGEHUG_WEBSITE_DIR || builtWebsite, postHogHost: () => configuredHost() ?? undefined }),
  });
  const server = await listen(app.fetch, Number(env.PORT ?? 8080));
  const port = (server.address() as { port: number }).port;
  log.info("listening", { port, migrations, off });

  const migrated = new Promise<void>((resolve) => {
    if (!pool) return;
    const attempt = async () => {
      if (stopping) return;
      try {
        // Reads the load's state first, so a held copy holds while it migrates, even with HEDGEHUG_OFF.
        await load!.refresh();
        await runMigrations(pool);
        await load!.refresh();
        migrations = "done";
        load!.resume();
        log.info("migrations done");
        resolve();
        if (off) return;
        // A due job wakes the worker once its transaction commits, and a shown write the live views; the poll stays the
        // worker's fallback, and a view refetches everything after the listener listens again.
        // A job's wake before the worker has started ticks nothing; the worker ticks again once it has.
        const jobs = () => void (workerStarted && worker?.tick());
        if (!stopping && listenerPool) wakeups = listenForWakes({ pool: listenerPool, log, retryMs, wakes: { jobs, live: () => live.invalidate() } });
        if (worker) startWorker(worker);
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
      () => {
        log.info("worker started");
        workerStarted = true;
        // For a wake that came while it started, after its first tick had looked.
        if (!stopping) void worker.tick();
      },
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
      load?.stop();
      // Take no new job, and let the running ones finish while the connections are still open. Open live views end, or
      // the server would wait on them.
      wakeups?.stop();
      live.end();
      await worker?.stop(jobGraceMs);
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      // A connection stuck mid-query would hold `end` forever; the process exits after `stop` either way.
      const ending = [pool, listenerPool].flatMap((each) => (each ? [each.end()] : []));
      await Promise.race([Promise.all(ending), new Promise((resolve) => setTimeout(resolve, stopTimeoutMs).unref())]);
    },
  };
}

function listen(fetch: (request: Request) => Response | Promise<Response>, port: number): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch, port, hostname: "0.0.0.0" }, () => resolve(server));
    server.once("error", reject);
  });
}
