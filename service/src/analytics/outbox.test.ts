// The outbox's write API, as today's convex/analytics/outbox.ts and person.ts write it: rows in the caller's
// transaction, the shared properties, and an analytics ID or workspace key made once. The drain that sends them is S14's.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { projectToken } from "../../testing/fakePostHog.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Log } from "../log.ts";
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
