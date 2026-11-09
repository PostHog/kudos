// The outbox's write API, as today's convex/analytics/outbox.ts and person.ts write it: rows in the caller's
// transaction, the shared properties, and an analytics ID or workspace key made once. The drain that sends them is S14's.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { projectToken } from "../../testing/fakePostHog.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import { createPool } from "../db/pool.ts";
import { jobs } from "../db/schema/service.ts";
import { jobsChannel } from "../jobs/wakeups.ts";
import type { Log, LogFields } from "../log.ts";
import { createOperations } from "../operations.ts";
import { record, recordException, workspaceKeyOf } from "./outbox.ts";
import { analyticsIdOf, existingAnalyticsId } from "./person.ts";

const database = useTestDatabase();
const quiet: Log = { info() {}, error() {} };
const now = Date.parse("2026-11-09T10:00:00Z");
const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => now }), log: quiet, retryDelayMs: () => 1 });
const seed = seeder(operations);

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("POSTHOG_NATIVE_ERRORS", "");
});
afterEach(() => vi.unstubAllEnvs());

const aMember = (user = "U_ALICE") => seed.insert("members", { workspace: "T1", user, kind: "member" });

const exception = { type: "Error", value: "boom", frames: [{ filename: "convex/a.ts", function: "handler", lineno: 3 }] };

describe("record", () => {
  test("writes one pending row per event, under the member's analytics ID, with the shared properties", async () => {
    const alice = await aMember();
    const bob = await aMember("U_BOB");

    await operations.mutation("test.record", (ctx) =>
      record(ctx, "T1", [
        { event: "kudos given", subject: { member: alice }, at: now - 5, properties: { thoughtful: true, words: 7 } },
        { event: "kudos received", subject: { member: bob }, at: now - 5, properties: { via: "kudos" } },
      ]),
    );

    const [workspaceKey] = await seed.all("workspaceKeys");
    const idOf = (member: string) => operations.query("test.id", (ctx) => existingAnalyticsId(ctx, member));
    const shared = { environment: "sandbox", workspace_key: workspaceKey!.workspaceKey, taxonomy_version: 1 };
    const rows = await seed.all("analyticsOutbox");
    expect(rows.map(({ _id, _creationTime, uuid, ...row }) => row)).toEqual([
      { event: "kudos given", distinctId: await idOf(alice), timestamp: now - 5, properties: { thoughtful: true, words: 7, ...shared }, state: "pending", failures: 0, dueAt: now },
      { event: "kudos received", distinctId: await idOf(bob), timestamp: now - 5, properties: { via: "kudos", ...shared }, state: "pending", failures: 0, dueAt: now },
    ]);
    expect(new Set(rows.map(({ uuid }) => uuid)).size, "each row its own UUID").toBe(2);
    expect(workspaceKey!.workspace).toBe("T1");
  });

  test("writes in the caller's transaction: a mutation that fails after it leaves no row, ID or key", async () => {
    const alice = await aMember();

    const failing = operations.mutation("test.record", async (ctx) => {
      await record(ctx, "T1", [{ event: "kudos given", subject: { member: alice }, at: now, properties: {} }]);
      throw new Error("the caller failed after recording");
    });

    await expect(failing).rejects.toThrow("the caller failed after recording");
    expect({ outbox: await seed.all("analyticsOutbox"), ids: await seed.all("analyticsIds"), keys: await seed.all("workspaceKeys") }).toEqual({ outbox: [], ids: [], keys: [] });
  });

  test("with capture off, without the project token or a known environment, writes nothing at all", async () => {
    const alice = await aMember();
    for (const [name, value] of [["POSTHOG_PROJECT_TOKEN", ""], ["KUDOS_ENVIRONMENT", ""], ["KUDOS_ENVIRONMENT", "staging"]] as const) {
      vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
      vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
      vi.stubEnv(name, value);

      await operations.mutation("test.record", (ctx) => record(ctx, "T1", [{ event: "kudos given", subject: { member: alice }, at: now, properties: {} }]));
    }

    expect({ outbox: await seed.all("analyticsOutbox"), ids: await seed.all("analyticsIds"), keys: await seed.all("workspaceKeys") }).toEqual({ outbox: [], ids: [], keys: [] });
  });
});

describe("recordException", () => {
  test("writes an $exception row under the deployment, with the one workspace key there is", async () => {
    const recorded = await operations.mutation("test.exception", async (ctx) => {
      const key = await workspaceKeyOf(ctx, "T1");
      return { key, written: await recordException(ctx, { path: "engine/give:give", kind: "mutation" }, exception, now - 1) };
    });

    expect(recorded.written).toBe(true);
    expect((await seed.all("analyticsOutbox")).map(({ _id, _creationTime, uuid, ...row }) => row)).toEqual([
      {
        event: "$exception",
        distinctId: "deployment:sandbox",
        timestamp: now - 1,
        properties: { environment: "sandbox", workspace_key: recorded.key, taxonomy_version: 1, function_path: "engine/give:give", function_kind: "mutation" },
        exception,
        state: "pending",
        failures: 0,
        dueAt: now,
      },
    ]);
  });

  test("leaves the workspace key out unless exactly one workspace has one", async () => {
    await operations.mutation("test.exception", (ctx) => recordException(ctx, { path: "a", kind: "action" }, exception, now));
    await operations.mutation("test.keys", async (ctx) => [await workspaceKeyOf(ctx, "T1"), await workspaceKeyOf(ctx, "T2")]);
    await operations.mutation("test.exception", (ctx) => recordException(ctx, { path: "b", kind: "http" }, exception, now));

    expect((await seed.all("analyticsOutbox")).map(({ properties }) => properties)).toEqual([
      { environment: "sandbox", taxonomy_version: 1, function_path: "a", function_kind: "action" },
      { environment: "sandbox", taxonomy_version: 1, function_path: "b", function_kind: "http" },
    ]);
  });

  test("writes nothing, and says so, with capture off or native error reporting on", async () => {
    const written = [];
    vi.stubEnv("KUDOS_ENVIRONMENT", "");
    written.push(await operations.mutation("test.exception", (ctx) => recordException(ctx, { path: "a", kind: "action" }, exception, now)));
    vi.stubEnv("KUDOS_ENVIRONMENT", "production");
    vi.stubEnv("POSTHOG_NATIVE_ERRORS", "on");
    written.push(await operations.mutation("test.exception", (ctx) => recordException(ctx, { path: "a", kind: "action" }, exception, now)));

    expect(written).toEqual([false, false]);
    expect(await seed.all("analyticsOutbox")).toEqual([]);
  });
});

describe("the drain's wake", () => {
  const drainJobs = () => operations.query("test.drainJobs", ({ tx }) => tx.select({ state: jobs.state }).from(jobs).where(eq(jobs.name, "analytics.drain.drain")));

  // Today's wake read the drain's singleton and its job in the request's transaction, so requests conflicted with a
  // drain claiming the outbox, ran out of retries and answered 500. Here a request only inserts its row and a job.
  test("requests during a drain's claim only insert: under SERIALIZABLE none fails or retries, and each leaves its row and a drain job", async () => {
    const requests = 24;
    const members: Array<Id<"members">> = [];
    for (let i = 0; i < requests; i++) {
      const member = await aMember(`U_${i}`);
      await seed.insert("analyticsIds", { member, analyticsId: `analytics-id-${i}` });
      members.push(member);
    }
    await seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "workspace-key-1" });
    await operations.mutation("test.waiting", (ctx) => record(ctx, "T1", members.slice(0, 5).map((member) => ({ event: "kudos given", subject: { member }, at: now, properties: {} }))));
    let retries = 0;
    const { log, lines } = captureLog();
    const pool = createPool(database.url, { max: 12 });
    onTestFinished(() => pool.end());
    const runner = createOperations({ pool, clock: createClock({ real: () => now }), log, retryDelayMs: () => (retries += 1) });

    // The claim as S14's drain makes it: the due pending rows by `analyticsOutbox_by_due`, locked, marked `sending`.
    const drain = await pool.connect();
    await drain.query("begin isolation level serializable");
    await drain.query("set local enable_seqscan = off");
    const { rows: claimed } = await drain.query<{ _id: string }>(
      `select "_id" from "analyticsOutbox" where state = 'pending' and "dueAt" <= $1 order by state, "dueAt", "_creationTime", "_id" limit 100 for update skip locked`,
      [now],
    );
    await drain.query(`update "analyticsOutbox" set state = 'sending', lease = 'a-lease' where "_id" = any($1)`, [claimed.map(({ _id }) => _id)]);
    const outcomes = await Promise.allSettled(
      members.map((member, i) => runner.mutation("test.request", (ctx) => record(ctx, "T1", [{ event: "kudos received", subject: { member }, at: now, properties: { request: i } }]))),
    );
    const committed = await drain.query("commit");
    drain.release();

    expect(claimed.length, "the drain claimed the waiting rows").toBe(5);
    expect(committed.command, "the claim commits").toBe("COMMIT");
    expect(outcomes.filter(({ status }) => status === "rejected"), "no request failed").toEqual([]);
    expect({ retries, logged: lines.map(({ message }) => message) }, "none was retried or logged a failure").toEqual({ retries: 0, logged: [] });
    const received = (await seed.all("analyticsOutbox")).filter(({ event }) => event === "kudos received");
    expect(received.map(({ properties }) => properties.request).sort((a, b) => Number(a) - Number(b)), "every request's row").toEqual(members.map((_, i) => i));
    expect((await drainJobs()).length, "a drain job per request, and one for the waiting rows").toBe(requests + 1);
  });

  test("a request that rolls back leaves no drain job and wakes nobody; one that commits does both", async () => {
    const alice = await aMember();
    const listener = await database.pool.connect();
    const notified: string[] = [];
    listener.on("notification", ({ channel }) => notified.push(channel));
    onTestFinished(async () => {
      await listener.query("unlisten *");
      listener.release();
    });
    await listener.query(`listen "${jobsChannel(database.schema)}"`);
    const kudos = { event: "kudos given", subject: { member: alice }, at: now, properties: {} };

    await expect(
      operations.mutation("test.rolledBack", async (ctx) => {
        await record(ctx, "T1", [kudos]);
        throw new Error("the request failed after recording");
      }),
    ).rejects.toThrow("the request failed after recording");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const afterRollback = { jobs: await drainJobs(), notified: [...notified] };
    await operations.mutation("test.committed", (ctx) => record(ctx, "T1", [kudos]));
    await vi.waitFor(() => expect(notified.length).toBeGreaterThan(0), { timeout: 2_000 });

    expect(afterRollback, "the rolled-back request").toEqual({ jobs: [], notified: [] });
    expect({ jobs: await drainJobs(), notified }, "the committed request").toEqual({ jobs: [{ state: "pending" }], notified: [jobsChannel(database.schema)] });
  });
});

function captureLog(): { log: Log; lines: Array<{ message: string } & LogFields> } {
  const lines: Array<{ message: string } & LogFields> = [];
  const push = (message: string, fields: LogFields = {}) => lines.push({ message, ...fields });
  return { log: { info: push, error: push }, lines };
}

describe("a member's analytics ID and a workspace's key", () => {
  test("are made once and kept: the oldest stored is the one answered", async () => {
    const alice = await aMember();
    const first = await operations.mutation("test.ids", async (ctx) => ({ id: await analyticsIdOf(ctx, alice), key: await workspaceKeyOf(ctx, "T1") }));
    const again = await operations.mutation("test.ids", async (ctx) => ({ id: await analyticsIdOf(ctx, alice), key: await workspaceKeyOf(ctx, "T1") }));
    await seed.insert("analyticsIds", { member: alice, analyticsId: "a-newer-id" });
    await seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "a-newer-key" });
    const afterNewer = await operations.mutation("test.ids", async (ctx) => ({ id: await analyticsIdOf(ctx, alice), key: await workspaceKeyOf(ctx, "T1") }));

    expect(again).toEqual(first);
    expect(afterNewer).toEqual(first);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await seed.all("analyticsIds")).length, "no third ID").toBe(2);
  });
});
