// The one public reply's post, as its delivery moves it: waiting to be posted, claimed by one send, posted with its ts,
// or left unposted. These are the steps slack/publicReplies.ts takes around each Slack call; what the reply may show
// reaches S3's workspace settings and S6's xp-levels, so the deliveries that read it are proven in the ported
// convex/slack/publicNotices.test.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { FakeSlack } from "../../testing/fakeSlack.ts";
import { seeder } from "../../testing/seed.ts";
import { createAppTime } from "../appTime.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import { jobs } from "../db/schema/service.ts";
import { jobRegistry } from "../jobs/define.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import { deliverPublicReplyJob } from "../slack/publicReplies.ts";
import { desired, recordPosted, sendingFailed, startSending, stopPosting, stopSending, type PublicSection } from "./publicReplies.ts";
import type { z } from "zod";
import type { shownValidator } from "./publicReplies.ts";

type Shown = z.infer<typeof shownValidator>;

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const start = Date.parse("2026-10-13T10:00:00Z");
const hour = 60 * 60 * 1000;

let slackCalls: string[];

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  slackCalls = [];
  const slack = new FakeSlack().withMember("U_ALICE");
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    slackCalls.push(new URL(input instanceof Request ? input.url : input).pathname.split("/").pop()!);
    return slack.fetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function setUp() {
  const clock = createClock({ real: () => start });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
  const seed = seeder(operations);
  const step = <T>(handler: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.step", handler);

  async function reply(shown: Shown, version = 1): Promise<Id<"publicReplies">> {
    const member = await seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member" });
    const section: PublicSection = { key: "level:U_ALICE", member, about: "level", line: [{ text: "🎉 " }, { mention: { kind: "person", user: "U_ALICE" } }, { text: " reached level 2." }] };
    return seed.insert("publicReplies", { workspace: "T1", conversation: "C_KUDOS", message: "1700000000.000100", channel: "C_ANNOUNCE", sections: [section], version, shown });
  }

  return {
    operations,
    seed,
    reply,
    shownOf: async (id: Id<"publicReplies">) => (await seed.get("publicReplies", id))?.shown,
    startSending: (reply: Id<"publicReplies">) => step((m) => startSending(m, { reply })),
    sendingFailed: (reply: Id<"publicReplies">) => step((m) => sendingFailed(m, { reply })),
    stopPosting: (reply: Id<"publicReplies">) => step((m) => stopPosting(m, { reply })),
    stopSending: (reply: Id<"publicReplies">) => step((m) => stopSending(m, { reply })),
    recordPosted: (reply: Id<"publicReplies">, ts: string) => step((m) => recordPosted(m, { reply, ts })),
    worker: () => {
      const worker = createWorker({ operations, log: quiet, registry: jobRegistry([...serviceRegistry.jobs.values()]), pollMs: hour });
      return createAppTime({ clock, worker, budgetMs: 20_000 });
    },
  };
}

const posted: Shown = { state: "posted", ts: "1700000000.000200" };

describe("claiming the one post", () => {
  test("a reply waiting to be posted is claimed by one send only", async () => {
    const t = setUp();
    const reply = await t.reply({ state: "posting" });

    expect(await t.startSending(reply)).toBe(true);
    expect(await t.startSending(reply)).toBe(false);
    expect(await t.shownOf(reply)).toEqual({ state: "sending" });
  });

  test.each<Shown>([{ state: "sending" }, posted, { state: "unposted" }])("a reply that is $state is never claimed, and stays as it is", async (shown) => {
    const t = setUp();
    const reply = await t.reply(shown);

    expect(await t.startSending(reply)).toBe(false);
    expect(await t.shownOf(reply)).toEqual(shown);
  });
});

describe("a post Slack refused", () => {
  test("waits to be posted again, and the next send claims it", async () => {
    const t = setUp();
    const reply = await t.reply({ state: "posting" });
    await t.startSending(reply);

    await t.sendingFailed(reply);

    expect(await t.shownOf(reply)).toEqual({ state: "posting" });
    expect(await t.startSending(reply)).toBe(true);
  });

  test.each<Shown>([posted, { state: "unposted" }, { state: "posting" }])("leaves a reply that is $state as it is", async (shown) => {
    const t = setUp();
    const reply = await t.reply(shown);

    await t.sendingFailed(reply);

    expect(await t.shownOf(reply)).toEqual(shown);
  });
});

describe("leaving a reply unposted", () => {
  test("giving up on a reply still waiting leaves it unposted", async () => {
    const t = setUp();
    const reply = await t.reply({ state: "posting" });

    await t.stopPosting(reply);

    expect(await t.shownOf(reply)).toEqual({ state: "unposted" });
    expect(await t.startSending(reply)).toBe(false);
  });

  test.each<Shown>([{ state: "sending" }, posted])("giving up never touches a reply that is $state", async (shown) => {
    const t = setUp();
    const reply = await t.reply(shown);

    await t.stopPosting(reply);

    expect(await t.shownOf(reply)).toEqual(shown);
  });

  test("a post whose conversation is gone leaves the reply unposted", async () => {
    const t = setUp();
    const reply = await t.reply({ state: "posting" });
    await t.startSending(reply);

    await t.stopSending(reply);

    expect(await t.shownOf(reply)).toEqual({ state: "unposted" });
  });

  test.each<Shown>([{ state: "posting" }, posted])("a gone conversation never touches a reply that is $state", async (shown) => {
    const t = setUp();
    const reply = await t.reply(shown);

    await t.stopSending(reply);

    expect(await t.shownOf(reply)).toEqual(shown);
  });
});

describe("recording the post", () => {
  test("keeps the message's ts, and answers the version a change made while it posted", async () => {
    const t = setUp();
    const reply = await t.reply({ state: "posting" });
    await t.startSending(reply);
    await t.seed.patch("publicReplies", reply, { version: 2 });

    expect(await t.recordPosted(reply, "1700000000.000200")).toBe(2);
    expect(await t.shownOf(reply)).toEqual(posted);
  });

  test("a reply that is gone records nothing and answers version 0", async () => {
    const t = setUp();
    const gone = "a-reply-that-is-gone" as Id<"publicReplies">;

    expect(await t.recordPosted(gone, "1700000000.000200")).toBe(0);
    expect(await t.seed.all("publicReplies")).toEqual([]);
  });
});

test("a reply that is gone has nothing to deliver, and its delivery calls Slack for nothing", async () => {
  const t = setUp();
  const gone = "a-reply-that-is-gone" as Id<"publicReplies">;
  const time = t.worker();

  expect(await t.operations.query("test.desired", (q) => desired(q, { reply: gone }))).toBeNull();
  await t.operations.mutation("test.schedule", ({ jobs }) => jobs.enqueue(deliverPublicReplyJob, { reply: gone }));
  await time.settle();

  expect(slackCalls).toEqual([]);
  const states = await t.operations.query("test.jobs", async ({ tx }) => (await tx.select({ name: jobs.name, state: jobs.state }).from(jobs)).map(({ name, state }) => `${name} ${state}`));
  expect(states).toEqual(["slack.publicReplies.deliverPublicReply success"]);
});

test("the service runs the public reply, direct message and purchase reply deliveries by their Convex names", () => {
  const names = [...serviceRegistry.jobs.keys()];

  expect(names).toEqual(expect.arrayContaining(["slack.publicReplies.deliverPublicReply", "slack.directMessages.deliverDirectMessage", "slack.directMessages.deliverPurchaseReply"]));
});
