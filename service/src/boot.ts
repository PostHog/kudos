import { serve, type ServerType } from "@hono/node-server";
import pg from "pg";
import { readCommit } from "./commit.ts";
import { runMigrations } from "./db/migrate.ts";
import { createApp, type Migrations } from "./http/app.ts";
import { errorFields, jsonLog, type Log } from "./log.ts";

export interface BootOptions {
  env: NodeJS.ProcessEnv;
  log?: Log;
  /** How long to wait before trying the migrations again after a failure. */
  retryMs?: number;
  /** How long a database connection may take, handshake included, before the attempt fails and is retried. */
  connectTimeoutMs?: number;
  /** How long `stop` waits for the database's connections to close before it gives up on them. */
  stopTimeoutMs?: number;
}

export interface Service {
  port: number;
  /** Resolves once the migrations are done; never resolves without a database. */
  migrated: Promise<void>;
  stop(): Promise<void>;
}

/**
 * Starts the service: listens on `0.0.0.0:$PORT` at once, then brings the database up to date.
 * `/healthz` answers from the first moment; every other route answers 503 until the migrations are done.
 */
export async function boot({ env, log = jsonLog(), retryMs = 5_000, connectTimeoutMs = 10_000, stopTimeoutMs = 5_000 }: BootOptions): Promise<Service> {
  const databaseUrl = env.DATABASE_URL || undefined;
  const off = env.HEDGEHUG_OFF === "1" || env.HEDGEHUG_OFF === "true";
  let migrations: Migrations = databaseUrl ? "pending" : "no-database";
  let stopping = false;

  const app = createApp({ commit: readCommit(env), readiness: { migrations: () => migrations }, off, log });
  const server = await listen(app.fetch, Number(env.PORT ?? 8080));
  const port = (server.address() as { port: number }).port;
  log.info("listening", { port, migrations, off });

  const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: connectTimeoutMs }) : undefined;
  pool?.on("error", (error) => log.error("database connection lost", errorFields(error)));

  const migrated = new Promise<void>((resolve) => {
    if (!pool) return;
    const attempt = async () => {
      if (stopping) return;
      try {
        await runMigrations(pool);
        migrations = "done";
        log.info("migrations done");
        resolve();
      } catch (error) {
        log.error("migrations failed, retrying", { ...errorFields(error), retryMs });
        setTimeout(attempt, retryMs).unref();
      }
    };
    void attempt();
  });

  return {
    port,
    migrated,
    async stop() {
      stopping = true;
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
