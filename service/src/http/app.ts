import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Clock } from "../clock.ts";
import { isCronId } from "../jobs/crons.ts";
import type { Settled, Worker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";

/**
 * Where the database is on its way to serving: `no-database` until a `DATABASE_URL` is set (the host's first boot),
 * `pending` while the migrations run or retry, `done` once the schema is current.
 */
export type Migrations = "no-database" | "pending" | "done";

export interface Readiness {
  migrations(): Migrations;
  /** The load's hold (S18): every route but `/healthz` answers 503, Slack's too, even with `HEDGEHUG_OFF`. */
  held?(): boolean;
}

export interface AppOptions {
  /** The commit the image was built from. */
  commit: string;
  readiness: Readiness;
  /** `HEDGEHUG_OFF`: Slack's routes answer 200 and do nothing, everything else answers 503. */
  off: boolean;
  log: Log;
  /** The app's clock, which `/testing/time` moves. */
  clock: Clock;
  /** `HEDGEHUG_TEST_SECRET`: mounts `/testing/time` for requests that carry it. Local and CI only. */
  testSecret?: string;
  /** The worker `/testing/time` runs crons and due jobs on; without one, nothing is due. */
  worker?: Pick<Worker, "settle" | "runCron">;
  /** How long `/testing/time` may work before it answers, under the host's 30 s wait for response headers. */
  timeBudgetMs?: number;
}

const slackPaths = /^\/slack(\/|$)/;

export function createApp({ commit, readiness, off, log, clock, testSecret, worker, timeBudgetMs = 25_000 }: AppOptions): Hono {
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
    if (readiness.held?.()) return unavailable();
    if (off) return slackPaths.test(c.req.path) ? c.body(null, 200) : unavailable();
    if (readiness.migrations() !== "done") return unavailable();
    return next();
  });

  if (testSecret) mountTestingTime(app, testSecret, clock, worker, timeBudgetMs);

  return app;
}

/**
 * The E2E suite's time seam (#95). One of:
 * - `{"advance": ms}` moves the clock forward; due jobs run on the worker's own time;
 * - `{"runCron": id}` runs the cron's job once at the app's clock, then settles;
 * - `{"settle": true}` runs every job due by the app's clock, and those they make due, until none is due or running.
 * It answers `{"now", "ran"}` once done, or 504 with what ran when the budget runs out first.
 * A request without the secret gets the 404 any unknown path gets, so the route can't be told apart from absent.
 */
function mountTestingTime(app: Hono, secret: string, clock: Clock, worker: AppOptions["worker"], budgetMs: number): void {
  const expected = digest(secret);
  app.post("/testing/time", async (c) => {
    const given = c.req.header("x-hedgehug-test-secret");
    if (given === undefined || !timingSafeEqual(digest(given), expected)) return c.notFound();
    const body: unknown = await c.req.json().catch(() => undefined);
    const fields = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const keys = Object.keys(fields);
    const refused = (error: string, status: 400 | 409 = 400) => c.json({ error }, status);
    if (keys.length !== 1) return refused('expected {"advance": ms}, {"runCron": id} or {"settle": true}');

    if (keys[0] === "advance") {
      const { advance } = fields;
      if (typeof advance !== "number" || !Number.isFinite(advance) || advance < 0) return refused("advance takes a finite number of milliseconds, zero or more");
      try {
        return c.json({ now: clock.advance(advance), ran: [] });
      } catch (error) {
        if (error instanceof RangeError) return refused("that step takes the clock past the last instant a date can hold");
        throw error;
      }
    }

    let settled: Settled | undefined;
    if (keys[0] === "runCron") {
      const { runCron } = fields;
      if (!isCronId(runCron)) return refused("runCron takes one of the time seam's cron ids");
      settled = worker ? await worker.runCron(runCron, budgetMs) : undefined;
      if (!settled) return refused(`no job is registered as ${runCron} yet`, 409);
    } else if (keys[0] === "settle" && fields.settle === true) {
      settled = worker ? await worker.settle(budgetMs) : { ran: [], done: true };
    } else {
      return refused('expected {"advance": ms}, {"runCron": id} or {"settle": true}');
    }
    const answer = { now: clock.now(), ran: settled.ran };
    return settled.done ? c.json(answer) : c.json({ ...answer, error: `jobs were still due or running after ${budgetMs} ms` }, 504);
  });
}

// Equal-length digests, so the comparison takes the same time whatever the header's length.
function digest(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

function unavailable(): Response {
  return new Response("Service unavailable", { status: 503, headers: { "retry-after": "5" } });
}
