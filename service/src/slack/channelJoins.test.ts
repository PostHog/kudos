// The app joins public channels: the operator's one-off joins every public channel it isn't in yet, a page and a
// Tier 3 slot at a time, and Slack's channel_created puts it in each new one; it stays out of shared and customer
// channels. Today's convex/slack/channelJoins.test.ts, driven through the front door, the worker and the app's clock.
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { httpStatus, networkFailure, rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import { channelCreatedEvent } from "../../testing/slackMessages.ts";
import { decodeStored } from "../db/codec.ts";
import { jobs } from "../db/schema/service.ts";
import { joinPublicChannelsJob } from "./channelJoins.ts";

const now = new Date("2026-10-21T10:00:00Z").getTime();
const backend = useTestBackend({ now });
const tier3Spacing = 60_000 / 50;
const postingMethods = ["chat.postMessage", "chat.postEphemeral", "reactions.add", "views.publish"];

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

describe("the channel join puts the app in every public channel it isn't in yet", () => {
  test("it joins each public, unarchived channel it isn't in across every page, and skips private, archived and externally shared channels and those it is in", async () => {
    t.slack
      .listingChannelsPerPage(2)
      .withChannel("C_FIRST", { name: "first" })
      .withChannel("C_IN", { name: "already-in", joined: true })
      .withChannel("C_ARCHIVED", { name: "archived", kind: "archived" })
      .withChannel("C_PRIVATE", { name: "private", kind: "private" })
      .withChannel("C_SHARED", { name: "shared", kind: "shared" })
      .withChannel("C_INVITED", { name: "invited", kind: "pending-shared" })
      .withChannel("C_LAST", { name: "last" });

    await joinPublicChannels();

    expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: "C_FIRST" }, { channel: "C_LAST" }]);
    expect(t.slack.callsTo("conversations.list")).toEqual([
      { types: "public_channel", exclude_archived: "true", limit: "200" },
      { types: "public_channel", exclude_archived: "true", limit: "200", cursor: "2" },
      { types: "public_channel", exclude_archived: "true", limit: "200", cursor: "4" },
    ]);
    expect(logged).toHaveBeenLastCalledWith("channel joins finished: joined 2, missed 0");
  });

  // Today's case also sends Slack's own join line (a `channel_join` message) and checks nothing answers it. No stack
  // takes in `message` events on the service yet, so that half would pass whatever the handler did: it joins this case
  // when S4's message handler lands (PostHog/kudos#990's Still owed).
  test("joining posts nothing in the channel", async () => {
    t.slack.withChannel("C_FIRST", { name: "first" });

    await joinPublicChannels();

    expect(t.slack.hasJoined("C_FIRST")).toBe(true);
    expect(t.slack.calls.filter(({ method }) => postingMethods.includes(method))).toEqual([]);
  });

  test("a rerun joins nothing it joined before", async () => {
    t.slack.withChannel("C_FIRST", { name: "first" }).withChannel("C_SECOND", { name: "second" });
    await joinPublicChannels();
    const joinedBefore = t.slack.callsTo("conversations.join").length;

    await joinPublicChannels();

    expect(t.slack.callsTo("conversations.join")).toHaveLength(joinedBefore);
    expect(logged).toHaveBeenLastCalledWith("channel joins finished: joined 0, missed 0");
  });

  test("it joins at most one channel per Tier 3 slot and waits out the Retry-After Slack asks for", async () => {
    t.slack.withChannel("C_FIRST", { name: "first" }).withChannel("C_SECOND", { name: "second" }).withChannel("C_THIRD", { name: "third" });
    t.slack.answering("conversations.join", (answerAsSlackWould) => answerAsSlackWould(), rateLimitedFor(30));

    await joinPublicChannels();

    const [first, limited, retried, third] = timesOf("conversations.join");
    expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: "C_FIRST" }, { channel: "C_SECOND" }, { channel: "C_SECOND" }, { channel: "C_THIRD" }]);
    expect(limited! - first!).toBeGreaterThanOrEqual(tier3Spacing);
    expect(retried! - limited!).toBeGreaterThanOrEqual(30_000);
    expect(third! - retried!).toBeGreaterThanOrEqual(tier3Spacing);
    expect(["C_FIRST", "C_SECOND", "C_THIRD"].every((channel) => t.slack.hasJoined(channel))).toBe(true);
  });

  test("a step run twice, as recovery starts a run again from its last step, joins no channel twice", async () => {
    t.slack.listingChannelsPerPage(1).withChannel("C_FIRST", { name: "first" }).withChannel("C_LAST", { name: "last" });
    await joinPublicChannels();

    const step = await stepJoining("C_LAST");
    await t.run((ctx) => ctx.jobs.enqueue(joinPublicChannelsJob, step));
    await settleInTimeOrder();

    expect(["C_FIRST", "C_LAST"].every((channel) => t.slack.hasJoined(channel))).toBe(true);
    expect(logged).toHaveBeenLastCalledWith("channel joins finished: joined 1, missed 0");
  });

  test("a run that finished, started again from its last step, asks Slack nothing", async () => {
    t.slack.withChannel("C_FIRST", { name: "first" });
    await joinPublicChannels();
    const asked = t.slack.calls.length;

    const step = (await stepsOf("slack.channelJoins.joinPublicChannels")).at(-1)!;
    await t.run((ctx) => ctx.jobs.enqueue(joinPublicChannelsJob, step));
    await settleInTimeOrder();

    expect(t.slack.calls).toHaveLength(asked);
    expect(logged).toHaveBeenLastCalledWith("channel joins finished: joined 1, missed 0");
  });

  test("a rate-limited listing waits out the Retry-After and lists the same page again", async () => {
    t.slack.listingChannelsPerPage(1).withChannel("C_FIRST", { name: "first" }).withChannel("C_SECOND", { name: "second" });
    t.slack.answering("conversations.list", (answerAsSlackWould) => answerAsSlackWould(), rateLimitedFor(20));

    await joinPublicChannels();

    const [, limited, retried] = timesOf("conversations.list");
    expect(t.slack.callsTo("conversations.list").map(({ cursor }) => cursor)).toEqual([undefined, "1", "1"]);
    expect(retried! - limited!).toBeGreaterThanOrEqual(20_000);
    expect(t.slack.hasJoined("C_SECOND")).toBe(true);
  });

  test("a channel someone added it to since the listing counts as neither joined nor missed", async () => {
    t.slack.withChannel("C_FIRST", { name: "first" }).withChannel("C_ADDED", { name: "added meanwhile" });
    t.slack.answering("conversations.list", (answerAsSlackWould) => {
      const listed = answerAsSlackWould();
      t.slack.withChannel("C_ADDED", { name: "added meanwhile", joined: true });
      return listed;
    });

    await joinPublicChannels();

    expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: "C_FIRST" }, { channel: "C_ADDED" }]);
    expect(logged).toHaveBeenLastCalledWith("channel joins finished: joined 1, missed 0");
  });

  test("a channel it can't join is missed with Slack's reason and the run goes on to the rest", async () => {
    t.slack.withChannel("C_ARCHIVED_MEANWHILE", { name: "archived meanwhile" }).withChannel("C_UNREACHED", { name: "unreached" }).withChannel("C_LAST", { name: "last" });
    t.slack.answering("conversations.join", slackError("is_archived"), networkFailure);

    await joinPublicChannels();

    expect(t.slack.hasJoined("C_LAST")).toBe(true);
    expect(logged).toHaveBeenLastCalledWith("channel joins finished: joined 1, missed 2");
    expect(console.warn).toHaveBeenCalledWith("channel joins: conversations.join failed: is_archived");
  });

  test("a listing Slack refuses, as before the app has channels:read, ends the run with Slack's error code", async () => {
    t.slack.withChannel("C_FIRST", { name: "first" }).answering("conversations.list", slackError("missing_scope"));

    await joinPublicChannels();

    expect(await jobsNamed("slack.channelJoins.joinPublicChannels")).toEqual([{ state: "failed", error: "ReportableError: Slack conversations.list failed: missing_scope" }]);
    expect(t.slack.callsTo("conversations.join")).toEqual([]);
  });
});

describe("channel_created puts the app in the new public channel", () => {
  test("a new channel gets the app without anyone acting, once even when Slack delivers the event again", async () => {
    t.slack.withChannel("C_NEW", { name: "fresh-channel" });

    expect((await channelCreated("C_NEW", { eventId: "Ev_CREATED" })).status).toBe(200);
    await channelCreated("C_NEW", { eventId: "Ev_CREATED" });
    await settleInTimeOrder();

    expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: "C_NEW" }]);
    expect(t.slack.calls.filter(({ method }) => postingMethods.includes(method))).toEqual([]);
  });

  test("a rate-limited join of a new channel waits out the Retry-After and joins it", async () => {
    t.slack.withChannel("C_NEW", { name: "fresh-channel" }).answering("conversations.join", rateLimitedFor(15));

    await channelCreated("C_NEW");
    await settleInTimeOrder();

    const [limited, retried] = timesOf("conversations.join");
    expect(retried! - limited!).toBeGreaterThanOrEqual(15_000);
    expect(t.slack.hasJoined("C_NEW")).toBe(true);
  });

  test("a join of a new channel that gets no answer is tried again, 3 tries at most", async () => {
    t.slack.withChannel("C_NEW", { name: "fresh-channel" }).withChannel("C_UNLUCKY", { name: "unlucky" });
    t.slack.answering("conversations.join", networkFailure, httpStatus(503));

    await channelCreated("C_NEW");
    await settleInTimeOrder();
    t.slack.answering("conversations.join", networkFailure, httpStatus(503), networkFailure);
    await channelCreated("C_UNLUCKY");
    await settleInTimeOrder();

    expect(t.slack.callsTo("conversations.join")).toEqual([...Array(3).fill({ channel: "C_NEW" }), ...Array(3).fill({ channel: "C_UNLUCKY" })]);
    expect(t.slack.hasJoined("C_NEW")).toBe(true);
    expect(t.slack.hasJoined("C_UNLUCKY")).toBe(false);
    expect(await lastTryOf("C_UNLUCKY")).toBe("failed");
  });

  test("a join of a new channel Slack keeps rate limiting is reported after 3 tries", async () => {
    t.slack.withChannel("C_NEW", { name: "fresh-channel" }).answering("conversations.join", rateLimitedFor(1), rateLimitedFor(1), rateLimitedFor(1));

    await channelCreated("C_NEW");
    await settleInTimeOrder();

    expect(t.slack.callsTo("conversations.join")).toHaveLength(3);
    expect(await lastTryOf("C_NEW")).toBe("failed");
  });

  test("a channel_created without a channel ID is acknowledged and joins nothing, and its redelivery is taken in again", async () => {
    t.slack.withChannel("C_NEW", { name: "fresh-channel" });

    expect((await t.event({ type: "channel_created", channel: {} }, { eventId: "Ev_BARE" })).status).toBe(200);
    await settleInTimeOrder();

    expect(t.slack.calls).toEqual([]);
    expect(await t.seed.all("slackReceipts")).toEqual([]);
  });
});

describe("the app stays out of shared and customer channels", () => {
  test("the channel join skips every channel whose name starts with customer-, and is never told to join one it listed", async () => {
    t.slack.withChannel("C_FIRST", { name: "first" }).withChannel("C_CUSTOMER", { name: "customer-example-internal" }).withChannel("C_CUSTOMERS", { name: "customers" });

    await joinPublicChannels();

    expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: "C_FIRST" }, { channel: "C_CUSTOMERS" }]);
    expect(logged).toHaveBeenLastCalledWith("channel joins finished: joined 2, missed 0");
  });

  test("the channel join skips every channel named like one shared with another organization before the share, posthog- or ext-", async () => {
    t.slack.withChannel("C_POSTHOG", { name: "posthog-example" }).withChannel("C_EXT", { name: "ext-example" }).withChannel("C_POSTHOGGERS", { name: "posthoggers" });

    await joinPublicChannels();

    expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: "C_POSTHOGGERS" }]);
  });

  test("a channel Slack won't describe is never joined", async () => {
    t.slack.withChannel("C_FIRST", { name: "first" }).answering("conversations.info", slackError("missing_scope"));

    await joinPublicChannels();

    expect(t.slack.callsTo("conversations.join")).toEqual([]);
  });

  test.each(["customer-example-internal", "posthog-example", "ext-example"])("a new channel named %s is left without the app, and nothing is tried again", async (name) => {
    t.slack.withChannel("C_NEW", { name });

    await channelCreated("C_NEW");
    await settleInTimeOrder();

    expect(t.slack.callsTo("conversations.join")).toEqual([]);
    expect(await lastTryOf("C_NEW")).toBe("success");
  });
});

// The operator's one-off, as they start it: the job, enqueued, and every job it schedules after it.
async function joinPublicChannels() {
  await t.run((ctx) => ctx.jobs.enqueue(joinPublicChannelsJob, {}));
  await settleInTimeOrder();
}

function channelCreated(channel: string, options: { eventId?: string } = {}) {
  return t.send("/events", channelCreatedEvent(channel, options));
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

async function lastTryOf(channel: string) {
  const tries = await t.query(({ tx }) =>
    tx.select({ state: jobs.state, args: jobs.args }).from(jobs).where(eq(jobs.name, "slack.channelJoins.joinCreatedChannel")).orderBy(asc(jobs._creationTime), asc(jobs._id)),
  );
  return tries.filter(({ args }) => (decodeStored(args) as { channel?: string }).channel === channel).at(-1)?.state;
}

/** The arguments of each step a job ran, in order, as recovery would find them to start the job again. */
async function stepsOf(name: string) {
  const steps = await t.query(({ tx }) => tx.select({ args: jobs.args }).from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id)));
  return steps.map(({ args }) => decodeStored(args) as { cursor?: string; queue?: string[]; joined?: number; missed?: number });
}

/** The step of the channel join that joined `channel`. */
async function stepJoining(channel: string) {
  return (await stepsOf("slack.channelJoins.joinPublicChannels")).find(({ queue }) => queue?.[0] === channel)!;
}
