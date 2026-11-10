// Delivery to Slack: attempts, Retry-After, rate-limit holds, uncertain sends and sends that are gone for good. Each
// case runs a delivery as the app runs one, an action job the worker starts and that schedules its own next try, and
// reads what Slack saw, by the app's clock.
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { FakeSlack, httpStatus, landsButTimesOut, networkFailure, rateLimitedFor, slackError, timesOut, type ScriptedAnswer } from "../../testing/fakeSlack.ts";
import { createAppTime } from "../appTime.ts";
import { createClock } from "../clock.ts";
import { jobs } from "../db/schema/service.ts";
import { clearIndicator, desired, setIndicator } from "../feedback/indicator.ts";
import { actionJob, jobRegistry, type Job } from "../jobs/define.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations, type ActionContext } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import {
  attemptArgs,
  deliverIndicatorJob,
  deliverPrivateReplyJob,
  enqueueAt,
  sendAtMostOnce,
  sendBesideOrAsDirectMessage,
  sendOnce,
  tryAtMostThreeTimes,
  type Retry,
} from "./delivery.ts";
import { heldUntil, hold } from "./rateLimits.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };
const start = Date.parse("2026-10-13T10:00:00Z");
const hour = 60 * 60 * 1000;

// Deliveries shaped like the app's own: a send, retried by a job of its own while it asks to be, at most three tries.
const deliveryArgs = z.strictObject({ how: z.enum(["once", "atMostOnce", "beside"]), method: z.string(), channel: z.string(), text: z.string(), ...attemptArgs });
type Delivery = z.input<typeof deliveryArgs>;

const deliver: Job = actionJob("test.deliver", deliveryArgs, async (ctx, { attempt = 1, ...delivery }) => {
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    (attempt) => send(ctx, delivery, attempt),
    (retry) => enqueueAt(ctx, deliver, { ...delivery, attempt: retry.attempt }, retry.at),
  );
});

function send(ctx: ActionContext, { how, method, channel, text }: Omit<Delivery, "attempt">, attempt: number): Promise<Retry> {
  if (how === "beside") return sendBesideOrAsDirectMessage(ctx, "T1", "U_ALICE", { conversation: channel }, { text }, attempt);
  const sending = how === "once" ? sendOnce : sendAtMostOnce;
  return sending(ctx, "T1", method, method === "chat.postEphemeral" ? { channel, user: "U_ALICE", text } : { channel, text }, attempt);
}

let slack: FakeSlack;
// When each call reached Slack, by the app's clock: the fake's own times are real time, which the clock runs ahead of.
let calls: Array<{ method: string; at: number; args: Record<string, unknown> }>;

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  slack = new FakeSlack().withMember("U_ALICE").withMember("U_BOB");
  calls = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setUp() {
  const clock = createClock({ real: () => start });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
  const worker = createWorker({ operations, log: quiet, registry: jobRegistry([deliver, ...serviceRegistry.jobs.values()]), pollMs: hour });
  const time = createAppTime({ clock, worker, budgetMs: 20_000 });
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const method = new URL(input instanceof Request ? input.url : input).pathname.split("/").pop()!;
    calls.push({ method, at: clock.now(), args: JSON.parse(String(init?.body ?? "{}")) });
    return slack.fetch(input, init);
  });

  /** Runs every delivery due by `until`, moving the clock to each next try. */
  async function settleUntil(until: number) {
    for (;;) {
      await time.settle();
      const [next] = await db.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt)).limit(1);
      if (next === undefined || next.runAt > until) return;
      if (next.runAt > clock.now()) time.advance(next.runAt - clock.now());
    }
  }
  return {
    clock,
    operations,
    time,
    /** Schedules a delivery due now. */
    deliver: (delivery: Delivery) => operations.mutation("test.schedule", ({ jobs }) => jobs.enqueue(deliver, delivery)),
    settleUntil,
    settle: () => settleUntil(Number.POSITIVE_INFINITY),
  };
}

const timesOf = (method: string) => calls.filter((call) => call.method === method).map(({ at }) => at);
const repeated = (times: number, answer: ScriptedAnswer) => Array.from({ length: times }, () => answer);
const post = (text: string, channel = "C1"): Delivery => ({ how: "once", method: "chat.postMessage", channel, text });

describe("R35: Retry-After", () => {
  test("a 429 holds the workspace's next calls to that method until Retry-After has passed, by the app's clock, while other methods go on", async () => {
    const t = setUp();
    t.time.advance(hour); // the app's clock runs ahead of real time, as after the test route's advance
    const limitedAt = t.clock.now();
    slack.answering("chat.postMessage", rateLimitedFor(30));
    await t.deliver(post("first"));
    await t.settleUntil(limitedAt + 10_000);

    t.time.advance(10_000 - (t.clock.now() - limitedAt));
    await t.deliver(post("second"));
    await t.deliver({ how: "once", method: "chat.postEphemeral", channel: "C1", text: "meanwhile" });
    await t.settleUntil(limitedAt + 60_000);

    const [limited, ...later] = timesOf("chat.postMessage");
    expect(limited).toBe(limitedAt);
    expect(later).toHaveLength(2);
    expect(later.every((at) => at >= limitedAt + 30_000), "every later post waits out the Retry-After").toBe(true);
    expect(timesOf("chat.postEphemeral"), "the ephemeral isn't held").toEqual([limitedAt + 10_000]);
    expect(slack.messagesIn("C1").map(({ text }) => text).sort()).toEqual(["first", "second"]);
  });

  test("a later, shorter Retry-After never cuts a longer hold short", async () => {
    const { operations } = setUp();
    const method = { workspace: "T1", method: "reactions.add" };
    await operations.mutation("slack.rateLimits.hold", (ctx) => hold(ctx, { ...method, until: start + 60_000 }));
    await operations.mutation("slack.rateLimits.hold", (ctx) => hold(ctx, { ...method, until: start + 5_000 }));

    expect(await operations.query("slack.rateLimits.heldUntil", (ctx) => heldUntil(ctx, method))).toBe(start + 60_000);
    expect(await operations.query("slack.rateLimits.heldUntil", (ctx) => heldUntil(ctx, { ...method, workspace: "T2" })), "another workspace").toBe(0);
    expect(await operations.query("slack.rateLimits.heldUntil", (ctx) => heldUntil(ctx, { ...method, method: "reactions.remove" })), "another method").toBe(0);
  });
});

describe("R35: a delivery is tried at most 3 times", () => {
  test.each<[string, ScriptedAnswer]>([
    ["an error", slackError("internal_error")],
    ["an HTTP 500", httpStatus(500)],
    ["a 429", rateLimitedFor(5)],
    ["an unknown result", landsButTimesOut],
    ["a timeout", timesOut],
    ["a network failure", networkFailure],
  ])("a send failing with %s every time is sent 3 times and then given up", async (_, failure) => {
    const t = setUp();
    slack.answering("chat.postMessage", ...repeated(10, failure));

    await t.deliver(post("hello"));
    await t.settle();

    expect(timesOf("chat.postMessage")).toHaveLength(3);
    expect(await db.select().from(jobs).where(and(eq(jobs.name, "test.deliver"), eq(jobs.state, "pending")))).toEqual([]);
  });

  test("a send that fails twice is delivered on the third try, after the backoff and then the Retry-After Slack asked for", async () => {
    const t = setUp();
    slack.answering("chat.postMessage", httpStatus(502), rateLimitedFor(20));

    await t.deliver(post("hello"));
    await t.settle();

    const [first, limited, delivered] = timesOf("chat.postMessage");
    expect(limited, "the backoff after the first try").toBe(first! + 2_000);
    expect(delivered, "the Retry-After").toBe(limited! + 20_000);
    expect(slack.messagesIn("C1").map(({ text }) => text)).toEqual(["hello"]);
  });

  test("a delivery that throws counts as a failed try and backs off by the app's clock", async () => {
    const t = setUp();
    t.time.advance(hour);
    let throws = 2;
    const flaky: Job = actionJob("test.flaky", z.strictObject({ ...attemptArgs }), async (ctx, { attempt = 1 }) => {
      await tryAtMostThreeTimes(
        ctx.clock,
        attempt,
        async (attempt) => {
          if (throws-- > 0) throw new Error("the database went away");
          return sendOnce(ctx, "T1", "chat.postMessage", { channel: "C1", text: "after all" }, attempt);
        },
        (retry) => enqueueAt(ctx, flaky, { attempt: retry.attempt }, retry.at),
      );
    });
    const worker = createWorker({ operations: t.operations, log: quiet, registry: jobRegistry([flaky]), pollMs: hour });
    const time = createAppTime({ clock: t.clock, worker, budgetMs: 20_000 });
    const begun = t.clock.now();
    await t.operations.mutation("test.schedule", ({ jobs }) => jobs.enqueue(flaky, {}));

    await time.settle();
    time.advance(2_000);
    await time.settle();
    expect(timesOf("chat.postMessage"), "nothing sent yet: the third try waits 4 s more").toEqual([]);
    time.advance(4_000);
    await time.settle();

    expect(timesOf("chat.postMessage")).toEqual([begun + 6_000]);
    expect(slack.messagesIn("C1").map(({ text }) => text)).toEqual(["after all"]);
  });
});

describe("R35: uncertain sends", () => {
  test("a send whose result nobody knows is sent again by sendOnce, and so may land twice", async () => {
    const t = setUp();
    slack.answering("chat.postMessage", landsButTimesOut);

    await t.deliver(post("twice"));
    await t.settle();

    expect(timesOf("chat.postMessage")).toHaveLength(2);
    expect(slack.messagesIn("C1").map(({ text }) => text)).toEqual(["twice", "twice"]);
  });

  test.each<[string, ScriptedAnswer]>([
    ["an unknown result", landsButTimesOut],
    ["an error", slackError("internal_error")],
    ["an HTTP 500", httpStatus(500)],
  ])("sendAtMostOnce never repeats a send that failed with %s", async (_, failure) => {
    const t = setUp();
    slack.answering("chat.postMessage", failure);

    await t.deliver({ ...post("once"), how: "atMostOnce" });
    await t.settle();

    expect(timesOf("chat.postMessage")).toHaveLength(1);
  });

  test("sendAtMostOnce does try again after a 429, since Slack took nothing", async () => {
    const t = setUp();
    slack.answering("chat.postMessage", rateLimitedFor(7));

    await t.deliver({ ...post("once"), how: "atMostOnce" });
    await t.settle();

    const [limited, sent] = timesOf("chat.postMessage");
    expect(sent).toBe(limited! + 7_000);
    expect(slack.messagesIn("C1").map(({ text }) => text)).toEqual(["once"]);
  });
});

describe("R35: a delivery whose message or channel is gone stops for good", () => {
  test.each(["message_not_found", "channel_not_found", "not_in_channel", "is_archived"])("chat.postMessage answering %s is not tried again", async (error) => {
    const t = setUp();
    slack.answering("chat.postMessage", ...repeated(10, slackError(error)));

    await t.deliver(post("gone"));
    await t.settle();

    expect(timesOf("chat.postMessage")).toHaveLength(1);
  });
});

describe("beside the conversation, or as a direct message", () => {
  test.each(["user_not_in_channel", "channel_not_found", "not_in_channel"])("an ephemeral Slack refuses with %s goes to the member as a direct message", async (error) => {
    const t = setUp();
    slack.answering("chat.postEphemeral", slackError(error));

    await t.deliver({ how: "beside", method: "chat.postEphemeral", channel: "C1", text: "psst" });
    await t.settle();

    expect(calls.map(({ method, args }) => [method, args.channel])).toEqual([
      ["chat.postEphemeral", "C1"],
      ["chat.postMessage", "U_ALICE"],
    ]);
  });

  test("an ephemeral Slack takes sends no direct message, and one that failed is retried beside the conversation", async () => {
    const t = setUp();
    slack.answering("chat.postEphemeral", slackError("internal_error"));

    await t.deliver({ how: "beside", method: "chat.postEphemeral", channel: "C1", text: "psst" });
    await t.settle();

    expect(calls.map(({ method }) => method)).toEqual(["chat.postEphemeral", "chat.postEphemeral"]);
    expect(slack.ephemeralsTo("U_ALICE").map(({ text }) => text)).toEqual(["psst", "psst"]);
  });
});

describe("the indicator", () => {
  const ref = { workspace: "T1", conversation: "C1", message: "1760349600.000100" };

  test("each change moves its version, clearing one that shows nothing changes nothing, and each change schedules its delivery", async () => {
    const { operations } = setUp();
    const desiredNow = () => operations.query("feedback.indicator.desired", (ctx) => desired(ctx, ref));
    expect(await desiredNow(), "never set").toEqual({ indicator: null, version: 0 });

    await operations.mutation("test.set", (ctx) => setIndicator(ctx, { ...ref, receivedAt: 1 } as typeof ref, { emoji: "hourglass_flowing_sand" }));
    await operations.mutation("test.set", (ctx) => setIndicator(ctx, ref, { emoji: "taco" }));
    expect(await desiredNow()).toEqual({ indicator: { emoji: "taco" }, version: 2 });

    await operations.mutation("test.clear", (ctx) => clearIndicator(ctx, ref));
    await operations.mutation("test.clear", (ctx) => clearIndicator(ctx, ref));
    expect(await desiredNow()).toEqual({ indicator: null, version: 3 });

    const scheduled = await db.select({ name: jobs.name, args: jobs.args }).from(jobs).where(eq(jobs.state, "pending"));
    expect(scheduled.map(({ name }) => name)).toEqual(Array.from({ length: 3 }, () => deliverIndicatorJob.name));
  });
});

test("the service runs both delivery jobs by their Convex names", () => {
  expect(serviceRegistry.jobs.get("slack.delivery.deliverIndicator")).toBe(deliverIndicatorJob);
  expect(serviceRegistry.jobs.get("slack.delivery.deliverPrivateReply")).toBe(deliverPrivateReplyJob);
});
