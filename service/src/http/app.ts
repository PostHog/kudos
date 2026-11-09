import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Clock } from "../clock.ts";
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
  /** The app's clock, which `/testing/time` moves. */
  clock: Clock;
  /** `HEDGEHUG_TEST_SECRET`: mounts `/testing/time` for requests that carry it. Local and CI only. */
  testSecret?: string;
}

const slackPaths = /^\/slack(\/|$)/;

export function createApp({ commit, readiness, off, log, clock, testSecret }: AppOptions): Hono {
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
    return next();
  });

  if (testSecret) mountTestingTime(app, testSecret, clock);

  return app;
}

/**
 * The E2E suite's time seam (#95): `{"advance": ms}` moves the clock; `runCron` and `settle` arrive with the jobs.
 * A request without the secret gets the 404 any unknown path gets, so the route can't be told apart from absent.
 */
function mountTestingTime(app: Hono, secret: string, clock: Clock): void {
  const expected = digest(secret);
  app.post("/testing/time", async (c) => {
    const given = c.req.header("x-hedgehug-test-secret");
    if (given === undefined || !timingSafeEqual(digest(given), expected)) return c.notFound();
    const body: unknown = await c.req.json().catch(() => undefined);
    const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
    const advance = (body as { advance?: unknown } | undefined)?.advance;
    if (keys.length !== 1 || keys[0] !== "advance" || typeof advance !== "number" || !Number.isFinite(advance) || advance < 0) {
      return c.json({ error: 'expected {"advance": ms} with ms a finite number, zero or more' }, 400);
    }
    return c.json({ now: clock.advance(advance), ran: [] });
  });
}

// Equal-length digests, so the comparison takes the same time whatever the header's length.
function digest(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

function unavailable(): Response {
  return new Response("Service unavailable", { status: 503, headers: { "retry-after": "5" } });
}
