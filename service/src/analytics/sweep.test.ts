// The failed-job sweep, ported from convex/analytics/sweep.test.ts onto the service's job history. A failing job here
// is one of the test's own, registered beside the analytics jobs under the name of the operation it stands for.
import { and, asc, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import type { Id } from "../db/columns.ts";
import { encodeStored } from "../db/codec.ts";
import { jobs } from "../db/schema/service.ts";
import { cronSchedules } from "../jobs/crons.ts";
import { actionJob, jobRegistry, mutationJob } from "../jobs/define.ts";
import { serviceRegistry } from "../registry.ts";
import { createRegistry, type Registry } from "../registration.ts";
import { cleanUpJob, recoverJob } from "./drain.ts";
import { carriesReportedMarker, exceptionOfJobError, ReportableError } from "./exceptions.ts";
import { registration } from "./registration.ts";
import { drainJob } from "./send.ts";
import { sweep, sweepJob } from "./sweep.ts";
import { z } from "zod";

const randomness = vi.hoisted(() => ({ fails: false }));
vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return {
    ...crypto,
    randomUUID: () => {
      if (randomness.fails) throw new Error("no randomness today");
      return crypto.randomUUID();
    },
  };
});

const start = Date.parse("2026-10-13T10:00:00Z");
const minutes = (count: number) => count * 60 * 1000;
const days = (count: number) => count * 24 * 60 * minutes(1);

const welcomeNewMembers = mutationJob("welcome.welcome.welcomeNewMembers", z.strictObject({}), async () => {
  throw new Error("the new member left before their welcome");
});
const joinChannel = actionJob("slack.commands.joinChannel", z.strictObject({}), async () => {
  throw new ReportableError("Slack conversations.join failed: not_authed");
});
const recordKudosGiven = mutationJob("analytics.subscribers.recordKudosGiven", z.strictObject({}), async () => {
  throw new Error("no randomness today");
});
const deleteExpired = mutationJob("slack.receipts.deleteExpired", z.strictObject({}), async () => {});

const registry: Registry = {
  jobs: jobRegistry([sweepJob, drainJob, recoverJob, cleanUpJob, welcomeNewMembers, joinChannel, recordKudosGiven, deleteExpired]),
  subscribers: new Map(),
  slack: {},
  routes: [],
};
const backend = useTestBackend({ now: start, registry });
const cronBackend = () => backend({ registry: createRegistry({ analytics: registration }) });

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("POSTHOG_NATIVE_ERRORS", "");
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  randomness.fails = false;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("O22: the failed-job sweep", () => {
  test("records a job that threw once, however often it sweeps, named by its operation", async () => {
    const t = backend();
    await t.seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "the-workspace-key" });
    await enqueue(t, welcomeNewMembers);
    await t.settle();

    await sweepAfter(t, minutes(15));
    await sweepAfter(t, minutes(15));
    await sweepAfter(t, minutes(15));

    const [exception, ...others] = exceptions(t);
    expect(others).toEqual([]);
    expect(exception).toMatchObject({ distinct_id: "deployment:sandbox", timestamp: new Date(start).toISOString() });
    expect(exception!.properties).toEqual({
      environment: "sandbox",
      workspace_key: "the-workspace-key",
      taxonomy_version: 1,
      function_path: "welcome/welcome:welcomeNewMembers",
      function_kind: "mutation",
      $exception_list: [{ type: "Error", value: "unexpected error", mechanism: { handled: false, synthetic: false }, stacktrace: { type: "raw", frames: [] } }],
    });
  });

  test("a failed action job is named as an action, and a reportable error sends its message", async () => {
    const t = backend();
    await enqueue(t, joinChannel);
    await t.settle();

    await sweepAfter(t, minutes(15));

    expect(exceptions(t).map(({ properties }) => [properties.function_path, properties.function_kind, properties.$exception_list])).toEqual([
      ["slack/commands:joinChannel", "action", [expect.objectContaining({ type: "ReportableError", value: "Slack conversations.join failed: not_authed" })]],
    ]);
  });

  test("a unique() refusal sends the table it names when the app has that table, and is withheld when it hasn't", async () => {
    const t = backend();
    await failedJob(t, welcomeNewMembers.name, "Error: unique() query returned more than one result from table welcomes:");
    await failedJob(t, deleteExpired.name, "Error: unique() query returned more than one result from table Marmalade:");

    await sweepAfter(t, minutes(15));

    const sent = exceptions(t).map(({ properties }) => [properties.function_path, properties.$exception_list]);
    expect(sent.toSorted(([a], [b]) => String(a).localeCompare(String(b)))).toEqual([
      ["slack/receipts:deleteExpired", [expect.objectContaining({ type: "Error", value: "unexpected error" })]],
      ["welcome/welcome:welcomeNewMembers", [expect.objectContaining({ type: "Error", value: "unique() query returned more than one result from table welcomes" })]],
    ]);
  });

  test("records a job that was still pending at one sweep and failed before the next", async () => {
    const t = backend();
    await enqueue(t, welcomeNewMembers, minutes(25));

    await sweepAfter(t, minutes(15));
    expect(exceptions(t)).toEqual([]);
    t.time.advance(minutes(10));
    await t.settle();
    await sweepAfter(t, minutes(5));

    expect(paths(t)).toEqual(["welcome/welcome:welcomeNewMembers"]);
  });

  test("records a failure whose transaction committed after the sweep read a later one", async () => {
    const t = backend();
    await failedJob(t, "welcome.welcome.welcomeNewMembers", "Error: gone");
    await sweepAfter(t, minutes(15));
    // Marked failed at an instant before the one the sweep already read, by a transaction that committed only now.
    await failedJob(t, "slack.delivery.deliver", "Error: gone", { completedAt: start - minutes(1) });

    await sweepAfter(t, minutes(15));

    expect(paths(t)).toEqual(["welcome/welcome:welcomeNewMembers", "slack/delivery:deliver"]);
  });

  test("records a failure that finished more than a week before the sweep, once, as after a long outage", async () => {
    const t = backend();
    await failedJob(t, "welcome.welcome.welcomeNewMembers", "Uncaught Error: gone", { completedAt: start - days(8) });

    await sweepAfter(t, minutes(15));
    await sweepAfter(t, minutes(15));

    expect(paths(t)).toEqual(["welcome/welcome:welcomeNewMembers"]);
  });

  test("O20: never records the analytics module's own jobs", async () => {
    const t = backend();
    await enqueue(t, recordKudosGiven);
    await t.settle();

    await sweepAfter(t, minutes(15));

    expect(await stateOf(t, recordKudosGiven.name)).toBe("failed");
    expect(exceptions(t)).toEqual([]);
  });

  test("records nothing of a job the boundary already reported, which carries the marker", async () => {
    const t = backend();
    await failedJob(t, "slack.events.slackEvents", "Uncaught Error: [reported] TypeError\n    at reported (../../convex/analytics/boundary.ts:71:10)");

    await sweepAfter(t, minutes(15));

    expect(exceptions(t)).toEqual([]);
  });

  test("records nothing of a service job the boundary already reported, in the worker's form of the marker", async () => {
    const t = backend();
    await failedJob(t, "slack.events.slackEvents", "Error: [reported] TypeError");

    await sweepAfter(t, minutes(15));

    expect(exceptions(t)).toEqual([]);
  });
});

describe("O22: the failed-job sweep keeps up", () => {
  test("reads past every job still pending, however many", async () => {
    const t = backend();
    await t.run(async (ctx) => {
      for (let job = 0; job < 1000; job += 1) await ctx.jobs.enqueue(deleteExpired, {}, { after: days(1) });
    });
    await sweepAfter(t, minutes(15));
    await enqueue(t, welcomeNewMembers, minutes(25));
    t.time.advance(minutes(25));
    await t.settle();

    await sweepAfter(t, minutes(15));

    expect(paths(t)).toEqual(["welcome/welcome:welcomeNewMembers"]);
  });

  test("records every job, more than a sweep reads, that failed at one instant, and the one after them, each once", async () => {
    const t = backend();
    await t.run(async (ctx) => {
      const failed = (completedAt: number) => ({ ...ctx.newRow(), name: "welcome.welcome.welcomeNewMembers", args: encodeStored({}), runAt: completedAt, kind: "mutation" as const, state: "failed" as const, error: "Error: gone", completedAt });
      await ctx.tx.insert(jobs).values(Array.from({ length: 1001 }, () => failed(ctx.now)));
      await ctx.tx.insert(jobs).values(failed(ctx.now + 1));
    });

    await sweepAfter(t, minutes(15));
    expect(paths(t), "a sweep reads 1,000").toHaveLength(1000);
    await sweepAfter(t, minutes(15));
    await sweepAfter(t, minutes(15));

    expect(paths(t)).toHaveLength(1002);
    expect(new Set(exceptions(t).map(({ uuid }) => uuid)).size, "each once").toBe(1002);
    expect(await unswept(t)).toEqual([]);
  });

  test("O20: a sweep that fails logs a fixed code and records nothing", async () => {
    const t = backend();
    await enqueue(t, welcomeNewMembers);
    await t.settle();
    t.time.advance(minutes(15));
    randomness.fails = true;

    await expect(t.run((ctx) => sweep(ctx, {}))).rejects.toThrow("no randomness today");

    randomness.fails = false;
    expect(errors).toHaveBeenCalledWith("analytics.sweep_failed");
    expect(await unswept(t), "the failure waits for the next sweep").toHaveLength(1);
    await t.settle();
    expect(exceptions(t)).toEqual([]);
  });

  test("the sweep's cron, every 15 minutes, runs the analytics registration's sweep, which the service holds", async () => {
    const t = cronBackend();
    await failedJob(t, "welcome.welcome.welcomeNewMembers", "Error: gone");

    t.time.advance(minutes(15));
    await t.time.runCron("analytics.sweep.sweep");
    await t.settle();

    expect(paths(t)).toEqual(["welcome/welcome:welcomeNewMembers"]);
    expect(cronSchedules["analytics.sweep.sweep"]).toEqual({ everyMs: minutes(15) });
    expect(serviceRegistry.jobs.get(sweepJob.name), "the service's registry").toBe(registration.jobs!.find(({ name }) => name === sweepJob.name));
  });
});

describe("O22: the [reported] marker", () => {
  test.each<[string, string, boolean]>([
    ["the boundary's own rethrow", "[reported] ReportableError", true],
    ["the rethrow as an outer action or a failed job sees it", "Uncaught Error: [reported] TypeError\n    at reported (../../convex/analytics/boundary.ts:71:10)", true],
    ["the rethrow as the service's worker stores it", "Error: [reported] TypeError", true],
    ["a parse error that quotes the marker from its input", `Unexpected token 'r', "[reported] SyntaxError" is not valid JSON`, false],
    ["a validation error whose arguments hold the marker", "ArgumentValidationError: Value does not match validator.\nPath: .event\nValue: {\"text\":\"[reported] Error\"}", false],
    ["a message whose second line is the marker", "dependency rejected\n[reported] TypeError", false],
  ])("%s: %s", (_, message, marked) => {
    expect(carriesReportedMarker(new Error(message))).toBe(marked);
    expect(carriesReportedMarker(message)).toBe(marked);
  });
});

const tables = new Set(["welcomes"]);

describe("O23: what the sweep reads from a job's error", () => {
  test.each<[string, string | undefined, { type: string; value: string }]>([
    ["a reportable error sends its message", "Uncaught ReportableError: Slack conversations.join failed: not_authed\n    at resultOfJoining (../convex/slack/commands.ts:40:9)", { type: "ReportableError", value: "Slack conversations.join failed: not_authed" }],
    ["any other error sends unexpected error and its type", "Uncaught SyntaxError: Unexpected token 'M', \"Marmalade U0ZEPHYRINE\" is not valid JSON", { type: "SyntaxError", value: "unexpected error" }],
    ["a validation error that names a ReportableError in its input sends its own type and nothing of the input", "ArgumentValidationError: Value does not match validator.\nUncaught ReportableError: Marmalade", { type: "ArgumentValidationError", value: "unexpected error" }],
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
    ["the service's reportable error sends its message", "ReportableError: Slack conversations.join failed: not_authed", { type: "ReportableError", value: "Slack conversations.join failed: not_authed" }],
    ["the service's other errors send unexpected error and their type", "TypeError: Cannot read properties of undefined (reading 'Marmalade')", { type: "TypeError", value: "unexpected error" }],
    ["the service's unique() refusal sends the table it names", "Error: unique() query returned more than one result from table welcomes:", { type: "Error", value: "unique() query returned more than one result from table welcomes" }],
    ["a unique() refusal that names no table of the app is withheld", "Error: unique() query returned more than one result from table Marmalade:", { type: "Error", value: "unexpected error" }],
    ["an action past its deadline sends unexpected error", "The action ran past its deadline", { type: "Error", value: "unexpected error" }],
    ["a thrown value that is not an Error sends unexpected error", "A value that is not an Error was thrown", { type: "Error", value: "unexpected error" }],
  ])("%s", (_, error, expected) => {
    expect(exceptionOfJobError(error, tables)).toEqual({ ...expected, frames: [] });
  });
});

async function enqueue(t: TestBackend, job: { name: string }, delayMs = 0) {
  await t.run((ctx) => ctx.jobs.enqueue(job as typeof welcomeNewMembers, {}, { after: delayMs }));
}

/** A job that failed by the app's clock now, or at `completedAt`, as the loader moves today's failed jobs or the worker marks one. */
async function failedJob(t: TestBackend, name: string, error: string, { completedAt }: { completedAt?: number } = {}) {
  return t.run(async (ctx) => {
    const at = completedAt ?? ctx.now;
    const row = { ...ctx.newRow(), name, args: encodeStored({}), runAt: at, kind: "mutation" as const, state: "failed" as const, error, completedAt: at };
    await ctx.tx.insert(jobs).values(row);
    return row._id as Id<"_scheduled_functions">;
  });
}

async function unswept(t: TestBackend) {
  return t.query(({ tx }) => tx.select({ _id: jobs._id }).from(jobs).where(and(eq(jobs.state, "failed"), isNull(jobs.sweptAt))));
}

async function sweepAfter(t: TestBackend, delayMs: number) {
  t.time.advance(delayMs);
  await t.time.runCron("analytics.sweep.sweep");
  await t.settle();
}

async function stateOf(t: TestBackend, name: string) {
  const [job] = await t.query(({ tx }) => tx.select({ state: jobs.state }).from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime)));
  return job?.state;
}

function exceptions(t: TestBackend) {
  return t.postHog.events().filter((event) => event.event === "$exception");
}

function paths(t: TestBackend) {
  return exceptions(t).map((exception) => exception.properties.function_path);
}
