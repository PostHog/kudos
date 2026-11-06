import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { kudosGivenEventWithAward } from "../../testing/busEvents";
import { FakePostHog, postHogHost, projectToken } from "../../testing/fakePostHog";
import { settle, testBackend, type Backend } from "../../testing/slackBackend";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { KudosGivenEvent } from "../bus/events";
import schema from "../schema";
import { carriesReportedMarker, exceptionOfJobError } from "./exceptions";

const now = new Date("2026-10-13T10:00:00Z");
const minutes = (count: number) => count * 60 * 1000;

let postHog: FakePostHog;

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  postHog = new FakePostHog();
  vi.stubGlobal("fetch", postHog.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("O22: the failed-job sweep", () => {
  test("records a scheduled mutation that threw once, however often it sweeps", async () => {
    const t = testBackend();
    await t.run((ctx) => ctx.db.insert("workspaceKeys", { workspace: "T1", workspaceKey: "the-workspace-key" }));
    await scheduleWelcomeOfAGoneMember(t, 0);
    await settle(t);

    await sweepAfter(t, minutes(15));
    await sweepAfter(t, minutes(15));
    await sweepAfter(t, minutes(15));

    const [exception, ...others] = exceptions();
    expect(others).toEqual([]);
    expect(exception).toMatchObject({ distinct_id: "deployment:sandbox", timestamp: now.toISOString() });
    expect(exception!.properties).toEqual({
      environment: "sandbox",
      workspace_key: "the-workspace-key",
      taxonomy_version: 1,
      function_path: "welcome/welcome:welcomeNewMembers",
      function_kind: "mutation",
      $exception_list: [{ type: "Error", value: "unexpected error", mechanism: { handled: false, synthetic: false }, stacktrace: { type: "raw", frames: [] } }],
    });
  });

  test("records a job that was still pending at one sweep and failed before the next", async () => {
    const t = testBackend();
    await scheduleWelcomeOfAGoneMember(t, minutes(20));

    await sweepAfter(t, minutes(15));
    expect(exceptions()).toEqual([]);
    vi.advanceTimersByTime(minutes(5));
    await t.finishInProgressScheduledFunctions();
    await sweepAfter(t, minutes(10));

    expect(exceptions().map((exception) => exception.properties.function_path)).toEqual(["welcome/welcome:welcomeNewMembers"]);
    expect(await t.run((ctx) => ctx.db.query("watchedJobs").collect())).toEqual([]);
  });

  test("records a failed job created at the same instant as the last job the previous sweep read", async () => {
    const t = testBackend();
    await scheduleWelcomeOfAGoneMember(t, 0);
    await settle(t);
    const [job] = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    await t.run((ctx) => ctx.db.insert("errorSweep", { cursor: job!._creationTime, watchCursor: 0 }));

    await sweepAfter(t, minutes(15));

    expect(exceptions().map((exception) => exception.properties.function_path)).toEqual(["welcome/welcome:welcomeNewMembers"]);
  });

  test("watches a job still pending at the cursor once, however often it sweeps", async () => {
    const t = testBackend();
    await scheduleWelcomeOfAGoneMember(t, minutes(24 * 60));

    await sweepWithoutRunningJobsAfter(t, minutes(15));
    await sweepWithoutRunningJobsAfter(t, minutes(15));
    await sweepWithoutRunningJobsAfter(t, minutes(15));

    expect(await t.run((ctx) => ctx.db.query("watchedJobs").collect())).toHaveLength(1);
  });

  test("O20: never records the analytics module's own functions", async () => {
    const t = testBackend();
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("no randomness today");
    });
    await t.run(async (ctx) => {
      const member = await ctx.db.insert("members", memberRow);
      await ctx.scheduler.runAfter(0, internal.analytics.subscribers.recordKudosGiven, { event: await kudosGivenTo(ctx, member) });
    });
    await settle(t);
    vi.mocked(crypto.randomUUID).mockRestore();

    await sweepAfter(t, minutes(15));

    expect(await jobStates(t)).toContain("failed");
    expect(exceptions()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith("analytics.recording_failed", { event: "kudosGiven", error: "Error" });
  });
});

describe("O22: the failed-job sweep keeps up", () => {
  test("checks every watched job in turn, however many stay pending", async () => {
    const t = testBackend();
    await t.run(async (ctx) => {
      for (let job = 0; job < 1000; job += 1) await ctx.scheduler.runAfter(minutes(24 * 60), internal.slack.receipts.deleteExpired, {});
    });
    await sweepWithoutRunningJobsAfter(t, minutes(15));
    await scheduleWelcomeOfAGoneMember(t, minutes(25));
    await sweepWithoutRunningJobsAfter(t, minutes(15));

    await sweepWithoutRunningJobsAfter(t, minutes(15));
    await sweepWithoutRunningJobsAfter(t, minutes(15));

    expect(exceptions().map((exception) => exception.properties.function_path)).toEqual(["welcome/welcome:welcomeNewMembers"]);
  });

  test("O20: a sweep that fails logs a fixed code and records nothing", async () => {
    const t = testBackend();
    await scheduleWelcomeOfAGoneMember(t, 0);
    await settle(t);
    vi.advanceTimersByTime(minutes(15));
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("no randomness today");
    });

    await expect(t.mutation(internal.analytics.sweep.sweep, {})).rejects.toThrow("no randomness today");

    expect(console.error).toHaveBeenCalledWith("analytics.sweep_failed");
    expect(await recordedExceptions(t)).toEqual([]);
  });
});

describe("O22: the [reported] marker", () => {
  test.each<[string, string, boolean]>([
    ["the boundary's own rethrow", "[reported] ReportableError", true],
    ["the rethrow as an outer action or a failed job sees it", "Uncaught Error: [reported] TypeError\n    at reported (../../convex/analytics/boundary.ts:71:10)", true],
    ["a parse error that quotes the marker from its input", `Unexpected token 'r', "[reported] SyntaxError" is not valid JSON`, false],
    ["a validation error whose arguments hold the marker", "ArgumentValidationError: Value does not match validator.\nPath: .event\nValue: {\"text\":\"[reported] Error\"}", false],
    ["a message whose second line is the marker", "dependency rejected\n[reported] TypeError", false],
  ])("%s: %s", (_, message, marked) => {
    expect(carriesReportedMarker(new Error(message))).toBe(marked);
    expect(carriesReportedMarker(message)).toBe(marked);
  });
});

describe("O23: what the sweep reads from Convex's error string", () => {
  test.each<[string, string | undefined, { type: string; value: string }]>([
    ["a reportable error sends its message", "Uncaught ReportableError: Slack conversations.join failed: not_authed\n    at resultOfJoining (../convex/slack/commands.ts:40:9)", { type: "ReportableError", value: "Slack conversations.join failed: not_authed" }],
    ["any other error sends unexpected error and its type", "Uncaught SyntaxError: Unexpected token 'M', \"Marmalade U0ZEPHYRINE\" is not valid JSON", { type: "SyntaxError", value: "unexpected error" }],
    ["a validation error that names a ReportableError in its input still sends nothing of it", "ArgumentValidationError: Value does not match validator.\nUncaught ReportableError: Marmalade", { type: "Error", value: "unexpected error" }],
    ["no error string sends unexpected error", undefined, { type: "Error", value: "unexpected error" }],
    ["Convex's unique() refusal sends its first line, which names only the table", "Uncaught Error: unique() query returned more than one result from table welcomes:\n [n17qrff987ddxmmc2k850qtavd8hp56g, n17za9t3vrwk63kwb7pv7vn7dd8hq3rj, ...]\n    at async handler (../convex/quests/start.ts:33:11)\n", { type: "Error", value: "unique() query returned more than one result from table welcomes" }],
    ["Convex's read limit sends the limit it hit", "Uncaught Error: Too many reads in a single function execution (limit: 4096). Consider using smaller limits in your queries, paginating your queries, or using indexed queries with a selective index range expressions.\n    at async handler (../convex/quests/newWeek.ts:43:11)\n", { type: "Error", value: "Too many reads in a single function execution (limit: 4096)" }],
    ["Convex's write limit sends the limit it hit", "Uncaught Error: Too many writes in a single function execution (limit: 16000)\n    at async handler (../convex/quests/newWeek.ts:50:11)\n", { type: "Error", value: "Too many writes in a single function execution (limit: 16000)" }],
    ["Convex's documents-read limit sends the limit it hit", "Uncaught Error: Too many documents read in a single function execution (limit: 32000)", { type: "Error", value: "Too many documents read in a single function execution (limit: 32000)" }],
    ["Convex's bytes-written limit sends the limit it hit", "Uncaught Error: Too many bytes written in a single function execution (limit: 16777216 bytes)", { type: "Error", value: "Too many bytes written in a single function execution (limit: 16777216 bytes)" }],
    ["Convex's bytes-read limit sends the limit it hit and nothing after it", "Uncaught Error: Too many bytes read in a single function execution (limit: 16777216 bytes). Marmalade U0ZEPHYRINE", { type: "Error", value: "Too many bytes read in a single function execution (limit: 16777216 bytes)" }],
    ["convex-test's index-range wording is not the backend's, so it is withheld", "Uncaught Error: Too many index ranges read in a single function execution (limit: 4096)", { type: "Error", value: "unexpected error" }],
    ["words after a Convex limit's sentence are never sent", "Uncaught Error: Too many reads in a single function execution (limit: 4096) Marmalade U0ZEPHYRINE", { type: "Error", value: "Too many reads in a single function execution (limit: 4096)" }],
    ["a unique() refusal whose table is followed by more words is withheld", "Uncaught Error: unique() query returned more than one result from table welcomes: Marmalade", { type: "Error", value: "unexpected error" }],
    ["Convex's words thrown by another type are withheld", "Uncaught SyntaxError: Too many reads in a single function execution (limit: 4096)", { type: "SyntaxError", value: "unexpected error" }],
  ])("%s", (_, error, expected) => {
    expect(exceptionOfJobError(error, new Set(Object.keys(schema.tables)))).toEqual({ ...expected, frames: [] });
  });
});

const memberRow = { workspace: "T1", user: "U_GONE", kind: "member" as const };

async function scheduleWelcomeOfAGoneMember(t: Backend, delayMs: number) {
  await t.run(async (ctx) => {
    const gone = await ctx.db.insert("members", memberRow);
    await ctx.db.delete(gone);
    await ctx.scheduler.runAfter(delayMs, internal.welcome.welcome.welcomeNewMembers, { event: await kudosGivenTo(ctx, gone) });
  });
}

function kudosGivenTo(ctx: MutationCtx, giver: KudosGivenEvent["giver"]): Promise<KudosGivenEvent> {
  return kudosGivenEventWithAward(ctx, giver, giver, { at: now.getTime() });
}

async function sweepAfter(t: Backend, delayMs: number) {
  vi.advanceTimersByTime(delayMs);
  await t.mutation(internal.analytics.sweep.sweep, {});
  await settle(t);
}

async function sweepWithoutRunningJobsAfter(t: Backend, delayMs: number) {
  vi.advanceTimersByTime(delayMs);
  await t.finishInProgressScheduledFunctions();
  await t.mutation(internal.analytics.sweep.sweep, {});
}

async function recordedExceptions(t: Backend) {
  return t.run(async (ctx) => (await ctx.db.query("analyticsOutbox").collect()).filter((row) => row.event === "$exception"));
}

function exceptions() {
  return postHog.events().filter((event) => event.event === "$exception");
}

async function jobStates(t: Backend) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.map((job) => job.state.kind);
}
