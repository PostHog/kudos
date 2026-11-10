// The weekly post, switched on as the Admin tab switches it and run as the app runs it: booked jobs the worker
// starts by the app's clock, a claim per week, a post to Slack and the retries Slack asks for. Two workers on one
// database stand in for the two copies a deploy runs side by side.
//
// What the post reads from other stacks isn't ported yet (S3's workspace settings, S6's xp-levels switch, S11's
// group availability, boards and featured new givers, S8's album switch): each answers here at its seam with a fixed value, so this file
// proves the week's booking, claim and delivery on their own. The faithful port of today's convex/slack/mondayPost*
// tests replaces these stand-ins once those bodies land (ticket's Still owed).
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { FakeSlack, landsButTimesOut, rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { createAppTime } from "../appTime.ts";
import { createClock, type Clock } from "../clock.ts";
import { jobs } from "../db/schema/service.ts";
import { createWorker, type Worker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations, type Operations } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import { pickMondayPostChannel, setMondayPost } from "./mondayPost.ts";

const standIn = vi.hoisted(() => ({
  xpLevelsShown: true,
  groupsAvailable: true,
  announcementChannel: "C_ANNOUNCE" as string | null,
  givers: 4,
  unfeatured: vi.fn(async (_ctx: unknown, _workspace: string, _week: string) => {}),
}));

vi.mock("../progression/xpLevels.ts", async (original) => ({ ...(await original<object>()), xpLevelsShownIn: async () => standIn.xpLevelsShown }));
vi.mock("../groups/groups.ts", async (original) => ({ ...(await original<object>()), availableIn: async () => standIn.groupsAvailable }));
vi.mock("../workspace/settings.ts", async (original) => ({
  ...(await original<object>()),
  settingsOf: async () => ({ baseAllowance: 5, kudosEmoji: "taco", announcementChannel: standIn.announcementChannel }),
}));
vi.mock("../workspace/workspaceSettings.ts", async (original) => ({ ...(await original<object>()), maintainerSettingsApplyTo: async () => true }));
vi.mock("../feedback/albumSlack.ts", async (original) => ({ ...(await original<object>()), albumSlackAppliesToWorkspace: async () => false }));
vi.mock("./groupBoards.ts", async (original) => ({
  ...(await original<object>()),
  workspaceGroupsBoardOf: async () => ({
    rows: [
      { position: 1, rank: 1, name: "Owls", perMember: 1, kudos: 3 },
      { position: 2, rank: 2, name: "Zebras", perMember: 1 / 3, kudos: 1 },
    ],
    mostImproved: { group: "owls", name: "Owls", gain: 2 },
  }),
}));
vi.mock("./newGivers.ts", async (original) => ({ ...(await original<object>()), unfeatureNewGivers: standIn.unfeatured }));
vi.mock("./totals.ts", async (original) => ({ ...(await original<object>()), giversIn: async () => standIn.givers }));

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const seed = seeder(createOperations({ pool: database.pool, clock: createClock(), log: { info: () => {}, error: () => {} } }));
const quiet: Log = { info: () => {}, error: () => {} };
const wednesday = Date.parse("2026-10-14T10:00:00Z");
const week = 7 * 24 * 60 * 60 * 1000;
const budgetMs = 20_000;
const weeklyPost = ["🏆 Last week in kudos", "🥇 Owls · 1.0 per person", "🥈 Zebras · 0.3 per person", "📈 Most improved: Owls", "4 people gave kudos last week. Thank you!"].join("\n");

let slack: FakeSlack;
// Each post that reached Slack, by the app's clock: the fake's own times are real time, which the clock runs ahead of.
let posts: Array<{ at: number; channel: string; text: string }>;
let joins: string[];

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "phx-test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Object.assign(standIn, { xpLevelsShown: true, groupsAvailable: true, announcementChannel: "C_ANNOUNCE", givers: 4 });
  standIn.unfeatured.mockClear();
  slack = new FakeSlack().withMember("U_ALICE");
  posts = [];
  joins = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A copy of the app: its own runner and worker on the shared database and the shared app clock. */
function copyOn(clock: Clock): { operations: Operations; worker: Worker } {
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
  return { operations, worker: createWorker({ operations, log: quiet, registry: serviceRegistry.jobs, pollMs: week, concurrency: 2 }) };
}

async function setUp() {
  const clock = createClock({ real: () => wednesday });
  const first = copyOn(clock);
  const second = copyOn(clock);
  const time = createAppTime({ clock, worker: first.worker, budgetMs });
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const method = new URL(input instanceof Request ? input.url : input).pathname.split("/").pop()!;
    const args = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
    const answer = await slack.fetch(input, init);
    if (method === "chat.postMessage" && (await answer.clone().json()).ok) posts.push({ at: clock.now(), channel: args.channel!, text: args.text! });
    if (method === "conversations.join") joins.push(args.channel!);
    return answer;
  });
  await definitionsStored(first.operations, onForEveryone("monday-post"), onForEveryone("weekly-post-channel"));
  const alice = await seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", timeZone: "Europe/Berlin" });
  const admin = { member: alice, timeZone: "Europe/Berlin" as string | undefined, admin: true };
  const { operations } = first;

  /** Runs every job due by `until` on both copies at once, moving the clock to each next job. */
  async function settleUntil(until: number) {
    for (;;) {
      await Promise.all([first.worker.settle(budgetMs), second.worker.settle(budgetMs)]);
      const [next] = await db.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt)).limit(1);
      if (next === undefined || next.runAt > until) break;
      if (next.runAt > clock.now()) time.advance(next.runAt - clock.now());
    }
    if (until > clock.now()) time.advance(until - clock.now());
  }

  return {
    clock,
    operations,
    settleUntil,
    switchOn: (timeZone?: string) => operations.mutation("website.settings.setMondayPost", (ctx) => setMondayPost(ctx, "T1", admin, { on: true, timeZone })),
    switchOff: () => operations.mutation("website.settings.setMondayPost", (ctx) => setMondayPost(ctx, "T1", admin, { on: false })),
    pick: (channel: string) => operations.mutation("website.settings.pickMondayPostChannel", (ctx) => pickMondayPostChannel(ctx, "T1", admin, channel)),
    /** The weekly post's jobs still to run, by when. */
    bookedPosts: async () =>
      (await db.select({ runAt: jobs.runAt }).from(jobs).where(and(eq(jobs.name, "slack.mondayPost.postMondayPost"), eq(jobs.state, "pending"))).orderBy(asc(jobs.runAt))).map(({ runAt }) => runAt),
    settings: async () => (await seed.all("mondayPostSettings"))[0]!,
    claims: () => seed.all("mondayPostClaims"),
  };
}

const postTimes = () => posts.map(({ at }) => at);

describe("GB28: the weekly post goes out every Monday at 9:00 in the admin's time zone", () => {
  test("switched on in Berlin on a Wednesday, last week's top groups are posted Monday 9:00 Berlin time in the announcement channel", async () => {
    const t = await setUp();
    expect(await t.switchOn()).toBe(true);

    await t.settleUntil(Date.parse("2026-10-19T07:00:00Z"));

    expect(posts).toEqual([{ at: Date.parse("2026-10-19T07:00:00Z"), channel: "C_ANNOUNCE", text: weeklyPost }]);
    expect((await t.claims()).map(({ week, outcome }) => ({ week, outcome }))).toEqual([{ week: "2026-10-19", outcome: "posted" }]);
  });

  test("in a half-hour zone it goes out at 9:00 there", async () => {
    const t = await setUp();
    await t.switchOn("Asia/Kolkata");

    await t.settleUntil(Date.parse("2026-10-19T03:30:00Z"));

    expect(postTimes()).toEqual([Date.parse("2026-10-19T03:30:00Z")]);
  });

  test("across a daylight-saving change it still goes out at 9:00 Berlin time, an hour later in UTC", async () => {
    const t = await setUp();
    await t.switchOn();

    await t.settleUntil(Date.parse("2026-10-26T08:00:00Z"));

    expect(postTimes()).toEqual([Date.parse("2026-10-19T07:00:00Z"), Date.parse("2026-10-26T08:00:00Z")]);
    expect(await t.bookedPosts(), "the one after is booked, in winter time").toEqual([Date.parse("2026-11-02T08:00:00Z")]);
  });

  test("an admin who picks another time zone moves the post to 9:00 there, and the job from before the change posts nothing", async () => {
    const t = await setUp();
    await t.switchOn();
    expect(await t.switchOn("America/New_York")).toBe(true);

    await t.settleUntil(Date.parse("2026-10-19T13:00:00Z"));

    expect(postTimes()).toEqual([Date.parse("2026-10-19T13:00:00Z")]);
  });

  test("a week nobody gave kudos posts nothing and claims the week, and the next week with kudos posts", async () => {
    const t = await setUp();
    await t.switchOn();
    standIn.givers = 0;
    await t.settleUntil(Date.parse("2026-10-19T07:00:00Z"));
    standIn.givers = 4;

    await t.settleUntil(Date.parse("2026-10-26T08:00:00Z"));

    expect(postTimes()).toEqual([Date.parse("2026-10-26T08:00:00Z")]);
    expect((await t.claims()).map(({ outcome }) => outcome)).toEqual(["nobody-gave", "posted"]);
  });
});

describe("GB28, 12.1: the weekly post goes out at most once a week", () => {
  test("the job from before a switch-off posts nothing, then or later", async () => {
    const t = await setUp();
    await t.switchOn();
    expect(await t.switchOff()).toBe(true);

    await t.settleUntil(wednesday + 2 * week);

    expect(posts).toEqual([]);
    expect(await t.bookedPosts()).toEqual([]);
  });

  test("two copies running four jobs for the same Monday at once post once, and book next Monday once", async () => {
    const t = await setUp();
    await t.switchOn();
    const { generation } = await t.settings();
    // Three more jobs for the same post at the same instant, as stale bookings and a second copy's would be.
    const { postMondayPostJob } = await import("../slack/mondayPost.ts");
    for (let extra = 0; extra < 3; extra++) {
      await t.operations.mutation("test.book", ({ jobs }) => jobs.enqueue(postMondayPostJob, { workspace: "T1", generation }, { at: Date.parse("2026-10-19T07:00:00Z") }));
    }

    await t.settleUntil(Date.parse("2026-10-19T07:00:00Z"));

    expect(postTimes()).toEqual([Date.parse("2026-10-19T07:00:00Z")]);
    expect(await t.claims()).toHaveLength(1);
    expect(await t.bookedPosts()).toEqual([Date.parse("2026-10-26T08:00:00Z")]);
  });

  test("a job that runs before 9:00 on Monday posts nothing, and the post goes out at 9:00", async () => {
    const t = await setUp();
    await t.switchOn();
    const { postMondayPostJob } = await import("../slack/mondayPost.ts");
    const { generation } = await t.settings();
    await t.operations.mutation("test.book", ({ jobs }) => jobs.enqueue(postMondayPostJob, { workspace: "T1", generation }, { at: Date.parse("2026-10-19T06:00:00Z") }));

    await t.settleUntil(Date.parse("2026-10-19T06:30:00Z"));
    expect(posts).toEqual([]);

    await t.settleUntil(Date.parse("2026-10-19T07:00:00Z"));
    expect(postTimes()).toEqual([Date.parse("2026-10-19T07:00:00Z")]);
  });

  test("with xp-levels hidden in the workspace the job posts nothing", async () => {
    const t = await setUp();
    await t.switchOn();
    standIn.xpLevelsShown = false;

    await t.settleUntil(Date.parse("2026-10-19T07:00:00Z"));

    expect(posts).toEqual([]);
  });

  test("a post whose answer is lost isn't sent again that week, and next week's goes out", async () => {
    const t = await setUp();
    await t.switchOn();
    slack.answering("chat.postMessage", landsButTimesOut);

    await t.settleUntil(Date.parse("2026-10-26T08:00:00Z"));

    expect(slack.messagesIn("C_ANNOUNCE").map(({ text }) => text)).toEqual([weeklyPost, weeklyPost]);
    expect(postTimes(), "the lost one reached Slack but answered nothing; only next week's answered").toEqual([Date.parse("2026-10-26T08:00:00Z")]);
    expect((await t.claims()).map(({ outcome }) => outcome)).toEqual(["failed", "posted"]);
  });

  test("a post Slack rate-limits goes out once, after the Retry-After", async () => {
    const t = await setUp();
    await t.switchOn();
    slack.answering("chat.postMessage", rateLimitedFor(30));

    await t.settleUntil(Date.parse("2026-10-19T07:05:00Z"));

    expect(postTimes()).toEqual([Date.parse("2026-10-19T07:00:30Z")]);
    expect((await t.claims()).map(({ outcome }) => outcome)).toEqual(["posted"]);
  });

  test("a post Slack keeps rate-limiting is given up after three tries that week, and next week's goes out", async () => {
    const t = await setUp();
    await t.switchOn();
    slack.answering("chat.postMessage", rateLimitedFor(30), rateLimitedFor(30), rateLimitedFor(30));

    await t.settleUntil(Date.parse("2026-10-26T08:00:00Z"));

    expect(slack.calls.filter(({ method }) => method === "chat.postMessage")).toHaveLength(4);
    expect(postTimes()).toEqual([Date.parse("2026-10-26T08:00:00Z")]);
    expect((await t.claims()).map(({ outcome }) => outcome)).toEqual(["failed", "posted"]);
  });

  test("a channel that refuses the post is a can't-post week, and the next week tries again", async () => {
    const t = await setUp();
    await t.switchOn();
    slack.answering("chat.postMessage", slackError("restricted_action"));

    await t.settleUntil(Date.parse("2026-10-26T08:00:00Z"));

    expect((await t.claims()).map(({ outcome }) => outcome)).toEqual(["cant-post", "posted"]);
    expect(standIn.unfeatured.mock.calls.map(([, workspace, week]) => [workspace, week]), "the week's featured new givers are given back").toEqual([["T1", "2026-10-19"]]);
  });
});

describe("GB28: an admin picks the weekly post's channel, and the bot checks it by joining", () => {
  test("a public channel is joined and becomes the post's channel", async () => {
    slack = slack.withChannel("C_CELEBRATE", { name: "celebrate", kind: "public" });
    const t = await setUp();
    await t.switchOn();

    expect(await t.pick("C_CELEBRATE")).toEqual({ kind: "checking", pick: 1 });
    await t.settleUntil(Date.parse("2026-10-19T07:00:00Z"));

    expect(joins).toEqual(["C_CELEBRATE"]);
    expect(await t.settings()).toMatchObject({ channel: { id: "C_CELEBRATE", name: "celebrate" }, channelCheck: { channel: "C_CELEBRATE", pick: 1, outcome: "picked" } });
    expect(posts.map(({ channel }) => channel)).toEqual(["C_CELEBRATE"]);
  });

  test("a private channel is refused, and the post stays in the announcement channel", async () => {
    slack = slack.withChannel("C_SECRET", { name: "secret", kind: "private" });
    const t = await setUp();
    await t.switchOn();

    await t.pick("C_SECRET");
    await t.settleUntil(Date.parse("2026-10-19T07:00:00Z"));

    expect((await t.settings()).channelCheck).toEqual({ channel: "C_SECRET", pick: 1, outcome: "private" });
    expect((await t.settings()).channel).toBeUndefined();
    expect(posts.map(({ channel }) => channel)).toEqual(["C_ANNOUNCE"]);
  });

  test("a check that answers after a later pick records nothing: only the latest pick is checked", async () => {
    slack = slack.withChannel("C_FIRST", { name: "first", kind: "public" }).withChannel("C_SECOND", { name: "second", kind: "public" });
    const t = await setUp();
    await t.switchOn();

    await t.pick("C_FIRST");
    await t.pick("C_SECOND");
    await t.settleUntil(wednesday);

    expect(joins.sort()).toEqual(["C_FIRST", "C_SECOND"]);
    expect(await t.settings()).toMatchObject({ channel: { id: "C_SECOND", name: "second" }, channelCheck: { channel: "C_SECOND", pick: 2, outcome: "picked" } });
  });
});
