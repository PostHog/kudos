import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Clock } from "../clock.ts";
import { isCronId } from "../jobs/crons.ts";
import type { Settled, Worker } from "../jobs/worker.ts";
import type { LoadControl } from "../load/control.ts";
import { errorFields, type Log } from "../log.ts";

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
  /** The app's clock, which `/testing/time` moves. */
  clock: Clock;
  /** `HEDGEHUG_TEST_SECRET`: mounts `/testing/time` for requests that carry it. Local and CI only. */
  testSecret?: string;
  /** The worker `/testing/time` runs crons and due jobs on; without one, nothing is due. */
  worker?: Pick<Worker, "settle" | "runCron">;
  /** How long `/testing/time` may work before it answers, under the host's 30 s wait for response headers. */
  timeBudgetMs?: number;
  /** The data load: its hold and, while its token is set, its `/admin/load` routes. */
  load?: Pick<LoadControl, "held" | "routes">;
  /** Slack's front door, mounted at `/slack`. Without it, Slack's routes answer only `HEDGEHUG_OFF`'s 200. */
  slack?: Hono;
  /** The domains' website routes, mounted at the root behind the gate, after the app's own paths. */
  routes?: Hono[];
}

const slackPaths = /^\/slack(\/|$)/;
const loadPaths = /^\/admin\/load(\/|$)/;

export function createApp({ commit, readiness, off, log, clock, testSecret, worker, timeBudgetMs = 25_000, load, slack, routes = [] }: AppOptions): Hono {
  const app = new Hono();

  // One line per request: method, path without its query, status and duration. Never a header or a body.
  // Hono's error hooks see only Errors: anything else thrown ends here, as a 500 logged by its kind alone.
  app.use(async (c, next) => {
    const started = performance.now();
    const path = c.req.path;
    try {
      await next();
    } catch (error) {
      log.error("request failed", { path, ...errorFields(error) });
      c.res = undefined;
      c.res = new Response("Internal Server Error", { status: 500 });
    }
    const { body, status, statusText, headers } = c.res;
    if (body) {
      c.res = undefined;
      c.res = new Response(
        failingQuietly(body, (error) => log.error("response body failed", { path, ...errorFields(error) })),
        { status, statusText, headers },
      );
    }
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
    const migrated = readiness.migrations() === "done";
    // A load's hold wins over HEDGEHUG_OFF, before the migrations too: Slack hears 503 and retries rather than an
    // acknowledgement. Only the admin path passes it, once the migrations are done.
    if (load?.held() && !(migrated && load.routes && loadPaths.test(c.req.path))) return unavailable();
    // Off, the front door answers Slack: 401 to a request Slack didn't sign, the challenge, and 200 to the rest.
    if (off) return !slackPaths.test(c.req.path) ? unavailable() : slack ? next() : c.body(null, 200);
    if (!migrated) return unavailable();
    return next();
  });

  if (load?.routes) app.route("/admin/load", load.routes);

  if (testSecret) mountTestingTime(app, testSecret, clock, worker, timeBudgetMs);

  if (slack) app.route("/slack", slack);
  // The app's own paths: a domain's route never answers them, whatever the front door, the seam or the load mounted.
  for (const reserved of ["/healthz", "/slack", "/slack/*", "/testing/*", "/admin/load", "/admin/load/*"]) app.all(reserved, (c) => c.notFound());
  for (const domainRoutes of routes) app.route("/", domainRoutes);

  // A failure answers 500; the log names the path and the error's class and code, never its message, which may quote
  // SQL parameters or a member's words. Hono's default would print the whole error.
  app.onError((error, c) => {
    log.error("request failed", { path: c.req.path, ...errorFields(error) });
    return c.text("Internal Server Error", 500);
  });

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

/**
 * The body as it streams, except that a failure mid-stream is logged by `onError` and ends the stream with an error
 * of ours: the server prints what ends a response, and the original may quote SQL parameters or a member's words.
 */
function failingQuietly(body: ReadableStream<Uint8Array>, onError: (error: unknown) => void): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        onError(error);
        controller.error(new Error("The response's body failed"));
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

// Equal-length digests, so the comparison takes the same time whatever the header's length.
function digest(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

function unavailable(): Response {
  return new Response("Service unavailable", { status: 503, headers: { "retry-after": "5" } });
}
