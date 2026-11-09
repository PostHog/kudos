// The flags' definitions refresh: outside every operation, it replaces the last good row only with a valid answer.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { answersWith, failsToConnect, flagsKey, neverAnswers, type FakePostHog } from "../../testing/fakePostHog.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { onForEveryone, onInTheSandboxOnly, postHogDeciding } from "../../testing/flags.ts";
import { createClock } from "../clock.ts";
import { flagDefinitions } from "../db/schema/index.ts";
import { cronSchedules } from "../jobs/crons.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log, LogFields } from "../log.ts";
import { createOperations } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import { createFlagsRefresh } from "./refresh.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const clock = createClock({ real: () => Date.parse("2026-11-09T10:00:00Z") });
// Each test's first instant: the clock keeps the steps earlier tests took.
let start: number;
const quiet: Log = { info() {}, error() {} };
const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });

let lines: Array<{ message: string; fields?: LogFields }>;
let postHog: FakePostHog;
const log: Log = { info: (message, fields) => lines.push({ message, fields }), error: (message, fields) => lines.push({ message, fields }) };
const refresh = createFlagsRefresh({ log, timeoutMs: 50 });
const refreshNow = () => operations.action("test.refresh", (ctx) => refresh.handler(ctx, {}));

beforeEach(() => {
  start = clock.now();
  lines = [];
  postHog = postHogDeciding("sandbox", onForEveryone("kudos-flag-seam-check"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function storedRow() {
  const [row] = await db.select().from(flagDefinitions).where(eq(flagDefinitions.key, "posthog"));
  return row ? { keys: row.definitions.flags.map(({ key }) => key), fetchedAt: row.fetchedAt } : null;
}

describe("the refresh", () => {
  test("stores the definitions PostHog serves, with when it fetched them", async () => {
    await refreshNow();

    expect(await storedRow()).toEqual({ keys: ["kudos-flag-seam-check"], fetchedAt: start });
    expect(postHog.definitionRequests).toBe(1);
  });

  test("keeps the last good row on a 500, a timeout, a network failure, a body that isn't JSON and one that fails the schema", async () => {
    await refreshNow();
    const good = await storedRow();
    postHog.withFlags(onForEveryone("a-flag-that-never-lands"));
    postHog.answeringDefinitions(
      answersWith(500),
      neverAnswers,
      failsToConnect,
      () => new Response("<html>not json</html>", { status: 200, headers: { "content-type": "text/html" } }),
      () => Response.json({ flags: [{ key: 7, active: "yes" }] }),
      () => Response.json({ group_type_mapping: {} }),
    );

    for (let attempt = 0; attempt < 6; attempt++) {
      clock.advance(60_000);
      await refreshNow();
      expect(await storedRow(), `attempt ${attempt + 1}`).toEqual(good);
    }

    expect(lines.slice(1).map(({ message, fields }) => [message, fields?.reason])).toEqual([
      ["flag definitions kept", "status"],
      ["flag definitions kept", "failed"],
      ["flag definitions kept", "failed"],
      ["flag definitions kept", "failed"],
      ["flag definitions kept", "invalid"],
      ["flag definitions kept", "invalid"],
    ]);
    expect(lines[1]!.fields?.status).toBe(500);
    expect(lines[2]!.fields?.error, "a timeout is named as one").toBe("TimeoutError");
    const logged = JSON.stringify(lines);
    for (const secret of [flagsKey, "not json", "a-flag-that-never-lands"]) expect(logged, "no key and no body in the logs").not.toContain(secret);
  });

  test("replaces the row on the next valid answer, and leaves it alone when the definitions haven't changed", async () => {
    await refreshNow();
    clock.advance(60_000);
    await refreshNow();
    expect(await storedRow(), "the same definitions write nothing").toEqual({ keys: ["kudos-flag-seam-check"], fetchedAt: start });

    postHog.withFlags(onInTheSandboxOnly("kudos-flag-seam-check"), onForEveryone("another-flag"));
    clock.advance(60_000);
    await refreshNow();

    expect(await storedRow()).toEqual({ keys: ["kudos-flag-seam-check", "another-flag"], fetchedAt: start + 120_000 });
  });

  test("without the flags key or the project token, fetches nothing and stores nothing", async () => {
    for (const unset of ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_TOKEN"]) {
      postHog = postHogDeciding("sandbox", onForEveryone("kudos-flag-seam-check"));
      vi.stubEnv(unset, "");
      await refreshNow();
      expect(postHog.definitionRequests, unset).toBe(0);
    }

    expect(await storedRow()).toBeNull();
  });

  test("is a cron every minute that the service registers, so the worker and the time seam run it", async () => {
    expect(cronSchedules["analytics.flags.refresh"]).toEqual({ everyMs: 60_000 });
    const worker = createWorker({ operations, log: quiet, registry: serviceRegistry.jobs, pollMs: 3_600_000 });

    const settled = await worker.runCron("analytics.flags.refresh", 10_000);

    expect(settled).toEqual({ ran: ["analytics.flags.refresh"], done: true });
    expect(await storedRow()).toEqual({ keys: ["kudos-flag-seam-check"], fetchedAt: start });
  });
});
