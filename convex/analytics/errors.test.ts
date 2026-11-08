import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, answersWith, postHogHost, projectToken, routedFetch, type CapturedEvent } from "../../testing/fakePostHog";
import { FakeSlack, rateLimitedFor, slackError, type ScriptedAnswer } from "../../testing/fakeSlack";
import { signedRequest, signingSecret } from "../../testing/signedSlack";
import { post, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, messageEvent, section, slashCommand, text } from "../../testing/slackMessages";
import { internal } from "../_generated/api";
import schema from "../schema";
import { exceptionOfJobError } from "./exceptions";

const now = new Date("2026-10-13T10:00:00Z");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let slack: FakeSlack;
let postHog: FakePostHog;

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("KUDOS_ENVIRONMENT", "production");
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  slack = new FakeSlack().withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL");
  postHog = new FakePostHog();
  vi.stubGlobal("fetch", routedFetch(postHog, slack.fetch));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const schemaTables = new Set(Object.keys(schema.tables));
const distinctive = ["Marmalade", "Zephyrine", "quokka", "artichokeparty", "U0ZEPHYRINE", "C0MARMALADE", "T0QUOKKAWS"];

describe("O22 O23: an action that throws", () => {
  test("records one $exception with the deployment's identity, the function and the reportable error's message, and still fails", async () => {
    const t = testBackend();
    slack.answering("conversations.join", slackError("not_authed"));

    await hedgehug(t);
    await settle(t);

    const [exception, ...others] = exceptions();
    expect(others).toEqual([]);
    expect(exception).toMatchObject({ distinct_id: "deployment:production", uuid: expect.stringMatching(uuid), timestamp: now.toISOString() });
    expect(exception!.properties).toEqual({
      environment: "production",
      taxonomy_version: 1,
      function_path: "slack/commands:addToChannel",
      function_kind: "action",
      $exception_list: [
        {
          type: "ReportableError",
          value: "Slack conversations.join failed: not_authed",
          mechanism: { handled: false, synthetic: false },
          stacktrace: { type: "raw", frames: expect.arrayContaining([expect.anything()]) },
        },
      ],
    });
    expect(await jobStates(t, "slack/commands:addToChannel")).toEqual(["failed"]);
  });

  test("its stack frames carry only the file, the function and the line, in PostHog's custom-platform shape", async () => {
    const t = testBackend();
    slack.answering("conversations.join", slackError("not_authed"));

    await hedgehug(t);
    await settle(t);

    const frames = exceptionEntry(exceptions()[0]!).stacktrace.frames;
    for (const frame of frames) {
      expect(Object.keys(frame).sort()).toEqual(["filename", "function", "lang", "lineno", "platform"]);
      expect(frame).toMatchObject({ platform: "custom", lang: "javascript", filename: expect.any(String), function: expect.any(String), lineno: expect.any(Number) });
    }
    expect(frames).toContainEqual(expect.objectContaining({ filename: expect.stringContaining("slack/commands.ts"), function: "resultOfJoining" }));
  });

  test("the failed-job sweep doesn't record it a second time", async () => {
    const t = testBackend();
    slack.answering("conversations.join", slackError("not_authed"));
    await hedgehug(t);
    await settle(t);

    await sweepTwice(t);

    expect(exceptions()).toHaveLength(1);
  });
});

describe("O22: an HTTP route whose mutation throws", () => {
  test("records one $exception and Slack gets a failure, so it redelivers", async () => {
    const t = testBackend();

    const answer = t.fetch("/slack/events", await signedRequest(homeOpeningWithANumberForAUser()));

    await expect(answer).rejects.toThrow("[reported]");
    await settle(t);
    const [exception, ...others] = exceptions();
    expect(others).toEqual([]);
    expect(exception!.properties).toMatchObject({ function_path: "POST /slack/events", function_kind: "http" });
    expect(await t.run((ctx) => ctx.db.query("slackReceipts").collect())).toEqual([]);
  });
});

describe("O22: an error whose message quotes the marker", () => {
  test("is recorded like any other, because only the boundary's own rethrow carries the marker", async () => {
    const t = testBackend();

    await postSigned(t, "/slack/events", "[reported] SyntaxError").catch(() => {});
    await settle(t);

    expect(exceptions().map((exception) => exceptionEntry(exception).type)).toEqual(["SyntaxError"]);
  });
});

describe("O10 O23: only a reportable error sends its message", () => {
  test.each<[string, (t: Backend) => Promise<unknown>, string]>([
    ["malformed JSON", (t) => postSigned(t, "/slack/events", `{"type":"event_callback","team_id":"T0QUOKKAWS" Marmalade Zephyrine quokka`), "SyntaxError"],
    ["a Convex argument validation error", (t) => postSigned(t, "/slack/events", homeOpeningWithANumberForAUser()), "Error"],
    [
      "a dependency error whose input holds distinctive text and Slack IDs",
      async (t) => {
        slack.answering("conversations.join", throwing(new TypeError("request to C0MARMALADE for U0ZEPHYRINE failed: Marmalade quokka artichokeparty")));
        await hedgehug(t);
      },
      "TypeError",
    ],
    [
      "a dependency error whose message spans lines that look like stack frames",
      async (t) => {
        slack.answering("conversations.join", throwing(new TypeError("dependency rejected:\n    at U0ZEPHYRINE (C0MARMALADE:12:3)\n    at Marmalade (quokka/artichokeparty.ts:1:1)")));
        await hedgehug(t);
      },
      "TypeError",
    ],
  ])("%s sends unexpected error and its type name, and none of its text", async (_, fail, type) => {
    const t = testBackend();

    await fail(t).catch(() => {});
    await settle(t);

    const [exception] = exceptions();
    expect(exceptions()).toHaveLength(1);
    expect(exceptionEntry(exception!)).toMatchObject({ type, value: "unexpected error" });
    const bodies = postHog.requests.map((request) => request.body).join("\n");
    for (const value of distinctive) expect(bodies).not.toContain(value);
  });

  test.each<[string, string, string]>([
    ["a unique() refusal", "Uncaught Error: unique() query returned more than one result from table welcomes:\n [Marmalade, U0ZEPHYRINE]\n    at async handler (../convex/quokka.ts:1:1)", "unique() query returned more than one result from table welcomes"],
    ["a read limit with words after its sentence", "Uncaught Error: Too many reads in a single function execution (limit: 4096) Marmalade Zephyrine quokka U0ZEPHYRINE", "Too many reads in a single function execution (limit: 4096)"],
    ["a write limit with words after its sentence", "Uncaught Error: Too many writes in a single function execution (limit: 16000). artichokeparty C0MARMALADE", "Too many writes in a single function execution (limit: 16000)"],
  ])("a failed job's %s sends only Convex's words", (_, error, words) => {
    const { value } = exceptionOfJobError(error, schemaTables);
    expect(value).toBe(words);
    for (const word of distinctive) expect(value).not.toContain(word);
  });

  test.each<[string, string]>([
    ["a unique() refusal naming a table the schema doesn't have", "Uncaught Error: unique() query returned more than one result from table U0ZEPHYRINE:\n [Marmalade]"],
    ["a limit naming something Convex doesn't count", "Uncaught Error: Too many marmalade zephyrine in a single function execution (limit: 4096)"],
  ])("a failed job's error that only looks like Convex's, %s, sends unexpected error", (_, error) => {
    expect(exceptionOfJobError(error, schemaTables).value).toBe("unexpected error");
  });
});

describe("O21: expected outcomes are never errors", () => {
  test.each<[string, (t: Backend) => Promise<unknown>]>([
    [
      "an Over allowance attempt",
      async (t) => {
        await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", baseAllowance: 1 }));
        await post(t, [section(mention("U_BOB"), text(" "), mention("U_CAROL"), emoji("taco"))]);
      },
    ],
    [
      "a gone delivery",
      async (t) => {
        slack.answering("reactions.add", slackError("message_not_found"));
        await post(t, thanksBob);
      },
    ],
    [
      "a rate limit",
      async (t) => {
        slack.answering("chat.postEphemeral", rateLimitedFor(1));
        await post(t, thanksBob);
      },
    ],
    ["a 401 for an unsigned request", (t) => t.fetch("/slack/events", { method: "POST", body: messageEvent(thanksBob) })],
    [
      "a retried analytics batch",
      async (t) => {
        postHog.answering(answersWith(503));
        await post(t, thanksBob);
        await settle(t);
      },
    ],
  ])("%s records no exception", async (_, outcome) => {
    const t = testBackend();

    await outcome(t);
    await settle(t);
    await sweepTwice(t);

    expect(exceptions()).toEqual([]);
    expect(await recordedExceptions(t)).toEqual([]);
  });
});

describe("O24 O29: with native error reporting on", () => {
  test("neither a boundary nor the sweep records anything", async () => {
    vi.stubEnv("POSTHOG_NATIVE_ERRORS", "on");
    const t = testBackend();
    slack.answering("conversations.join", slackError("not_authed"));

    await hedgehug(t);
    await postSigned(t, "/slack/events", homeOpeningWithANumberForAUser()).catch(() => {});
    await settle(t);
    await sweepTwice(t);

    expect(exceptions()).toEqual([]);
    expect(await recordedExceptions(t)).toEqual([]);
    expect(await jobStates(t, "slack/commands:addToChannel")).toEqual(["failed"]);
  });
});

const thanksBob = [section(text("thanks "), mention("U_BOB"), text(" "), emoji("taco"))];

function homeOpeningWithANumberForAUser() {
  return JSON.stringify({
    type: "event_callback",
    team_id: "T0QUOKKAWS",
    event_id: "EvMarmalade Zephyrine quokka artichokeparty",
    event_time: 1760349600,
    event: { type: "app_home_opened", user: 404, channel: "C0MARMALADE", tab: "home", event_ts: "1760349600.000200" },
  });
}

function throwing(error: Error): ScriptedAnswer {
  return () => {
    throw error;
  };
}

async function hedgehug(t: Backend) {
  return postSigned(t, "/slack/commands", slashCommand({ channel_id: "C1", channel_name: "general" }, { user: "U_ALICE" }), "application/x-www-form-urlencoded");
}

async function postSigned(t: Backend, path: string, body: string, contentType?: string) {
  return t.fetch(path, await signedRequest(body, contentType ? { contentType } : {}));
}

async function sweepTwice(t: Backend) {
  for (let sweep = 0; sweep < 2; sweep += 1) {
    vi.advanceTimersByTime(15 * 60 * 1000);
    await t.mutation(internal.analytics.sweep.sweep, {});
    await settle(t);
  }
}

function exceptions() {
  return postHog.events().filter((event) => event.event === "$exception");
}

type ExceptionEntry = { type: string; value: string; stacktrace: { frames: Array<Record<string, unknown>> } };

function exceptionEntry(event: CapturedEvent) {
  const [entry] = event.properties.$exception_list as ExceptionEntry[];
  return entry!;
}

async function recordedExceptions(t: Backend) {
  return t.run(async (ctx) => (await ctx.db.query("analyticsOutbox").collect()).filter((row) => row.event === "$exception"));
}

async function jobStates(t: Backend, name: string) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.name === name).map((job) => job.state.kind);
}
