// The week turn over the service's operations: the hourly sweep (quests.newWeek.sweep) pages every member and draws each
// one's week of quests once their week turns where they live; a kudos then moves the week's quests and finishes a slot
// once; under two-quests each side gets a quest of its own; a teammate leaving rechecks Thank someone new for every
// member still on it. The worker runs the quests registration's jobs as the service does, beside two recording
// subscribers for questsDrawn and questFinished, over S4's awards reads and S13's hugs as main has them. The draws read
// bodies still stubbed on main (welcome's isWelcomed, S6's xp-levels decision, S5's republish): this file stands the
// first two in over the rows it seeds, as today's code reads them; republish does nothing here, and
// weekTurnHome.test.ts proves the home refresh.
import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { memberDecision } from "../analytics/flags.ts";
import type { KudosGivenEvent, MemberLeftEvent } from "../bus/events.ts";
import { createClock } from "../clock.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { jobs, members, questFinishes, questStarts, welcomes } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { AwardId } from "../engine/awards.ts";
import { mutationJob } from "../jobs/define.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations, type QueryContext } from "../operations.ts";
import { xpLevels } from "../progression/xpLevels.ts";
import { createRegistry } from "../registration.ts";
import type { MemberId } from "../workspace/directory.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { definitionsStored, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { rewardKeyOf } from "./crates.ts";
import { onboardingSteps } from "./onboarding.ts";
import { factOfHugGiven, factOfKudosGiven, recognize, type RecognitionFact } from "./recognitions.ts";
import { registration } from "./registration.ts";
import { advanceSide, awaitsASideDraw, kudosQuestFinishedBy, sideGoalOf, sideQuestOfTheWeek } from "./sides.ts";
import { advanceWeeklyQuests, drawNewWeek, drawNewWeekJob, mondayQuestsMovedSince, weeklyGoalOf, weeklyQuestsOf } from "./weekly.ts";

// Welcome's isWelcomed: whether the member has a welcome (by_member, unique).
vi.mock("../welcome/welcome.ts", async (original) => ({
  ...(await original<object>()),
  isWelcomed: async (ctx: QueryContext, member: MemberId): Promise<boolean> =>
    unique("welcomes", await ctx.tx.select({ _id: welcomes._id }).from(welcomes).where(eq(welcomes.member, member)).orderBy(...indexOrder(welcomes, ["member"]).orderBy()).limit(2)) !== null,
}));
// S6's xpLevelsOnFor: the member's xp-levels decision, as convex/progression/xpLevels.ts decides it.
vi.mock("../progression/xpLevels.ts", async (original) => ({ ...(await original<object>()), xpLevelsOnFor: (ctx: QueryContext, member: MemberId) => memberDecision(ctx, xpLevels, member) }));
// S5's republish: still a stub on main, so it does nothing here; weekTurnHome.test.ts proves the home it refreshes.
vi.mock("../feedback/homes.ts", async (original) => ({ ...(await original<object>()), republish: async () => {} }));

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const budgetMs = 60_000;
/** Tuesday 13 October 2026, 10:00 UTC: in the week of Monday 12 October, wherever the tests' members live. */
const tuesday = Date.UTC(2026, 9, 13, 10);
const thisWeek = "2026-10-12";
const nextWeek = "2026-10-19";
/** Monday 19 October, 00:00 UTC; in Auckland (UTC+13) the week turned eleven hours earlier. */
const mondayInUtc = Date.UTC(2026, 9, 19);
const mondayInAuckland = Date.UTC(2026, 9, 18, 11);

/** A teammate of T1 leaving, an hour after Tuesday 10:00. */
const memberLeft = (member: MemberId): MemberLeftEvent => ({ type: "memberLeft", workspace: "T1", member, at: tuesday + hourMs });

const recorder = (type: string) => mutationJob(`test.recorded.${type}`, z.object({ event: z.object({ type: z.string() }).passthrough() }), async () => {});
const recorders = { questsDrawn: recorder("questsDrawn"), questFinished: recorder("questFinished") };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setUp({ flags = ["monday-quest", "xp-levels"], off = ["two-quests"] }: { flags?: string[]; off?: string[] } = {}) {
  postHogDeciding("sandbox");
  let now = tuesday;
  const clock = createClock({ real: () => now });
  const registry = createRegistry({
    quests: registration,
    recorder: { subscribers: [{ event: "questsDrawn", job: recorders.questsDrawn }, { event: "questFinished", job: recorders.questFinished }] },
  });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1, subscribers: registry.subscribers });
  const worker = createWorker({ operations, log: quiet, registry: registry.jobs, pollMs: hourMs, concurrency: 1 });
  const seed = seeder(operations);
  await definitionsStored(operations, ...flags.map(onForEveryone), ...off.map(offForEveryone));

  const member = (id: string, fields: { workspace?: string; timeZone?: string; kind?: "member" | "bot" | "not-a-member" } = {}) =>
    seed.insert("members", { _id: id, workspace: fields.workspace ?? "T1", user: `U_${id}`, kind: fields.kind ?? "member", ...(fields.timeZone && { timeZone: fields.timeZone }) }) as Promise<MemberId>;
  /** The member's quests start at `at` and each onboarding step listed finishes then. */
  const onboarded = async (who: MemberId, at = tuesday, steps: readonly string[] = onboardingSteps) => {
    await seed.insert("questStarts", { member: who, at });
    for (const step of steps) await seed.insert("questFinishes", { member: who, key: `journey:${step}`, xp: 50, catalogueVersion: "monday-1", at });
  };
  const finishedTheHugLadder = (who: MemberId, at: number) => seed.insert("questFinishes", { member: who, key: rewardKeyOf({ kind: "journey", step: "hugs-10" }), xp: 20, catalogueVersion: "monday-1", at });
  let messages = 0;
  /** A kudos from the giver to the recipients at `at`, recorded as its awards; the event Quests follows. */
  const give = async (giver: MemberId, at: number, ...recipients: MemberId[]): Promise<KudosGivenEvent> => {
    messages += 1;
    const message = { workspace: "T1", conversation: "C1", message: `${messages}.000100` };
    const day = new Date(at).toISOString().slice(0, 10);
    const given: KudosGivenEvent["awards"] = [];
    for (const recipient of recipients) {
      const award = await seed.insert("awards", { workspace: "T1", conversation: "C1", message: message.message, giver, recipient, kudos: 1, day, at });
      given.push({ award: award as AwardId, giver, recipient, kudos: 1 });
    }
    return { type: "kudosGiven", workspace: "T1", giver, message, awards: given, annotations: {}, day, at } as unknown as KudosGivenEvent;
  };
  const sweep = async (at: number) => {
    now = at;
    expect(await worker.runCron("quests.newWeek.sweep", budgetMs), "the sweep and the jobs it scheduled ran").toMatchObject({ done: true });
  };
  const ranJobs = async (name: string) =>
    operations.query("test", async ({ tx }) =>
      (await tx.select().from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id))).map((row) => toDocument<{ args: Record<string, unknown>; state: string }>(jobs, row)),
    );
  const published = async (type: keyof typeof recorders) => (await ranJobs(recorders[type].name)).map(({ args }) => {
    const { fact, ...event } = args.event as Record<string, unknown>;
    return event;
  });
  const draws = async () => (await seed.all("questDraws")).map(({ member, week, drawnAt, slots }) => ({ member, week, drawnAt, slots }));
  const sideDraws = async () => (await seed.all("questSideDraws")).map(({ member, week, side, quest, drawnAt, feasibleBecause }) => ({ member, week, side, quest, drawnAt, feasibleBecause }));
  const finishes = async () => (await seed.all("questFinishes")).filter(({ key }) => key.startsWith("weekly:")).map(({ key, at, cause, xp }) => ({ key, at, cause: cause?.message, xp }));
  const mutate = <T>(handler: Parameters<typeof operations.mutation<T>>[1]) => operations.mutation("test", handler);
  const read = <T>(handler: Parameters<typeof operations.query<T>>[1]) => operations.query("test", handler);
  return {
    operations, worker, seed, member, onboarded, finishedTheHugLadder, give, sweep, ranJobs, published, draws, sideDraws, finishes, mutate, read,
    setNow: (at: number) => {
      now = at;
    },
  };
}

const slotsOf = (quests: string[]) => quests.map((quest, slot) => ({ slot, quest, reward: { xp: 20, coins: 0, item: null }, catalogueVersion: "monday-1" }));

describe("the hourly sweep draws each member's week of quests at the turn of their own week", () => {
  test("a member is drawn three quests once their onboarding is finished, then each new week once it turns where they live, each with its questsDrawn", { timeout: budgetMs * 2 }, async () => {
    const t = await setUp();
    const bob = await t.member("m-bob", { timeZone: "Pacific/Auckland" });
    const alice = await t.member("m-alice");
    const dana = await t.member("m-dana", { kind: "bot" });
    for (const who of [bob, alice, dana]) await t.onboarded(who);

    await t.sweep(tuesday + hourMs);
    await t.sweep(mondayInAuckland - 30 * minuteMs);
    expect((await t.draws()).map(({ member, week }) => ({ member, week })), "this week, and next week nowhere yet").toEqual([
      { member: bob, week: thisWeek },
      { member: alice, week: thisWeek },
    ]);
    await t.sweep(mondayInAuckland + 30 * minuteMs);
    await t.sweep(mondayInAuckland + 2 * hourMs);
    await t.sweep(mondayInUtc + 30 * minuteMs);

    const drawn = await t.draws();
    expect(drawn.map(({ member, week, drawnAt }) => ({ member, week, drawnAt })), "next week drawn at its start in Auckland, then in UTC").toEqual([
      { member: bob, week: thisWeek, drawnAt: tuesday + hourMs },
      { member: alice, week: thisWeek, drawnAt: tuesday + hourMs },
      { member: bob, week: nextWeek, drawnAt: mondayInAuckland },
      { member: alice, week: nextWeek, drawnAt: mondayInUtc },
    ]);
    for (const { slots } of drawn) {
      expect(slots.map(({ slot, catalogueVersion }) => ({ slot, catalogueVersion })), "three slots of the Monday catalogue").toEqual([0, 1, 2].map((slot) => ({ slot, catalogueVersion: "monday-1" })));
      expect(new Set(slots.map(({ quest }) => quest)).size, "three different quests").toBe(3);
    }
    expect(await t.published("questsDrawn"), "one questsDrawn per draw, naming its quests").toEqual(
      drawn.map(({ member, week, drawnAt, slots }) => ({ type: "questsDrawn", workspace: "T1", member, week, quests: slots.map(({ quest }) => quest), at: drawnAt })),
    );
  });

  test("a member whose onboarding isn't finished is drawn nothing", async () => {
    const t = await setUp();
    const carol = await t.member("m-carol");
    await t.member("m-alice");
    await t.onboarded(carol, tuesday, ["first-thanks", "someone-new"]);

    await t.sweep(tuesday + hourMs);

    expect(await t.draws(), "two of three onboarding steps").toEqual([]);
    expect(await t.ranJobs("quests.weekly.drawNewWeek"), "no draw scheduled").toEqual([]);
  });

  test("while monday-quest is off, an onboarded member is drawn nothing by the sweep or by a draw of their own", async () => {
    const t = await setUp({ flags: ["xp-levels"], off: ["monday-quest", "two-quests"] });
    const bob = await t.member("m-bob");
    await t.member("m-alice");
    await t.onboarded(bob);

    await t.sweep(tuesday + hourMs);
    await t.mutate((ctx) => drawNewWeek(ctx, { member: bob }));

    expect(await t.draws()).toEqual([]);
    expect(await t.ranJobs("quests.weekly.drawNewWeek")).toEqual([]);
  });

  test("a week drawn twice, as two draws scheduled before either ran, is drawn and announced once", async () => {
    const t = await setUp();
    const bob = await t.member("m-bob");
    await t.member("m-alice");
    await t.onboarded(bob);
    t.setNow(tuesday + hourMs);

    await t.mutate(async (ctx) => {
      await ctx.jobs.enqueue(drawNewWeekJob, { member: bob });
      await ctx.jobs.enqueue(drawNewWeekJob, { member: bob });
    });
    await t.worker.settle(budgetMs);

    expect((await t.ranJobs("quests.weekly.drawNewWeek")).map(({ state }) => state), "both draws ran").toEqual(["success", "success"]);
    expect((await t.draws()).map(({ member, week }) => ({ member, week }))).toEqual([{ member: bob, week: thisWeek }]);
    expect(await t.published("questsDrawn")).toHaveLength(1);
  });

  test("the sweep starts the quests of a welcomed member on the Monday path who has none, and no one else's", async () => {
    const t = await setUp();
    const eve = await t.member("m-eve");
    await t.member("m-frank");
    await t.seed.insert("welcomes", { member: eve });

    await t.sweep(tuesday + hourMs);

    expect((await t.seed.all("questStarts")).map(({ member, at }) => ({ member, at }))).toEqual([{ member: eve, at: tuesday + hourMs }]);
  });

  test("the sweep pages the members a hundred at a time, scheduling itself again with the cursor, draws each onboarded member once, and a second sweep draws nothing", { timeout: budgetMs * 3 }, async () => {
    const t = await setUp();
    const everyone = await t.mutate(async (ctx) => {
      const ids: MemberId[] = [];
      for (let index = 0; index < 110; index += 1) {
        const id = `m-${String(index).padStart(3, "0")}` as MemberId;
        // Users sort in another order than the members were created in, so creation order and by_user order differ.
        await ctx.tx.insert(members).values({ ...ctx.newRow(), _id: id, workspace: "T1", user: `U_${String((index * 37) % 110).padStart(3, "0")}`, kind: "member" });
        ids.push(id);
      }
      return ids;
    });
    const onboardedMembers = everyone.slice(0, 105);
    await t.mutate(async (ctx) => {
      for (const who of onboardedMembers) {
        await ctx.tx.insert(questStarts).values({ ...ctx.newRow(), member: who, at: tuesday });
        for (const step of onboardingSteps) await ctx.tx.insert(questFinishes).values({ ...ctx.newRow(), member: who, key: `journey:${step}`, xp: 50, catalogueVersion: "monday-1", at: tuesday });
      }
    });

    await t.sweep(tuesday + hourMs);

    const sweeps = await t.ranJobs("quests.newWeek.sweep");
    expect(sweeps.map(({ state }) => state), "the cron's sweep and the one it scheduled for the second page").toEqual(["success", "success"]);
    expect(sweeps[0]!.args, "the cron starts at the beginning").toEqual({});
    expect(sweeps[1]!.args.cursor, "the second page starts at the first's cursor").toEqual(expect.any(String));
    const drawsScheduled = (await t.ranJobs("quests.weekly.drawNewWeek")).map(({ args }) => args.member);
    expect(drawsScheduled, "a draw for each onboarded member in creation order, the first hundred from the first page").toEqual(onboardedMembers);
    expect(new Set((await t.draws()).map(({ member }) => member))).toEqual(new Set(onboardedMembers));
    expect(await t.published("questsDrawn")).toHaveLength(105);

    await t.sweep(tuesday + 2 * hourMs);

    expect(await t.ranJobs("quests.newWeek.sweep"), "the second sweep paged twice as well").toHaveLength(4);
    expect(await t.ranJobs("quests.weekly.drawNewWeek"), "and scheduled no draw").toHaveLength(105);
    expect(await t.draws()).toHaveLength(105);
  });
});

describe("a kudos moves the week's three quests", () => {
  test("it advances every quest it counts toward and finishes a quest once, at that kudos, announcing it once; a kudos followed twice moves nothing twice", async () => {
    const t = await setUp();
    const bob = await t.member("m-bob");
    const [alice, carol, dana] = [await t.member("m-alice"), await t.member("m-carol"), await t.member("m-dana")];
    await t.onboarded(bob);
    // Bob thanked everyone on Tuesday: next week, no one is new or unthanked for 30 days, so only the three participation quests can be drawn.
    await t.give(bob, tuesday + minuteMs, alice, carol, dana);
    t.setNow(mondayInUtc + 9 * hourMs);
    await t.mutate((ctx) => drawNewWeek(ctx, { member: bob }));
    expect(await t.draws(), "drawn at the week's start, in bob's rank order").toEqual([
      { member: bob, week: nextWeek, drawnAt: mondayInUtc, slots: slotsOf(["kudos-two-days", "kudos-once", "three-in-a-day"]).map((slot) => ({ ...slot, feasibleBecause: expect.any(Object) })) },
    ]);

    const first = await t.give(bob, mondayInUtc + 10 * hourMs, alice);
    t.setNow(first.at + 1);
    expect(await t.mutate((ctx) => advanceWeeklyQuests(ctx, first)), "the first kudos").toEqual({
      finished: [{ crate: { kind: "weekly", week: nextWeek, slot: 1 }, goal: "Give a kudos to someone.", reward: { xp: 20, coins: 0, item: null } }],
      moved: [
        { goal: "Thank someone on two different days", progress: { done: 1, of: 2, unit: "days" } },
        { goal: "Thank 3 people in one day", progress: { done: 1, of: 3, unit: "people" } },
      ],
    });
    expect(await t.mutate((ctx) => advanceWeeklyQuests(ctx, first)), "the same kudos followed again").toEqual({ finished: [], moved: [] });
    expect((await t.seed.all("questProgress")).map(({ slot, award }) => ({ slot, award })), "its award counted once in each slot").toEqual([0, 1, 2].map((slot) => ({ slot, award: first.awards[0]!.award })));

    const second = await t.give(bob, mondayInUtc + 11 * hourMs, carol, dana);
    t.setNow(second.at + 1);
    expect((await t.mutate((ctx) => advanceWeeklyQuests(ctx, second))).finished.map(({ goal }) => goal), "two more people the same day").toEqual(["Thank 3 people in one day."]);

    expect(await t.finishes(), "each finish once, at its kudos, caused by it").toEqual([
      { key: `weekly:${nextWeek}:1`, at: first.at, cause: first.message.message, xp: 20 },
      { key: `weekly:${nextWeek}:2`, at: second.at, cause: second.message.message, xp: 20 },
    ]);
    expect(await t.published("questFinished")).toEqual([
      { type: "questFinished", workspace: "T1", member: bob, quest: { kind: "weekly", week: nextWeek, slot: 1 }, poolQuest: "kudos-once", rewardKey: `weekly:${nextWeek}:1`, reward: { xp: 20, coins: 0 }, catalogueVersion: "monday-1", at: first.at, cause: first.message },
      { type: "questFinished", workspace: "T1", member: bob, quest: { kind: "weekly", week: nextWeek, slot: 2 }, poolQuest: "three-in-a-day", rewardKey: `weekly:${nextWeek}:2`, reward: { xp: 20, coins: 0 }, catalogueVersion: "monday-1", at: second.at, cause: second.message },
    ]);
    const week = await t.read((ctx) => weeklyQuestsOf(ctx, bob, ctx.now));
    expect(week?.slots.map(({ quest, progress, target, finishedAt }) => ({ quest, progress, target, finishedAt }))).toEqual([
      { quest: "kudos-two-days", progress: 1, target: 2, finishedAt: null },
      { quest: "kudos-once", progress: 1, target: 1, finishedAt: first.at },
      { quest: "three-in-a-day", progress: 3, target: 3, finishedAt: second.at },
    ]);
    expect(await t.read((ctx) => weeklyGoalOf(ctx, bob, { kind: "weekly", week: nextWeek, slot: 2 }))).toBe("Thank 3 people in one day.");
    const firstDecided = (await t.seed.all("awards")).find(({ message }) => message === first.message.message)!._creationTime;
    expect(await t.read((ctx) => mondayQuestsMovedSince(ctx, bob, { since: firstDecided - 1, until: ctx.now, mostAwards: 10 })), "moved since just before the first kudos, short of its target").toEqual([
      { name: "Thank someone on two different days", from: 0, to: 1, of: 2 },
    ]);
    expect(await t.read((ctx) => mondayQuestsMovedSince(ctx, bob, { since: firstDecided, until: ctx.now, mostAwards: 10 })), "nothing moved since its kudos was decided, though it was counted later").toEqual([]);
  });
});

describe("under two-quests each side draws a quest of its own pool once its onboarding is finished", () => {
  async function onBothSides() {
    const t = await setUp({ flags: ["monday-quest", "xp-levels", "two-quests"], off: [] });
    const bob = await t.member("m-bob");
    const [alice, carol, dana] = [await t.member("m-alice"), await t.member("m-carol"), await t.member("m-dana")];
    await t.onboarded(bob);
    await t.finishedTheHugLadder(bob, tuesday + minuteMs);
    await t.seed.insert("hugs", { workspace: "T1", conversation: "C1", message: "0.000100", giver: bob, onKudos: false, author: alice, emoji: "hugging_face", at: tuesday, day: "2026-10-13" });
    t.setNow(tuesday + 10 * minuteMs);
    return { t, bob, alice, carol, dana };
  }

  test("the hug side and the kudos side are each drawn once, with a questsDrawn each and no three-quest week", async () => {
    const { t, bob } = await onBothSides();

    expect(await t.mutate((ctx) => awaitsASideDraw(ctx, bob, ctx.now)), "before the draw").toBe(true);
    await t.mutate((ctx) => drawNewWeek(ctx, { member: bob }));
    await t.mutate((ctx) => drawNewWeek(ctx, { member: bob }));

    const at = tuesday + 10 * minuteMs;
    expect(await t.sideDraws()).toEqual([
      { member: bob, week: thisWeek, side: "hug", quest: "hug-two-days", drawnAt: at, feasibleBecause: { hugsLeft: 9 + 10 * 5, daysLeft: 6 } },
      { member: bob, week: thisWeek, side: "kudos", quest: "three-in-a-day", drawnAt: at, feasibleBecause: { peopleLeft: 3, recognitionsLeft: 3 + 3 * 5 } },
    ]);
    expect(await t.draws(), "no three-quest week under two-quests").toEqual([]);
    expect(await t.published("questsDrawn")).toEqual([
      { type: "questsDrawn", workspace: "T1", member: bob, week: thisWeek, quests: ["hug-two-days"], at },
      { type: "questsDrawn", workspace: "T1", member: bob, week: thisWeek, quests: ["three-in-a-day"], at },
    ]);
    expect(await t.mutate((ctx) => awaitsASideDraw(ctx, bob, ctx.now)), "after it").toBe(false);
  });

  test("a side whose own onboarding isn't finished draws nothing: no hug quest before the hug ladder's last step", async () => {
    const t = await setUp({ flags: ["monday-quest", "xp-levels", "two-quests"], off: [] });
    const bob = await t.member("m-bob");
    await t.member("m-alice");
    await t.onboarded(bob);
    t.setNow(tuesday + 10 * minuteMs);

    await t.mutate((ctx) => drawNewWeek(ctx, { member: bob }));

    expect((await t.sideDraws()).map(({ side }) => side)).toEqual(["kudos"]);
    expect(await t.mutate((ctx) => awaitsASideDraw(ctx, bob, ctx.now)), "the hug side isn't open").toBe(false);
  });

  test("the kudos quest counts the kudos since its draw and finishes once, at the kudos that reached it, which names it", async () => {
    const { t, bob, alice, carol, dana } = await onBothSides();
    await t.mutate((ctx) => drawNewWeek(ctx, { member: bob }));
    const follow = (event: KudosGivenEvent) =>
      t.mutate(async (ctx) => {
        if (await recognize(ctx, factOfKudosGiven(event))) await advanceSide(ctx, factOfKudosGiven(event));
      });
    const replay = (fact: RecognitionFact) => t.mutate((ctx) => advanceSide(ctx, fact));

    const first = await t.give(bob, tuesday + 20 * minuteMs, alice);
    await follow(first);
    expect(await t.read((ctx) => sideQuestOfTheWeek(ctx, bob, "kudos", ctx.now)), "one person of three").toMatchObject({ quest: { kind: "weekly", week: thisWeek, slot: 4 }, xp: 20, done: 1, finished: false });
    const second = await t.give(bob, tuesday + 30 * minuteMs, carol, dana);
    await follow(second);
    await replay(factOfKudosGiven(second));

    expect(await t.finishes()).toEqual([{ key: `weekly:${thisWeek}:4`, at: second.at, cause: second.message.message, xp: 20 }]);
    expect((await t.published("questFinished")).map(({ quest, poolQuest, at }) => ({ quest, poolQuest, at }))).toEqual([{ quest: { kind: "weekly", week: thisWeek, slot: 4 }, poolQuest: "three-in-a-day", at: second.at }]);
    expect(await t.read((ctx) => sideQuestOfTheWeek(ctx, bob, "kudos", ctx.now)), "finished").toMatchObject({ done: 3, finished: true });
    expect(await t.read((ctx) => kudosQuestFinishedBy(ctx, bob, second.day, second.message))).toEqual([{ goal: "Thank 3 people in one day.", xp: 20 }]);
    expect(await t.read((ctx) => kudosQuestFinishedBy(ctx, bob, first.day, first.message)), "the kudos before it").toEqual([]);
    expect(await t.read((ctx) => sideGoalOf(ctx, bob, { kind: "weekly", week: thisWeek, slot: 4 }))).toBe("Thank 3 people in one day.");
    expect(await t.read((ctx) => weeklyGoalOf(ctx, bob, { kind: "weekly", week: thisWeek, slot: 4 })), "a side's slot names its goal").toBe("Thank 3 people in one day.");
    expect(await t.read((ctx) => sideGoalOf(ctx, bob, { kind: "weekly", week: thisWeek, slot: 1 })), "not a side's slot").toBeNull();
  });

  test("the hug quest counts the days with a hug and finishes once, with no cause", async () => {
    const { t, bob, alice } = await onBothSides();
    await t.mutate((ctx) => drawNewWeek(ctx, { member: bob }));
    let hugsGiven = 0;
    const hug = async (at: number) => {
      hugsGiven += 1;
      const day = new Date(at).toISOString().slice(0, 10);
      const fact = factOfHugGiven({ type: "hugGiven", workspace: "T1", giver: bob, author: alice, message: { workspace: "T1", conversation: "C1", message: `h${hugsGiven}.000100` }, onKudos: false, day, at });
      await t.mutate(async (ctx) => {
        if (await recognize(ctx, fact)) await advanceSide(ctx, fact);
      });
      return fact;
    };

    await hug(tuesday + 20 * minuteMs);
    expect(await t.read((ctx) => sideQuestOfTheWeek(ctx, bob, "hug", ctx.now)), "one day of two").toMatchObject({ quest: { kind: "weekly", week: thisWeek, slot: 3 }, done: 1, finished: false });
    const wednesday = await hug(tuesday + dayMs);
    await t.mutate((ctx) => advanceSide(ctx, wednesday));

    expect(await t.finishes()).toEqual([{ key: `weekly:${thisWeek}:3`, at: wednesday.at, cause: undefined, xp: 20 }]);
    expect(await t.published("questFinished")).toHaveLength(1);
  });

  test("at the next week's turn the sweep draws each side again, at the week's start", async () => {
    const { t, bob } = await onBothSides();
    await t.mutate((ctx) => drawNewWeek(ctx, { member: bob }));

    await t.sweep(mondayInUtc + hourMs);

    expect((await t.sideDraws()).filter(({ week }) => week === nextWeek).map(({ side, quest, drawnAt }) => ({ side, quest, drawnAt }))).toEqual([
      { side: "hug", quest: "hug-two-days", drawnAt: mondayInUtc },
      { side: "kudos", quest: "kudos-two-days", drawnAt: mondayInUtc },
    ]);
  });
});

describe("a teammate leaving rechecks Thank someone new", () => {
  test("for every member of the workspace still on it, paging the workspace a hundred members at a time", { timeout: budgetMs * 2 }, async () => {
    const t = await setUp({ flags: [], off: [] });
    const waiting = await t.mutate(async (ctx) => {
      const insert = async (id: string, workspace: string, kind: "member" | "bot", someoneNewFinished = false, user = `U_${id}`) => {
        await ctx.tx.insert(members).values({ ...ctx.newRow(), _id: id, workspace, user, kind });
        await ctx.tx.insert(questStarts).values({ ...ctx.newRow(), member: id, at: tuesday });
        if (someoneNewFinished) await ctx.tx.insert(questFinishes).values({ ...ctx.newRow(), member: id, key: "journey:someone-new", xp: 50, catalogueVersion: "monday-1", at: tuesday });
        return id as MemberId;
      };
      const ids: MemberId[] = [];
      // Users sort in another order than the members were created in: the recheck pages by_user, not creation order.
      for (let index = 0; index < 105; index += 1) ids.push(await insert(`w-${String(index).padStart(3, "0")}`, "T1", "member", false, `U_${String((index * 37) % 105).padStart(3, "0")}`));
      await insert("w-bot", "T1", "bot");
      await insert("w-done", "T1", "member", true);
      await insert("w-elsewhere", "T2", "member");
      return ids;
    });

    await t.mutate((ctx) => ctx.publish(memberLeft(waiting[0]!)));
    await t.worker.settle(budgetMs);

    const rechecks = await t.ranJobs("quests.journey.recheckSomeoneNew");
    expect(rechecks.map(({ state }) => state), "the subscriber and the page it scheduled").toEqual(["success", "success"]);
    expect(rechecks[1]!.args, "the second page carries the event and the first's cursor").toEqual({ event: rechecks[0]!.args.event, cursor: expect.any(String) });
    const each = await t.ranJobs("quests.journey.recheckSomeoneNewOf");
    const byUser = await t.mutate(async (ctx) => (await ctx.tx.select({ _id: members._id, user: members.user }).from(members)).filter(({ _id }) => waiting.includes(_id as MemberId)).toSorted((one, other) => (one.user < other.user ? -1 : 1)).map(({ _id }) => _id));
    expect(byUser, "the fixture's user order differs from its creation order").not.toEqual(waiting);
    expect(each.map(({ args }) => args.member), "each member still on it, in the workspace's by_user order").toEqual(byUser);
    expect(each[0]!.args).toEqual({ workspace: "T1", member: byUser[0], at: tuesday + hourMs });
  });

  test("and finishes it for a member who has now thanked everyone left", async () => {
    const t = await setUp();
    const bob = await t.member("m-bob");
    const [alice, carol] = [await t.member("m-alice"), await t.member("m-carol")];
    await t.onboarded(bob, tuesday, ["first-thanks"]);
    await t.give(bob, tuesday + minuteMs, alice);
    await t.seed.patch("members", carol, { kind: "not-a-member" });

    await t.mutate((ctx) => ctx.publish(memberLeft(carol)));
    await t.worker.settle(budgetMs);

    expect((await t.seed.all("questFinishes")).map(({ key, at, cause }) => ({ key, at, cause }))).toEqual([
      { key: "journey:first-thanks", at: tuesday, cause: undefined },
      { key: "journey:someone-new", at: tuesday + hourMs, cause: undefined },
    ]);
  });
});
