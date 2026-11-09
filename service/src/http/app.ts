import { Hono } from "hono";
import type { LoadControl } from "../load/control.ts";
import type { Log } from "../log.ts";

/**
 * Where the database is on its way to serving: `no-database` until a `DATABASE_URL` is set (the host's first boot),
 * `pending` while the migrations run or retry, `done` once the schema is current.
 */
export type Migrations = "no-database" | "pending" | "done";

export interface Readiness {
  migrations(): Migrations;
}

export interface AppOptions {
  /** The commit the image was built from. */
  commit: string;
  readiness: Readiness;
  /** `HEDGEHUG_OFF`: Slack's routes answer 200 and do nothing, everything else answers 503. */
  off: boolean;
  log: Log;
  /** The data load: its hold and, while its token is set, its `/admin/load` routes. */
  load?: Pick<LoadControl, "held" | "routes">;
}

const slackPaths = /^\/slack(\/|$)/;
const loadPaths = /^\/admin\/load(\/|$)/;

export function createApp({ commit, readiness, off, log, load }: AppOptions): Hono {
  const app = new Hono();

  // One line per request: method, path without its query, status and duration. Never a header or a body.
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    log.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    });
  });

  // Answers at once, before the migrations finish, so the host sees the copy alive and a promotion sees its commit.
  app.get("/healthz", (c) => c.json({ commit, migrations: readiness.migrations(), off }));

  app.use(async (c, next) => {
    if (off) return slackPaths.test(c.req.path) ? c.body(null, 200) : unavailable();
    if (readiness.migrations() !== "done") return unavailable();
    if (load?.routes && loadPaths.test(c.req.path)) return next();
    if (load?.held()) return unavailable();
    return next();
  });

  if (load?.routes) app.route("/admin/load", load.routes);

  return app;
}

function unavailable(): Response {
  return new Response("Service unavailable", { status: 503, headers: { "retry-after": "5" } });
}
