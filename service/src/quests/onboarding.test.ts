// The onboarding journey over the service's transaction: Give a kudos to someone, Thank someone new and Thank someone on
// two different days, each finished once, at the kudos that reached it. The journey reads awards through S4's engine, the
// teammates through S3's directory and the xp-levels flag and rewards through S6, all still stubs on main: this file
// stands them in over the awards, members and reward rows it seeds, as today's reads answer. The harness ports (mondayPath.test.ts) wait on those stacks.
import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { KudosGivenEvent } from "../bus/events.ts";
import { createClock } from "../clock.ts";
import { toDocument } from "../db/documents.ts";
import { awards, jobs, members, rewardRecords, type Doc } from "../db/schema/index.ts";
import type { AwardId, DatedAward, GivenKudos } from "../engine/awards.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { Log } from "../log.ts";
import { createOperations, type QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { definitionsStored, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { questsFinishedByMessage } from "./finishedBy.ts";
import { hasThankedEveryone, recheckRejoined, recheckSomeoneNewOf } from "./journey.ts";
import { advanceOnboarding, nextOnboardingQuestOf, onboardingFinishedAt, onboardingMovedBy, onboardingQuestsOf, someoneNewWaitsOnTheMondayPath } from "./onboarding.ts";
import { startQuests } from "./start.ts";

async function awardRows(ctx: QueryContext, giver: MemberId): Promise<Array<Doc<"awards">>> {
  const rows = await ctx.tx.select().from(awards).where(eq(awards.giver, giver)).orderBy(asc(awards._creationTime), asc(awards._id));
  return rows.map((row) => toDocument<Doc<"awards">>(awards, row));
}

const dated = (rows: Array<Doc<"awards">>): DatedAward[] => rows.toSorted((one, other) => one.at - other.at).map(({ _id, day, at, _creationTime }) => ({ award: _id, day, at, created: _creationTime, annotations: {} }));

// S4's awards reads, answered from the seeded rows as today's convex/engine/awards.ts answers them.
vi.mock("../engine/awards.ts", async (original) => ({
  ...(await original<object>()),
  givenRecordedAfter: async (ctx: QueryContext, giver: MemberId, after: number): Promise<GivenKudos[]> =>
    (await awardRows(ctx, giver)).filter(({ _creationTime }) => _creationTime > after).map(({ _id, workspace, conversation, message, at }) => ({ award: _id, message: { workspace, conversation, message }, at })),
  earliestAwardFrom: async (ctx: QueryContext, giver: MemberId, recipient: MemberId) => {
    const first = (await awardRows(ctx, giver)).find((row) => row.recipient === recipient);
    return first === undefined ? null : { award: first._id, at: first.at, created: first._creationTime };
  },
  thankedAtOrBefore: async (ctx: QueryContext, giver: MemberId, recipient: MemberId, atOrBefore: number) => (await awardRows(ctx, giver)).some((row) => row.recipient === recipient && row.at <= atOrBefore),
  givenBetween: async (ctx: QueryContext, giver: MemberId, since: number, until: number) => dated((await awardRows(ctx, giver)).filter(({ at }) => at >= since && at <= until)),
  firstDecidedOf: async (ctx: QueryContext, { workspace, conversation, message }: MessageRef) => {
    const rows = await ctx.tx.select().from(awards).where(eq(awards.message, message)).orderBy(asc(awards._creationTime), asc(awards._id));
    return rows.map((row) => toDocument<Doc<"awards">>(awards, row)).find((row) => row.workspace === workspace && row.conversation === conversation)?._creationTime ?? null;
  },
}));
// S3's teammatesOf: the workspace's current members (kind "member") but the member, as convex/workspace/directory.ts reads them.
vi.mock("../workspace/directory.ts", async (original) => ({
  ...(await original<object>()),
  teammatesOf: async (ctx: QueryContext, workspace: string, member: MemberId) =>
    (await ctx.tx.select().from(members).where(eq(members.workspace, workspace)).orderBy(asc(members._creationTime), asc(members._id)))
      .map((row) => toDocument<Doc<"members">>(members, row))
      .filter(({ _id, kind }) => kind === "member" && _id !== member)
      .map(({ _id }) => _id),
}));
vi.mock("../progression/xpLevels.ts", async (original) => ({ ...(await original<object>()), xpLevelsOnFor: async () => true }));
// S6's rewardsCausedBy: the member's reward records whose cause is the message, as convex/progression/rewards.ts reads them.
vi.mock("../progression/rewards.ts", async (original) => ({
  ...(await original<object>()),
  rewardsCausedBy: async (ctx: QueryContext, member: MemberId, { workspace, conversation, message }: MessageRef) =>
    (await ctx.tx.select().from(rewardRecords).where(eq(rewardRecords.member, member)).orderBy(asc(rewardRecords._creationTime), asc(rewardRecords._id)))
      .map((row) => toDocument<Doc<"rewardRecords">>(rewardRecords, row))
      .filter(({ cause }) => cause?.workspace === workspace && cause.conversation === conversation && cause.message === message),
}));

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const tuesday = Date.UTC(2026, 9, 13, 10);
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setUp() {
  let now = tuesday;
  const clock = createClock({ real: () => now });
  const operations = createOperations({ pool: database.pool, clock, log: quiet });
  const seed = seeder(operations);
  const member = (user: string) => seed.insert("members", { workspace: "T1", user, kind: "member" }) as Promise<MemberId>;
  const [bob, alice, carol, dana] = [await member("U_BOB"), await member("U_ALICE"), await member("U_CAROL"), await member("U_DANA")];
  let messages = 0;
  /** The next kudos is recorded at `minutes` after Tuesday 10:00, however long after it was given. */
  const recordAt = (minutes: number) => {
    now = tuesday + minutes * minuteMs;
  };
  const leaves = (who: MemberId) => seed.patch("members", who, { kind: "not-a-member" });

  /** Bob's kudos to the recipients, given `minutes` after Tuesday 10:00 and recorded as its awards, not yet followed. */
  const give = async (minutes: number, ...recipients: MemberId[]) => {
    const at = tuesday + minutes * minuteMs;
    now = Math.max(now, at) + 1;
    messages += 1;
    const message = { workspace: "T1", conversation: "C1", message: `${messages}.000100` };
    const day = new Date(at).toISOString().slice(0, 10);
    const given: KudosGivenEvent["awards"] = [];
    for (const recipient of recipients) {
      const award = await seed.insert("awards", { workspace: "T1", conversation: "C1", message: message.message, giver: bob, recipient, kudos: 1, day, at });
      given.push({ award: award as AwardId, giver: bob, recipient, kudos: 1 });
    }
    return { type: "kudosGiven", workspace: "T1", giver: bob, message, awards: given, day, at } as KudosGivenEvent;
  };
  const follow = async (event: KudosGivenEvent) => (await operations.mutation("test.advanceOnboarding", (ctx) => advanceOnboarding(ctx, event))).map(({ step }) => step);
  /** Bob's kudos, recorded and then followed by onboarding. */
  const thanks = async (minutes: number, ...recipients: MemberId[]) => {
    const event = await give(minutes, ...recipients);
    return { event, finished: await follow(event) };
  };
  const finishes = async () => (await seed.all("questFinishes")).map(({ key, at, cause }) => ({ key, at, cause: cause?.message }));
  const next = () => operations.query("test", (ctx) => nextOnboardingQuestOf(ctx, bob));
  const enqueued = () => operations.query("test", async ({ tx }) => (await tx.select().from(jobs).orderBy(asc(jobs._creationTime))).map((row) => toDocument<{ name: string; args: unknown }>(jobs, row)));
  await operations.mutation("test", (ctx) => startQuests(ctx, bob, tuesday));
  return { operations, seed, bob, alice, carol, dana, recordAt, leaves, give, follow, thanks, finishes, next, enqueued, at: (minutes: number) => tuesday + minutes * minuteMs };
}

describe("the onboarding journey", () => {
  test("a first kudos finishes Give a kudos to someone, the next to someone new Thank someone new, and a kudos on a second day Thank someone on two different days", async () => {
    const { alice, carol, thanks, finishes, next, operations, bob, at } = await setUp();

    expect(await next()).toBe("first-thanks");
    expect((await thanks(1, alice)).finished, "the first kudos").toEqual(["first-thanks"]);
    expect(await next()).toBe("someone-new");
    expect((await thanks(2, alice)).finished, "the same person again").toEqual([]);
    expect((await thanks(3, carol)).finished, "someone new").toEqual(["someone-new"]);
    expect((await thanks(dayMs / minuteMs + 1, alice)).finished, "a kudos the next day").toEqual(["two-days"]);

    expect(await next()).toBeNull();
    expect(await finishes()).toEqual([
      { key: "journey:first-thanks", at: at(1), cause: "1.000100" },
      { key: "journey:someone-new", at: at(3), cause: "3.000100" },
      { key: "journey:two-days", at: at(dayMs / minuteMs + 1), cause: "4.000100" },
    ]);
    expect(await operations.query("test", (ctx) => onboardingFinishedAt(ctx, bob)), "the last step's finish").toBe(at(dayMs / minuteMs + 1));
  });

  test("a kudos given before the member's quests started finishes nothing", async () => {
    const { alice, thanks, finishes } = await setUp();

    expect((await thanks(-5, alice)).finished).toEqual([]);
    expect(await finishes()).toEqual([]);
  });

  test("a first kudos that also thanks someone new finishes only Give a kudos to someone: Thank someone new takes a later message", async () => {
    const { alice, carol, dana, thanks } = await setUp();

    expect((await thanks(1, alice, carol)).finished).toEqual(["first-thanks"]);
    expect((await thanks(2, alice)).finished, "Alice was thanked before").toEqual([]);
    expect((await thanks(3, dana)).finished, "Dana is someone new").toEqual(["someone-new"]);
  });

  test("a member who has thanked every teammate finishes Thank someone new with a kudos to someone they thanked before", async () => {
    const { alice, carol, dana, thanks } = await setUp();
    await thanks(1, alice, carol, dana);

    expect((await thanks(2, alice)).finished).toEqual(["someone-new"]);
  });

  test("Thank someone on two different days counts the days, and its progress moves with the kudos that adds one", async () => {
    const { alice, thanks, operations, bob } = await setUp();
    const twoDays = async (at: number) => (await operations.query("test", (ctx) => onboardingQuestsOf(ctx, bob, at))).find(({ step }) => step === "two-days");

    const { event } = await thanks(1, alice);
    expect((await twoDays(event.at))?.progress, "after the first day").toEqual({ done: 1, of: 2, unit: "days" });
    expect(await operations.query("test", (ctx) => onboardingMovedBy(ctx, event)), "the first day moved it").toEqual([{ goal: "Thank someone on two different days", progress: { done: 1, of: 2, unit: "days" } }]);
    const sameDay = await thanks(2, alice);
    expect(await operations.query("test", (ctx) => onboardingMovedBy(ctx, sameDay.event)), "a second kudos the same day").toEqual([]);
    const nextDay = await thanks(dayMs / minuteMs + 1, alice);
    expect((await twoDays(nextDay.event.at))?.finished, "after the second day").toBe(true);
  });

  test("a later kudos followed first finishes Give a kudos to someone at the earliest kudos still awaiting Quests, and Thank someone new itself", async () => {
    const { alice, carol, give, follow, finishes, at } = await setUp();
    // Two kudos are recorded; the later one is followed first, while the earlier one still awaits Quests.
    const earlier = await give(1, alice);
    const later = await give(5, carol);

    expect(await follow(later), "the later kudos thanks someone new").toEqual(["someone-new"]);
    expect(await finishes(), "Give a kudos to someone names the earlier kudos").toEqual([
      { key: "journey:first-thanks", at: at(1), cause: earlier.message.message },
      { key: "journey:someone-new", at: at(5), cause: later.message.message },
    ]);
    expect(await follow(earlier), "following the earlier kudos reports the step it finished").toEqual(["first-thanks"]);
  });

  test("a kudos recorded long after it was given looks for earlier kudos only from ten minutes before its own recording", async () => {
    const { alice, carol, give, follow, recordAt, finishes, at } = await setUp();
    // Given at minute 1 and recorded at once, never followed; the next kudos is given at minute 5 but recorded at minute 60.
    await give(1, alice);
    recordAt(60);
    const late = await give(5, carol);

    expect(await follow(late)).toEqual(["first-thanks"]);
    expect(await finishes(), "the minute-1 kudos was recorded before the window").toEqual([{ key: "journey:first-thanks", at: at(5), cause: late.message.message }]);
  });

  test("an earlier kudos Quests has already judged is not the one Give a kudos to someone names", async () => {
    const { alice, carol, give, follow, seed, finishes, at } = await setUp();
    const judged = await give(1, alice);
    await seed.insert("questsJudged", { award: judged.awards[0]!.award });
    const later = await give(5, carol);

    expect(await follow(later)).toEqual(["first-thanks"]);
    expect(await finishes()).toEqual([{ key: "journey:first-thanks", at: at(5), cause: later.message.message }]);
  });
});

describe("Thank someone new when teammates leave and come back", () => {
  test("a member is waiting on Thank someone new once their quests start and until they finish it", async () => {
    const { operations, bob, alice, carol, thanks } = await setUp();

    expect(await operations.query("test", (ctx) => someoneNewWaitsOnTheMondayPath(ctx, bob))).toBe(true);
    await thanks(1, alice);
    await thanks(2, carol);
    expect(await operations.query("test", (ctx) => someoneNewWaitsOnTheMondayPath(ctx, bob))).toBe(false);
  });

  test("a teammate rejoining schedules the recheck for a member still on Thank someone new", async () => {
    const { operations, bob, enqueued } = await setUp();

    await operations.mutation("test", (ctx) => recheckRejoined(ctx, { event: { type: "memberRejoined", workspace: "T1", member: bob, at: tuesday } }));

    expect((await enqueued()).map(({ name, args }) => ({ name, args }))).toEqual([{ name: "quests.journey.recheckSomeoneNewOf", args: { workspace: "T1", member: bob, at: tuesday } }]);
  });

  test("the recheck finishes Thank someone new once the member has thanked everyone left, after their first kudos", async () => {
    vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
    postHogDeciding("sandbox");
    const { operations, bob, alice, carol, dana, leaves, thanks, finishes, at } = await setUp();
    await definitionsStored(operations, onForEveryone("monday-quest"));
    await thanks(1, alice);
    await thanks(2, alice);
    const recheck = () => operations.mutation("test", (ctx) => recheckSomeoneNewOf(ctx, { workspace: "T1", member: bob, at: at(3) }));

    expect(await operations.query("test", (ctx) => hasThankedEveryone(ctx, "T1", bob, at(3)))).toBe(false);
    await leaves(carol);
    await recheck();
    expect((await finishes()).map(({ key }) => key), "Dana is still a teammate").toEqual(["journey:first-thanks"]);

    // Dana left as well: Bob has now thanked everyone who's left.
    await leaves(dana);
    await recheck();
    expect(await finishes()).toEqual([
      { key: "journey:first-thanks", at: at(1), cause: "1.000100" },
      { key: "journey:someone-new", at: at(3), cause: undefined },
    ]);
  });

  test("the recheck finishes nothing while the monday-quest flag is off", async () => {
    const { operations, bob, alice, carol, dana, leaves, thanks, finishes, at } = await setUp();
    await thanks(1, alice);
    await leaves(carol);
    await leaves(dana);

    await operations.mutation("test", (ctx) => recheckSomeoneNewOf(ctx, { workspace: "T1", member: bob, at: at(3) }));

    expect((await finishes()).map(({ key }) => key)).toEqual(["journey:first-thanks"]);
  });
});

describe("the quests a kudos message finished", () => {
  test("names each journey step the message paid the member on the Monday path, and nothing paid before it or for another member or message", async () => {
    const { operations, seed, bob, alice } = await setUp();
    const message = { workspace: "T1", conversation: "C1", message: "1.000100" };
    const reward = (member: MemberId, key: string, xp: number, catalogueVersion: string, cause: MessageRef) =>
      seed.insert("rewardRecords", { member, key, xp, coins: 0, item: null, catalogueVersion, at: tuesday, cause });
    await reward(bob, "journey:first-thanks", 50, "monday-1", message);
    await reward(bob, "journey:hugs-3", 20, "monday-1", message);
    await reward(bob, "journey:someone-new", 30, "1", message);
    await reward(alice, "journey:two-days", 40, "monday-1", message);
    await reward(bob, "journey:two-days", 40, "monday-1", { ...message, workspace: "T2" });
    await reward(bob, "journey:two-days", 40, "monday-1", { ...message, conversation: "C2" });
    await reward(bob, "journey:two-days", 40, "monday-1", { ...message, message: "2.000100" });
    const finishedBy = (member: MemberId, ref: MessageRef) => operations.query("test", (ctx) => questsFinishedByMessage(ctx, member, ref));

    expect(await finishedBy(bob, message)).toEqual([
      { kind: "journey", goal: "Give a kudos to someone", xp: 50, hoggie: true },
      { kind: "journey", goal: "Give 3 hugs", xp: 20, hoggie: true },
    ]);
    expect(await finishedBy(alice, message), "another member's rewards").toEqual([{ kind: "journey", goal: "Thank someone on two different days", xp: 40, hoggie: true }]);
    expect(await finishedBy(bob, { ...message, message: "3.000100" }), "a message that paid nothing").toEqual([]);
  });
});
