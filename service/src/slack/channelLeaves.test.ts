// The app leaves shared and customer channels: the operator's one-off leaves every one it is in, a Tier 3 slot at a
// time, and Slack's channel events (shared, renamed, or the app's own bot added) check that one channel and leave it
// when it is off limits. Today's convex/slack/channelLeaves.test.ts, driven through the front door, the worker and the
// app's clock.
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { networkFailure, rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import { channelRenameEvent, channelSharedEvent, kudosAppBotUser, memberJoinedChannelEvent } from "../../testing/slackMessages.ts";
import { decodeStored } from "../db/codec.ts";
import { jobs } from "../db/schema/service.ts";
import { leaveOffLimitsChannelsJob } from "./channelLeaves.ts";

const now = new Date("2026-10-26T10:00:00Z").getTime();
const backend = useTestBackend({ now });

let t: TestBackend;
let logged: MockInstance;
let calls: Array<{ method: string; at: number }>;

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  logged = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  t = backend();
  // Each Slack call at the app's clock, which moves only as the test moves it.
  calls = [];
  const routed = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ method: new URL(input instanceof Request ? input.url : input).pathname.split("/").pop()!, at: t.clock.now() });
    return routed(input, init);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the app leaves shared and customer channels", () => {
  test("the channel leave takes the app out of every shared, invited and customer channel it is in, public or private, across every page", async () => {
    t.slack
      .listingChannelsPerPage(2)
      .withChannel("C_GENERAL", { name: "general", joined: true })
      .withChannel("C_SHARED", { name: "partners", kind: "shared", joined: true })
      .withChannel("C_INVITED", { name: "invited", kind: "pending-shared", joined: true })
      .withChannel("G_SHARED", { name: "partners-private", kind: "private-shared", joined: true })
      .withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true })
      .withChannel("G_TEAM", { name: "team-private", kind: "private", joined: true })
      .withChannel("C_OUTSIDE", { name: "customer-other-internal" });

    await leaveOffLimitsChannels();

    expect(t.slack.callsTo("conversations.leave")).toEqual([{ channel: "C_SHARED" }, { channel: "C_INVITED" }, { channel: "G_SHARED" }, { channel: "C_CUSTOMER" }]);
    expect(["C_GENERAL", "G_TEAM"].filter((channel) => t.slack.hasJoined(channel))).toEqual(["C_GENERAL", "G_TEAM"]);
    expect(logged).toHaveBeenLastCalledWith("channel leaves finished: left 4, missed 0");
  });

  test("it lists and leaves at most once per Tier 3 slot", async () => {
    t.slack
      .listingChannelsPerPage(1)
      .withChannel("C_SHARED", { name: "partners", kind: "shared", joined: true })
      .withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true });

    await leaveOffLimitsChannels();

    const steps = calls.filter(({ method }) => method === "users.conversations" || method === "conversations.info").map(({ at }) => at);
    expect(steps).toHaveLength(4);
    for (const [index, at] of steps.entries()) if (index > 0) expect(at - steps[index - 1]!).toBeGreaterThanOrEqual(60_000 / 50);
  });

  test("a rate-limited listing waits out the Retry-After and lists the same page again", async () => {
    t.slack.listingChannelsPerPage(1).withChannel("C_SHARED", { name: "partners", kind: "shared", joined: true }).withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true });
    t.slack.answering("users.conversations", (answerAsSlackWould) => answerAsSlackWould(), rateLimitedFor(20));

    await leaveOffLimitsChannels();

    const [, limited, retried] = timesOf("users.conversations");
    expect(t.slack.callsTo("users.conversations").map(({ cursor }) => cursor)).toEqual([undefined, "1", "1"]);
    expect(retried! - limited!).toBeGreaterThanOrEqual(20_000);
    expect(t.slack.callsTo("conversations.leave")).toEqual([{ channel: "C_SHARED" }, { channel: "C_CUSTOMER" }]);
  });

  test("a rate-limited leave waits out the Retry-After and leaves the channel", async () => {
    t.slack.withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true }).answering("conversations.leave", rateLimitedFor(20));

    await leaveOffLimitsChannels();

    const [limited, retried] = timesOf("conversations.leave");
    expect(retried! - limited!).toBeGreaterThanOrEqual(20_000);
    expect(t.slack.hasJoined("C_CUSTOMER")).toBe(false);
  });

  test("a channel renamed out of customer- between the listing and its leave keeps the app", async () => {
    t.slack
      .withChannel("G_RENAMED", { name: "customer-example-internal", kind: "private", joined: true })
      .answering("conversations.info", () => Response.json({ ok: true, channel: { id: "G_RENAMED", name: "team-private", is_private: true } }));

    await leaveOffLimitsChannels();

    expect(t.slack.callsTo("conversations.leave")).toEqual([]);
    expect(logged).toHaveBeenLastCalledWith("channel leaves finished: left 0, missed 0");
  });

  test("a step run twice, as recovery starts a run again from its last step, leaves the channel once and misses none", async () => {
    t.slack.withChannel("C_GENERAL", { name: "general", joined: true }).withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true });
    await leaveOffLimitsChannels();

    const step = await stepLeaving("C_CUSTOMER");
    await t.run((ctx) => ctx.jobs.enqueue(leaveOffLimitsChannelsJob, step));
    await settleInTimeOrder();

    expect(["C_GENERAL", "C_CUSTOMER"].filter((channel) => t.slack.hasJoined(channel))).toEqual(["C_GENERAL"]);
    expect(logged).toHaveBeenLastCalledWith("channel leaves finished: left 1, missed 0");
  });

  test("a run that finished, started again from its last step, asks Slack nothing", async () => {
    t.slack.withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true });
    await leaveOffLimitsChannels();
    const asked = t.slack.calls.length;

    const step = (await stepsOf("slack.channelLeaves.leaveOffLimitsChannels")).at(-1)!;
    await t.run((ctx) => ctx.jobs.enqueue(leaveOffLimitsChannelsJob, step));
    await settleInTimeOrder();

    expect(t.slack.calls).toHaveLength(asked);
    expect(logged).toHaveBeenLastCalledWith("channel leaves finished: left 1, missed 0");
  });

  test("a channel the app already left by the time of its leave counts as left", async () => {
    t.slack.withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true }).answering("conversations.leave", () => Response.json({ ok: false, not_in_channel: true }));

    await leaveOffLimitsChannels();

    expect(logged).toHaveBeenLastCalledWith("channel leaves finished: left 1, missed 0");
  });

  test("a channel Slack gives no answer about counts as missed, and the sweep goes on to the next", async () => {
    t.slack
      .withChannel("C_FIRST", { name: "customer-first-internal", joined: true })
      .withChannel("C_SECOND", { name: "customer-second-internal", joined: true })
      .answering("conversations.info", networkFailure);

    await leaveOffLimitsChannels();

    expect(t.slack.callsTo("conversations.leave")).toEqual([{ channel: "C_SECOND" }]);
    expect(logged).toHaveBeenLastCalledWith("channel leaves finished: left 1, missed 1");
    expect(console.warn).toHaveBeenCalledWith("channel leaves: conversations.info has no answer: TypeError");
  });

  test("an archived channel Slack won't let the app leave counts as missed", async () => {
    t.slack.withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true }).answering("conversations.leave", slackError("is_archived"));

    await leaveOffLimitsChannels();

    expect(logged).toHaveBeenLastCalledWith("channel leaves finished: left 0, missed 1");
    expect(console.warn).toHaveBeenCalledWith("channel leaves: conversations.leave failed: is_archived");
  });

  test("a listing Slack refuses ends the run with Slack's error code", async () => {
    t.slack.withChannel("C_CUSTOMER", { name: "customer-example-internal", joined: true }).answering("users.conversations", slackError("missing_scope"));

    await leaveOffLimitsChannels();

    expect(await jobsNamed("slack.channelLeaves.leaveOffLimitsChannels")).toEqual([{ state: "failed", error: "ReportableError: Slack users.conversations failed: missing_scope" }]);
    expect(t.slack.callsTo("conversations.leave")).toEqual([]);
  });

  test("a channel shared with another organization while the app is in it is left at once, once even when Slack delivers the event again", async () => {
    t.slack.withChannel("C_TEAM", { name: "team", joined: true }).shareChannel("C_TEAM");

    await deliver(channelSharedEvent("C_TEAM", { eventId: "Ev_SHARED" }));
    await deliver(channelSharedEvent("C_TEAM", { eventId: "Ev_SHARED" }));

    expect(t.slack.callsTo("conversations.leave")).toEqual([{ channel: "C_TEAM" }]);
  });

  test.each([
    ["public", "C_TEAM", { name: "team", joined: true }, false],
    ["private", "G_TEAM", { name: "team", kind: "private" as const, joined: true }, true],
  ])("a %s channel renamed into customer- is left", async (_, id, channel, isPrivate) => {
    t.slack.withChannel(id, channel).renameChannel(id, "customer-example-internal");

    await deliver(channelRenameEvent(id, "customer-example-internal", { isPrivate }));

    expect(t.slack.hasJoined(id)).toBe(false);
  });

  test("a channel renamed to anything else keeps the app", async () => {
    t.slack.withChannel("C_TEAM", { name: "team", joined: true }).renameChannel("C_TEAM", "team-customers");

    await deliver(channelRenameEvent("C_TEAM", "team-customers"));

    expect(t.slack.callsTo("conversations.leave")).toEqual([]);
    expect(t.slack.hasJoined("C_TEAM")).toBe(true);
  });

  test("an invite of the app into a shared private channel is left at once", async () => {
    t.slack.withChannel("G_SHARED", { name: "partners-private", kind: "private-shared", joined: true });

    await deliver(memberJoinedChannelEvent("G_SHARED", kudosAppBotUser, { isPrivate: true }));

    expect(t.slack.hasJoined("G_SHARED")).toBe(false);
  });

  test("an invite of the app into a channel named posthog- or ext-, not yet shared, keeps the app", async () => {
    t.slack.withChannel("C_POSTHOG", { name: "posthog-example", joined: true });

    await deliver(memberJoinedChannelEvent("C_POSTHOG", kudosAppBotUser));

    expect(t.slack.hasJoined("C_POSTHOG")).toBe(true);
  });

  test("someone else joining a channel asks Slack nothing, and its redelivery is taken in again", async () => {
    t.slack.withChannel("C_SHARED", { name: "partners", kind: "shared", joined: true });

    await deliver(memberJoinedChannelEvent("C_SHARED", "U_ALICE"));

    expect(t.slack.calls).toEqual([]);
    expect(await t.seed.all("slackReceipts")).toEqual([]);
  });

  test("a check Slack keeps rate limiting gives up after 3 tries", async () => {
    t.slack.withChannel("C_TEAM", { name: "team", joined: true }).shareChannel("C_TEAM").answering("conversations.info", rateLimitedFor(1), rateLimitedFor(1), rateLimitedFor(1));

    await deliver(channelSharedEvent("C_TEAM"));

    expect(t.slack.callsTo("conversations.info")).toHaveLength(3);
    expect(t.slack.hasJoined("C_TEAM")).toBe(true);
    expect((await jobsNamed("slack.channelLeaves.leaveIfOffLimits")).map(({ state }) => state)).toEqual(["success", "success", "failed"]);
  });
});

// The operator's one-off, as they start it: the job, enqueued, and every job it schedules after it.
async function leaveOffLimitsChannels() {
  await t.run((ctx) => ctx.jobs.enqueue(leaveOffLimitsChannelsJob, {}));
  await settleInTimeOrder();
}

async function deliver(event: string) {
  expect((await t.send("/events", event)).status).toBe(200);
  await settleInTimeOrder();
}

const timesOf = (method: string) => calls.filter((call) => call.method === method).map(({ at }) => at);

/** Runs every job, moving the app's clock to each next one, until none is pending. */
async function settleInTimeOrder() {
  for (;;) {
    await t.settle();
    const [next] = await t.query(({ tx }) => tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt)).limit(1));
    if (next === undefined) return;
    if (next.runAt > t.clock.now()) t.time.advance(next.runAt - t.clock.now());
  }
}

function jobsNamed(name: string) {
  return t.query(({ tx }) => tx.select({ state: jobs.state, error: jobs.error }).from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id)));
}

/** The arguments of each step a job ran, in order, as recovery would find them to start the job again. */
async function stepsOf(name: string) {
  const steps = await t.query(({ tx }) => tx.select({ args: jobs.args }).from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id)));
  return steps.map(({ args }) => decodeStored(args) as { cursor?: string; queue?: string[]; left?: number; missed?: number });
}

/** The step of the channel leave that left `channel`. */
async function stepLeaving(channel: string) {
  return (await stepsOf("slack.channelLeaves.leaveOffLimitsChannels")).find(({ cursor, queue }) => cursor === "" && queue?.[0] === channel)!;
}
