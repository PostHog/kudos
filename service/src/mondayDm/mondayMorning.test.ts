// The Monday DM as the app runs it: the hourly sweep (the cron) books each member's DM for 9:00 on Monday in their
// own time zone, the worker starts it by the app's clock, Slack gets it, and Slack's answer settles it. Two workers on
// one database stand in for the two copies a deploy runs side by side.
//
// What the DM reads from other stacks isn't ported yet (S3's directory, S6's xp levels, S7's quest sections, S13's hugs, S8's
// album ledger, S9's hype reactions, the message settings, the welcome and the usage reports): each answers here at
// its seam with a value the test sets, so this file proves the DM's booking, tries and delivery on their own. The
// faithful port of today's convex/mondayDm/mondayDm.test.ts and convex/slack/mondayDmHugs.test.ts replaces these
// stand-ins once those bodies land (ticket's Still owed).
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { FakeSlack, landsButTimesOut, rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { createAppTime } from "../appTime.ts";
import { createClock, type Clock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import { jobs } from "../db/schema/service.ts";
import type { HugsSection } from "../hugs/recap.ts";
import { createWorker, type Worker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import type { MessagePlace } from "../messageSettings/kinds.ts";
import { createOperations, type Operations } from "../operations.ts";
import type { QuestsSection } from "../quests/mondaySection.ts";
import { serviceRegistry } from "../registry.ts";
import type { MemberId } from "../workspace/directory.ts";
import { resumeMondayQuests, stopMondayQuests } from "./stop.ts";

type Person = { user: string; timeZone: string | null; inTheWorkspace: boolean; xpLevelsOn: boolean; welcomedAt: number | null; quests: QuestsSection | null; hugs: HugsSection | null; place: MessagePlace };

const standIn = vi.hoisted(() => ({ people: new Map<string, Person>(), hugWeeks: [] as Array<{ member: string; week: string }> }));
const personOf = (member: string) => standIn.people.get(member)!;

vi.mock("../workspace/directory.ts", async (original) => ({
  ...(await original<object>()),
  isMember: async (_ctx: unknown, member: string) => personOf(member).inTheWorkspace,
  chatUserOf: async (_ctx: unknown, member: string) => ({ workspace: "T1", user: personOf(member).user }),
  timeZoneOf: async (_ctx: unknown, member: string) => personOf(member).timeZone,
}));
// The Monday path is the monday-quest flag (stored on for everyone below) and xp levels being on for the member, S6's.
vi.mock("../progression/xpLevels.ts", async (original) => ({ ...(await original<object>()), xpLevelsOnFor: async (_ctx: unknown, member: string) => personOf(member).xpLevelsOn }));
vi.mock("../quests/mondaySection.ts", async (original) => ({ ...(await original<object>()), questsSectionFor: async (_ctx: unknown, member: string) => personOf(member).quests }));
vi.mock("../hugs/recap.ts", async (original) => ({
  ...(await original<object>()),
  hugsSectionFor: async (_ctx: unknown, member: string) => personOf(member).hugs,
  hugsSentInTheMondayDm: async () => {},
}));
// As the hugWeeks by_week index reads them: the weeks from `since` on, in week order, a page at a time.
vi.mock("../hugs/weeks.ts", async (original) => ({
  ...(await original<object>()),
  hugWeeksSince: async (_ctx: unknown, since: string, { numItems, cursor }: { numItems: number; cursor: string | null }) => {
    const from = cursor === null ? 0 : Number(cursor);
    const weeks = standIn.hugWeeks.filter(({ week }) => week >= since).sort((one, other) => one.week.localeCompare(other.week));
    const to = from + numItems;
    return { weeks: weeks.slice(from, to), next: to >= weeks.length ? null : String(to) };
  },
}));
vi.mock("../welcome/welcome.ts", async (original) => ({
  ...(await original<object>()),
  welcomeOf: async (_ctx: unknown, member: string) => {
    const at = personOf(member).welcomedAt;
    return at === null ? null : { _id: "welcome", _creationTime: at, member };
  },
}));
vi.mock("../feedback/dmLinks.ts", async (original) => ({ ...(await original<object>()), dmLinksFor: async () => ({ book: "https://kudos.example/book", quests: "https://kudos.example/quests" }) }));
vi.mock("../feedback/settingsFooter.ts", async (original) => ({ ...(await original<object>()), settingsFooterFor: async () => ({ appHome: "Settings", rest: " · change what I send you" }) }));
vi.mock("../album/items/ledger.ts", async (original) => ({ ...(await original<object>()), shownWaitingHoggiesOf: async () => 0 }));
vi.mock("../album/hypeReactions.ts", async (original) => ({ ...(await original<object>()), nudgesFor: async () => [] }));
vi.mock("../analytics/isolatedUsage.ts", async (original) => ({ ...(await original<object>()), reportMondayDmSent: async () => {}, reportMessageSettingChanged: async () => {} }));
vi.mock("../messageSettings/messageSettings.ts", async (original) => ({
  ...(await original<object>()),
  placeOf: async (_ctx: unknown, member: string) => personOf(member).place,
  setMessageSetting: async (_ctx: unknown, member: string, _kind: string, place: MessagePlace) => {
    const changed = personOf(member).place !== place;
    personOf(member).place = place;
    return changed;
  },
}));

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };
const seed = seeder(createOperations({ pool: database.pool, clock: createClock(), log: quiet }));
const hour = 60 * 60 * 1000;
const week = 7 * 24 * hour;
const budgetMs = 20_000;
const sweep = "mondayDm.mondayDm.ensureMondayDms";
const oneQuest: QuestsSection = { kind: "drawn", quests: [{ goal: "Thank a teammate", finished: false, progress: null }] };
const questsHeading = "Here is one quest for your week.";
const hugsRecap: HugsSection = { lines: ["You hugged 2 teammates last week."], closing: ["Keep them coming."], emojiLine: null };

let slack: FakeSlack;
// Each DM that reached Slack, by the app's clock: the fake's own times are real time, which the clock runs ahead of.
let posts: Array<{ at: number; channel: string; text: string; blocks?: unknown }>;

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "phx-test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  standIn.people.clear();
  standIn.hugWeeks = [];
  slack = new FakeSlack();
  posts = [];
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

async function setUp(startsAt: string) {
  const clock = createClock({ real: () => Date.parse(startsAt) });
  const first = copyOn(clock);
  const second = copyOn(clock);
  const time = createAppTime({ clock, worker: first.worker, budgetMs });
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const method = new URL(input instanceof Request ? input.url : input).pathname.split("/").pop()!;
    const args = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const answer = await slack.fetch(input, init);
    if (method === "chat.postMessage" && (await answer.clone().json()).ok) posts.push({ at: clock.now(), channel: String(args.channel), text: String(args.text), blocks: args.blocks });
    return answer;
  });
  await definitionsStored(first.operations, onForEveryone("monday-quest"));

  /** A member who started quests, so the sweep looks at them; on the Monday path with this week's quest unless told. */
  async function person(user: string, timeZone: string | null, details: Partial<Person> = {}): Promise<MemberId> {
    const member = await seed.insert("members", { workspace: "T1", user, kind: "member", ...(timeZone !== null && { timeZone }) });
    standIn.people.set(member, { user, timeZone, inTheWorkspace: true, xpLevelsOn: true, welcomedAt: null, quests: oneQuest, hugs: null, place: "dm", ...details });
    await seed.insert("questStarts", { member, at: clock.now() });
    return member;
  }

  /** A member off the Monday path who only had hugs, so only the hug-weeks sweep finds them. */
  async function hugger(user: string, week: string): Promise<MemberId> {
    const member = await seed.insert("members", { workspace: "T1", user, kind: "member", timeZone: "Europe/Berlin" });
    standIn.people.set(member, { user, timeZone: "Europe/Berlin", inTheWorkspace: true, xpLevelsOn: false, welcomedAt: null, quests: null, hugs: hugsRecap, place: "dm" });
    standIn.hugWeeks.push({ member, week });
    return member;
  }

  /** Runs every job due by `until` on both copies at once, moving the clock to each next job. */
  async function settleUntil(until: string) {
    const end = Date.parse(until);
    for (;;) {
      await Promise.all([first.worker.settle(budgetMs), second.worker.settle(budgetMs)]);
      const [next] = await db.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt)).limit(1);
      if (next === undefined || next.runAt > end) break;
      if (next.runAt > clock.now()) time.advance(next.runAt - clock.now());
    }
    if (end > clock.now()) time.advance(end - clock.now());
  }

  /** The hourly sweep at `at`, as the worker fires its cron. */
  async function sweepAt(at: string) {
    await settleUntil(at);
    expect(await time.runCron(sweep)).toMatchObject({ done: true });
  }

  return {
    clock,
    operations: first.operations,
    first,
    second,
    person,
    hugger,
    settleUntil,
    sweepAt,
    /** The DM jobs still to run, by when. */
    bookedTries: async () =>
      (await db.select({ runAt: jobs.runAt }).from(jobs).where(and(eq(jobs.name, "slack.mondayDm.sendMondayDm"), eq(jobs.state, "pending"))).orderBy(asc(jobs.runAt))).map(({ runAt }) => new Date(runAt).toISOString()),
    dms: async () => (await seed.all("mondayDms")).map(({ member, monday, state, tries }) => ({ member, monday, state, tries })),
  };
}

const iso = (at: number) => new Date(at).toISOString();
const postsTo = (user: string) => posts.filter(({ channel }) => channel === user);

describe("the Monday DM reaches each member at 9:00 on Monday in their own time zone", () => {
  test("swept on a Wednesday, a Berlin member's DM goes out Monday 9:00 Berlin time, and the next one at 9:00 again after the clocks go back", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    const ann = await t.person("U_ANN", "Europe/Berlin");

    await t.sweepAt("2026-10-14T10:00:00Z");
    expect(await t.bookedTries()).toEqual(["2026-10-19T07:00:00.000Z"]);
    await t.settleUntil("2026-10-19T12:00:00Z");
    expect(postsTo("U_ANN").map(({ at }) => iso(at))).toEqual(["2026-10-19T07:00:00.000Z"]);
    expect(postsTo("U_ANN")[0]!.text).toContain(questsHeading);
    expect(await t.dms()).toEqual([{ member: ann, monday: "2026-10-19", state: "sent", tries: 1 }]);

    // Berlin leaves summer time on Sunday 25 October: 9:00 is 08:00 UTC from then on.
    await t.sweepAt("2026-10-20T10:00:00Z");
    expect(await t.bookedTries()).toEqual(["2026-10-26T08:00:00.000Z"]);
    await t.settleUntil("2026-10-26T12:00:00Z");
    expect(postsTo("U_ANN").map(({ at }) => iso(at))).toEqual(["2026-10-19T07:00:00.000Z", "2026-10-26T08:00:00.000Z"]);
  });

  test("members in other zones get theirs at their own 9:00, and one with no zone at 9:00 UTC", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    await t.person("U_ANN", "Europe/Berlin");
    await t.person("U_BEN", "America/New_York");
    await t.person("U_CHA", "Asia/Kolkata");
    await t.person("U_DOT", null);

    await t.sweepAt("2026-10-14T10:00:00Z");
    await t.settleUntil("2026-10-19T23:00:00Z");
    expect(Object.fromEntries(posts.map(({ channel, at }) => [channel, iso(at)]))).toEqual({
      U_CHA: "2026-10-19T03:30:00.000Z",
      U_ANN: "2026-10-19T07:00:00.000Z",
      U_DOT: "2026-10-19T09:00:00.000Z",
      U_BEN: "2026-10-19T13:00:00.000Z",
    });
  });

  test("a member who moves zones after the booking gets the DM at 9:00 where they are on Monday", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    const ann = await t.person("U_ANN", "Europe/Berlin");
    await t.sweepAt("2026-10-14T10:00:00Z");

    personOf(ann).timeZone = "America/New_York";
    await t.settleUntil("2026-10-19T23:00:00Z");
    expect(postsTo("U_ANN").map(({ at }) => iso(at))).toEqual(["2026-10-19T13:00:00.000Z"]);
  });

  test("swept on Monday before 9:00, the DM is that morning's; welcomed that Monday, it waits for the next", async () => {
    const t = await setUp("2026-10-19T05:00:00Z");
    await t.person("U_ANN", "Europe/Berlin");
    await t.person("U_BEN", "Europe/Berlin", { welcomedAt: Date.parse("2026-10-19T04:30:00Z") });

    await t.sweepAt("2026-10-19T05:00:00Z");
    expect(await t.bookedTries()).toEqual(["2026-10-19T07:00:00.000Z", "2026-10-26T08:00:00.000Z"]);
  });

  test("the hourly sweep books one DM a week however often it runs, and two copies sweeping at once book it once", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    const ann = await t.person("U_ANN", "Europe/Berlin");

    await Promise.all([t.first.worker.runCron(sweep, budgetMs), t.second.worker.runCron(sweep, budgetMs)]);
    await t.sweepAt("2026-10-14T11:00:00Z");
    await t.sweepAt("2026-10-15T11:00:00Z");
    expect(await t.dms()).toEqual([{ member: ann, monday: "2026-10-19", state: "scheduled", tries: 0 }]);
    await t.settleUntil("2026-10-19T12:00:00Z");
    expect(postsTo("U_ANN")).toHaveLength(1);
  });

  test("a member off the Monday path, or no longer in the workspace, is booked nothing", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    await t.person("U_ANN", "Europe/Berlin", { xpLevelsOn: false });
    await t.person("U_BEN", "Europe/Berlin", { inTheWorkspace: false });

    await t.sweepAt("2026-10-14T10:00:00Z");
    expect(await t.dms()).toEqual([]);
  });

  test("a member with a hug week this week is booked the hugs recap, though not on the Monday path", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    await t.hugger("U_ANN", "2026-10-12");

    await t.sweepAt("2026-10-14T10:00:00Z");
    await t.settleUntil("2026-10-19T12:00:00Z");
    expect(postsTo("U_ANN")).toEqual([{ at: Date.parse("2026-10-19T07:00:00Z"), channel: "U_ANN", text: expect.stringContaining("You hugged 2 teammates last week.\nKeep them coming."), blocks: undefined }]);
    expect(postsTo("U_ANN")[0]!.text).toContain("change what I send you");
  });

  test("the hug-weeks sweep reads every hug week since last week, page after page, and none before it", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    const huggers: MemberId[] = [];
    for (let index = 0; index < 101; index++) huggers.push(await t.hugger(`U_HUG${String(index).padStart(3, "0")}`, "2026-10-12"));
    const lastWeeks = await t.hugger("U_LAST", "2026-10-05");
    const old = await t.hugger("U_OLD", "2026-09-28");

    await t.sweepAt("2026-10-14T10:00:00Z");
    await t.settleUntil("2026-10-14T10:01:00Z");
    const mondayOf = new Map((await t.dms()).map(({ member, monday }) => [member, monday]));
    expect(mondayOf.has(old)).toBe(false);
    expect(mondayOf.get(lastWeeks)).toBe("2026-10-12");
    expect(huggers.map((member) => mondayOf.get(member))).toEqual(huggers.map(() => "2026-10-19"));
    expect(mondayOf.size).toBe(huggers.length + 1);
  });

  test("a sweep restarted from its start, as the data move's recovery restarts it, books no member a second DM", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    await t.person("U_ANN", "Europe/Berlin");
    for (let index = 0; index < 101; index++) await t.hugger(`U_HUG${String(index).padStart(3, "0")}`, "2026-10-12");
    await t.sweepAt("2026-10-14T10:00:00Z");
    await t.settleUntil("2026-10-14T10:01:00Z");
    const booked = await t.dms();

    await t.sweepAt("2026-10-14T10:02:00Z");
    await t.settleUntil("2026-10-14T10:03:00Z");
    expect(await t.dms()).toEqual(booked);
    expect(await t.bookedTries()).toEqual(booked.map(() => "2026-10-19T07:00:00.000Z"));
  });
});

describe("the Monday DM's try", () => {
  test("with nothing to say on Monday, the DM is skipped and nothing is sent", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    const ann = await t.person("U_ANN", "Europe/Berlin");
    await t.sweepAt("2026-10-14T10:00:00Z");

    personOf(ann).quests = null;
    await t.settleUntil("2026-10-19T12:00:00Z");
    expect(posts).toEqual([]);
    expect(await t.dms()).toEqual([{ member: ann, monday: "2026-10-19", state: "skipped", tries: 0 }]);
  });

  test("a member who left before Monday is skipped", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    const ann = await t.person("U_ANN", "Europe/Berlin");
    await t.sweepAt("2026-10-14T10:00:00Z");

    personOf(ann).inTheWorkspace = false;
    await t.settleUntil("2026-10-19T12:00:00Z");
    expect(posts).toEqual([]);
    expect((await t.dms())[0]).toMatchObject({ state: "skipped" });
  });

  test("Slack's rate limit books the next try when it says, once the DM went out it is sent", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    await t.person("U_ANN", "Europe/Berlin");
    slack.answering("chat.postMessage", rateLimitedFor(30));
    await t.sweepAt("2026-10-14T10:00:00Z");

    await t.settleUntil("2026-10-19T12:00:00Z");
    expect(postsTo("U_ANN").map(({ at }) => iso(at))).toEqual(["2026-10-19T07:00:30.000Z"]);
    expect((await t.dms())[0]).toMatchObject({ state: "sent", tries: 2 });
  });

  test("three rate-limited tries and the DM has failed: no fourth", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    await t.person("U_ANN", "Europe/Berlin");
    // A fourth try would land: Slack answers as usual after three refusals.
    slack.answering("chat.postMessage", rateLimitedFor(30), rateLimitedFor(30), rateLimitedFor(30));
    await t.sweepAt("2026-10-14T10:00:00Z");

    await t.settleUntil("2026-10-20T12:00:00Z");
    expect(posts).toEqual([]);
    expect(slack.messagesIn("U_ANN")).toEqual([]);
    expect(await t.bookedTries()).toEqual([]);
    expect((await t.dms())[0]).toMatchObject({ state: "failed", tries: 3 });
  });

  test("a DM whose answer is lost is not sent again: it may have landed", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    await t.person("U_ANN", "Europe/Berlin");
    slack.answering("chat.postMessage", landsButTimesOut);
    await t.sweepAt("2026-10-14T10:00:00Z");

    await t.settleUntil("2026-10-20T12:00:00Z");
    expect(slack.messagesIn("U_ANN")).toHaveLength(1);
    expect((await t.dms())[0]).toMatchObject({ state: "failed", tries: 1 });
  });

  test("a hugs recap Slack refuses for its pictures goes out as words", async () => {
    const t = await setUp("2026-10-14T10:00:00Z");
    const pictured: HugsSection = { ...hugsRecap, emojiLine: { text: "Your hugs this week", pictures: [{ name: "owl", url: "https://kudos.example/owl.png" }] } };
    const ann = await t.person("U_ANN", "Europe/Berlin", { quests: null, hugs: pictured });
    slack.answering("chat.postMessage", slackError("invalid_blocks"));
    await t.sweepAt("2026-10-14T10:00:00Z");

    await t.settleUntil("2026-10-19T12:00:00Z");
    expect(postsTo("U_ANN")).toEqual([expect.objectContaining({ text: expect.stringContaining("Your hugs this week"), blocks: undefined })]);
    expect(await t.dms()).toEqual([{ member: ann, monday: "2026-10-19", state: "sent", tries: 1 }]);
  });

  test("a DM left scheduled after its try stopped is settled by the next sweep: failed once tried, tried again if never started", async () => {
    const t = await setUp("2026-10-19T12:00:00Z");
    const ann = await t.person("U_ANN", "Europe/Berlin", { xpLevelsOn: false });
    const ben = await t.person("U_BEN", "Europe/Berlin", { xpLevelsOn: false });
    const due = Date.parse("2026-10-19T07:00:00Z");
    await seed.insert("mondayDms", { member: ann, monday: "2026-10-19", state: "scheduled", dueAt: due, tries: 1 });
    await seed.insert("mondayDms", { member: ben, monday: "2026-10-19", state: "scheduled", dueAt: due, tries: 0 });

    await t.sweepAt("2026-10-19T12:00:00Z");
    await t.settleUntil("2026-10-19T12:05:00Z");
    expect((await t.dms()).map(({ member, state }) => ({ member, state }))).toEqual([
      { member: ann, state: "failed" },
      { member: ben, state: "sent" },
    ]);
    expect(posts.map(({ channel }) => channel)).toEqual(["U_BEN"]);
  });
});

describe("the Monday DM's buttons", () => {
  async function sentDm() {
    const t = await setUp("2026-10-14T10:00:00Z");
    const ann = await t.person("U_ANN", "Europe/Berlin", { hugs: hugsRecap });
    await t.sweepAt("2026-10-14T10:00:00Z");
    await t.settleUntil("2026-10-19T12:00:00Z");
    const [message] = slack.messagesIn("U_ANN");
    const [row] = await seed.all("mondayDms");
    return { t, ann, dm: row!._id as Id<"mondayDms">, pressedIn: { channel: message!.channel, ts: message!.ts } };
  }

  test("Stop turns the member's quests off and redraws the DM with the way back; Turn back on redraws the quests", async () => {
    const { t, ann, dm, pressedIn } = await sentDm();

    await t.operations.mutation("commands.stopMondayQuests", (ctx) => stopMondayQuests(ctx, "T1", ann, dm, pressedIn));
    await t.settleUntil("2026-10-19T12:01:00Z");
    expect(personOf(ann).place).toBe("none");
    const [stopped] = slack.messagesShownIn("U_ANN");
    expect(stopped!.text).toContain("Done, no more Monday quests from me.* Your hugs recap still comes on Mondays.");
    expect(JSON.stringify(stopped!.blocks)).toContain("Turn Monday quests back on");

    await t.operations.mutation("commands.resumeMondayQuests", (ctx) => resumeMondayQuests(ctx, "T1", ann, dm, pressedIn));
    await t.settleUntil("2026-10-19T12:02:00Z");
    expect(personOf(ann).place).toBe("dm");
    const [resumed] = slack.messagesShownIn("U_ANN");
    expect(resumed!.text).toContain(questsHeading);
    expect(JSON.stringify(resumed!.blocks)).toContain("Stop Monday quests");
  });

  test("a press on someone else's DM changes nothing", async () => {
    const { t, ann, dm, pressedIn } = await sentDm();
    const ben = await t.person("U_BEN", "Europe/Berlin");
    const shownBefore = slack.messagesShownIn("U_ANN");

    await t.operations.mutation("commands.stopMondayQuests", (ctx) => stopMondayQuests(ctx, "T1", ben, dm, pressedIn));
    await t.settleUntil("2026-10-19T12:01:00Z");
    expect(personOf(ann).place).toBe("dm");
    expect(personOf(ben).place).toBe("dm");
    expect(slack.messagesShownIn("U_ANN")).toEqual(shownBefore);
  });
});
