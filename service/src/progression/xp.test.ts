// XP and levels on the service's transaction: the bodies of progression, effects, rewards and receiving that reach no
// other stack. Tests that reach another stack's body are in the ported files beside this one.
import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { subscribersOf, type Subscription } from "../bus/publish.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/index.ts";
import { mutationJob } from "../jobs/define.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext, type QueryContext } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import type { MemberId } from "../workspace/directory.ts";
import { bonusRecordedWith, gateRecordedWith, insertEffects, isRecorded, xpRecordedFor } from "./effects.ts";
import { xpToReach } from "./levels.ts";
import { progressionHomeOf, recordReward, spendSkillPoints, standingOf, unrecordedAwardsOf } from "./progression.ts";
import type { EffectsRecord } from "./progress.ts";
import { receivingWeekOf, recordReceiving } from "./receiving.ts";
import { rewardOf, rewardsCausedBy, rewardsKeyedFrom, rewardsPage, type RewardRecord } from "./rewards.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const at = new Date("2026-10-13T10:00:00Z").getTime();

// The one setup of this file: the operation runner on the test database, the seeder, and the events the code under test
// published, read back from the jobs a recording subscriber got. S4's in-process backend replaces it.
const recorder = mutationJob("test.published", z.object({ event: z.looseObject({ type: z.string() }) }), async () => {});
function backend({ subscriptions = [recorder].flatMap((job) => ["xpRecorded", "levelReached"].map((event) => ({ event, job }))) as Subscription<any>[] } = {}) {
  const clock = createClock({ real: () => at });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1, subscribers: subscribersOf(subscriptions) });
  const seed = seeder(operations);
  const scheduled = (name?: string) =>
    operations.query("test.scheduled", async ({ tx }) => {
      const rows = await tx.select().from(jobs).where(name === undefined ? undefined : eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id));
      return rows.map((row) => toDocument<{ name: string; args: { event: Record<string, unknown> } }>(jobs, row));
    });
  return {
    seed,
    mutation: <T>(handler: (ctx: MutationContext) => Promise<T>) => operations.mutation("test.mutation", handler),
    query: <T>(handler: (ctx: QueryContext) => Promise<T>) => operations.query("test.query", handler),
    scheduled,
    published: async () => (await scheduled(recorder.name)).map(({ args }) => args.event),
    member: (user: string, timeZone?: string) => seed.insert("members", { workspace: "T1", user, kind: "member", ...(timeZone ? { timeZone } : {}) }) as Promise<MemberId>,
  };
}

const award = (n: number) => `award-${n}` as Id<"awards">;

function giverRecord(member: MemberId, awardId: Id<"awards">, extra: Partial<EffectsRecord> = {}): EffectsRecord {
  return { award: awardId, side: "giver", member, day: "2026-10-13", baseXp: 10, gate: { version: 1, thoughtful: true }, catalogueVersion: "2", ...extra };
}

function heldReward(member: MemberId, extra: Partial<RewardRecord> = {}): RewardRecord {
  return { member, key: "weekly:2026-10-12:0", xp: 300, coins: 10, item: null, catalogueVersion: "1", at, held: true, ...extra };
}

describe("standing", () => {
  test("a member with no XP stands at level 1, and their home shows the XP to level 2", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");

    expect(await t.query((ctx) => progressionHomeOf(ctx, alice))).toEqual({ xp: 0, level: 1, skillPoints: 0, xpToNextLevel: xpToReach(2) });
  });

  test("spending skill points keeps the XP and lowers the points left", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");
    await t.seed.insert("memberProgress", { member: alice, xp: xpToReach(7), pointsSpent: 0 });

    await t.mutation((ctx) => spendSkillPoints(ctx, alice, 2));
    await t.mutation((ctx) => spendSkillPoints(ctx, alice, 1));

    expect(await t.query((ctx) => standingOf(ctx, alice))).toEqual({ xp: xpToReach(7), level: 7, skillPoints: 0 });
    expect(await t.seed.all("memberProgress")).toHaveLength(1);
  });

  test("spending a member's first skill point starts their progress row", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");

    await t.mutation((ctx) => spendSkillPoints(ctx, alice, 1));

    expect((await t.seed.all("memberProgress")).map(({ member, xp, pointsSpent }) => ({ member, xp, pointsSpent }))).toEqual([{ member: alice, xp: 0, pointsSpent: 1 }]);
  });
});

describe("CR2 CR3: a held reward counts only from its open", () => {
  test("recording a held reward writes only its record: no XP, no level and no event; recording it again is a no-op", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");

    expect(await t.mutation((ctx) => recordReward(ctx, "T1", heldReward(alice)))).toBe("recorded");
    expect(await t.mutation((ctx) => recordReward(ctx, "T1", heldReward(alice, { xp: 999 })))).toBe("already recorded");

    expect(await t.seed.all("rewardRecords")).toEqual([expect.objectContaining(heldReward(alice))]);
    expect(await t.query((ctx) => standingOf(ctx, alice))).toEqual({ xp: 0, level: 1, skillPoints: 0 });
    expect(await t.scheduled()).toEqual([]);
  });

  test.each([
    ["a fraction of a coin", 0.5],
    ["negative coins", -1],
  ])("a held reward of %s is refused before its record is written", async (_, coins) => {
    const t = backend();
    const alice = await t.member("U_ALICE");

    await expect(t.mutation((ctx) => recordReward(ctx, "T1", heldReward(alice, { coins })))).rejects.toThrow("not a whole number of coins");

    expect(await t.seed.all("rewardRecords")).toEqual([]);
  });
});

describe("P8: effects records", () => {
  test("a recorded side reads back with its XP, bonus and gate, and its award no longer counts as unrecorded", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const given = { giver: alice, recipient: bob, kudos: 1 };
    await t.mutation((ctx) =>
      insertEffects(ctx, [
        giverRecord(alice, award(1), { bonus: [{ source: "spark", xp: 3 }], coins: [{ source: "giving", coins: 4 }] }),
        giverRecord(alice, award(2), { gate: { version: 1, thoughtful: false }, bonus: [{ source: "spark", xp: 2 }, { source: "rhythm", xp: 5 }] }),
        { ...giverRecord(bob, award(1)), side: "recipient", baseXp: 5 },
      ]),
    );

    const read = await t.query(async (ctx) => ({
      recorded: [await isRecorded(ctx, award(1), "giver"), await isRecorded(ctx, award(1), "recipient"), await isRecorded(ctx, award(3), "giver")],
      xp: [await xpRecordedFor(ctx, award(1), "giver"), await xpRecordedFor(ctx, award(1), "recipient"), await xpRecordedFor(ctx, award(3), "giver")],
      gates: [await gateRecordedWith(ctx, award(1)), await gateRecordedWith(ctx, award(2)), await gateRecordedWith(ctx, award(3))],
      bonus: await bonusRecordedWith(ctx, [award(1), award(2), award(3)]),
      unrecordedForAlice: await unrecordedAwardsOf(ctx, alice, [1, 2, 3].map((n) => ({ ...given, award: award(n) }))),
      unrecordedForCarol: await unrecordedAwardsOf(ctx, "carol" as MemberId, [{ ...given, award: award(3) }]),
    }));

    expect(read).toEqual({
      recorded: [true, true, false],
      xp: [13, 5, null],
      gates: [{ version: 1, thoughtful: true }, { version: 1, thoughtful: false }, null],
      bonus: [
        { source: "spark", xp: 5 },
        { source: "rhythm", xp: 5 },
      ],
      unrecordedForAlice: [{ ...given, award: award(3) }],
      unrecordedForCarol: [],
    });
  });

  test("a record keeps a missing bonus missing and a null gate null", async () => {
    const t = backend();
    const alice = await t.member("U_ALICE");

    await t.mutation((ctx) => insertEffects(ctx, [giverRecord(alice, award(1), { gate: null })]));

    const [stored] = await t.seed.all("effectsRecords");
    expect(stored).toEqual({ _id: expect.any(String), _creationTime: expect.any(Number), ...giverRecord(alice, award(1), { gate: null }) });
    expect(stored).not.toHaveProperty("bonus");
  });
});

describe("receiving coins", () => {
  const kudosGiven = (giver: MemberId, at: number) => ({ giver, at }) as Parameters<typeof receivingWeekOf>[1];

  test("the week is the recipient's own: a Monday-morning kudos in Auckland is last week in Honolulu", async () => {
    const t = backend();
    const [giver, auckland, honolulu] = [await t.member("U_GIVER"), await t.member("U_NZ", "Pacific/Auckland"), await t.member("U_HI", "Pacific/Honolulu")];
    const sundayEveningUtc = new Date("2026-10-18T20:00:00Z").getTime();

    const weeks = await t.query(async (ctx) => [
      await receivingWeekOf(ctx, kudosGiven(giver, sundayEveningUtc), auckland),
      await receivingWeekOf(ctx, kudosGiven(giver, sundayEveningUtc), honolulu),
      await receivingWeekOf(ctx, kudosGiven(giver, sundayEveningUtc), giver),
    ]);

    expect(weeks).toEqual([{ recipient: auckland, week: "2026-10-19", paidBy: [] }, { recipient: honolulu, week: "2026-10-12", paidBy: [] }, null]);
  });

  test("a giver who paid receiving coins is remembered for the week, at most ten givers are read, and effects without receiving coins write nothing", async () => {
    const t = backend();
    const bob = await t.member("U_BOB");
    const givers = await Promise.all(Array.from({ length: 12 }, (_, i) => t.member(`U_G${i}`)));
    const paid: EffectsRecord[] = [{ ...giverRecord(bob, award(1)), side: "recipient", coins: [{ source: "receiving", coins: 2 }] }];

    for (const giver of givers.slice(0, 11)) {
      await t.mutation(async (ctx) => recordReceiving(ctx, await receivingWeekOf(ctx, kudosGiven(giver, at), bob), giver, paid));
    }
    await t.mutation(async (ctx) => recordReceiving(ctx, await receivingWeekOf(ctx, kudosGiven(givers[11]!, at), bob), givers[11]!, [{ ...paid[0]!, coins: [] }]));
    await t.mutation(async (ctx) => recordReceiving(ctx, null, givers[11]!, paid));

    const week = await t.query((ctx) => receivingWeekOf(ctx, kudosGiven(givers[0]!, at), bob));
    expect(week).toEqual({ recipient: bob, week: "2026-10-12", paidBy: givers.slice(0, 10) });
    expect(await t.seed.all("receivingGivers")).toHaveLength(11);
  });
});

describe("reading rewards", () => {
  test("by key prefix, by the message that caused them, and page by page in creation order", async () => {
    const t = backend();
    const [alice, bob] = [await t.member("U_ALICE"), await t.member("U_BOB")];
    const cause = { workspace: "T1", conversation: "C1", message: "1.0" };
    const rewards: RewardRecord[] = [
      heldReward(alice, { key: "tier:kudos:2", held: undefined, cause }),
      heldReward(alice, { key: "tier:kudos:1", held: undefined }),
      heldReward(alice, { key: "tierx", held: undefined, cause }),
      heldReward(bob, { key: "tier:kudos:1", held: undefined, cause }),
      heldReward(alice, { key: "quest:1", held: undefined, cause: { ...cause, message: "2.0" } }),
    ];
    for (const reward of rewards) await t.seed.insert("rewardRecords", Object.fromEntries(Object.entries(reward).filter(([, value]) => value !== undefined)) as RewardRecord);

    const keys = (records: Array<{ key: string; member: string }>) => records.map(({ member, key }) => `${member === alice ? "alice" : "bob"} ${key}`);
    expect(keys(await t.query((ctx) => rewardsKeyedFrom(ctx, alice, "tier:")))).toEqual(["alice tier:kudos:1", "alice tier:kudos:2"]);
    expect(keys(await t.query((ctx) => rewardsCausedBy(ctx, alice, cause)))).toEqual(["alice tier:kudos:2", "alice tierx"]);
    expect(await t.query((ctx) => rewardOf(ctx, alice, "quest:1"))).toEqual(expect.objectContaining({ key: "quest:1", cause: { ...cause, message: "2.0" } }));
    expect(await t.query((ctx) => rewardOf(ctx, alice, "quest:2"))).toBeNull();

    const pages: string[][] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: Awaited<ReturnType<typeof rewardsPage>> = await t.query((ctx) => rewardsPage(ctx, cursor, 2));
      pages.push(keys(page.page));
      cursor = page.continueCursor;
      if (page.isDone) break;
    }
    expect(pages).toEqual([["alice tier:kudos:2", "alice tier:kudos:1"], ["alice tierx", "bob tier:kudos:1"], ["alice quest:1"]]);
    expect((await t.query((ctx) => rewardsPage(ctx, cursor, 2))).page).toEqual([]);
  });
});

test("a kudosGiven the service publishes schedules progression's recordEffects", async () => {
  const t = backend({ subscriptions: [...(serviceRegistry.subscribers.get("kudosGiven") ?? [])] });

  expect(serviceRegistry.jobs.has("progression.progression.recordEffects")).toBe(true);
  expect((serviceRegistry.subscribers.get("kudosGiven") ?? []).map(({ job }) => job.name)).toContain("progression.progression.recordEffects");
  expect(await t.published()).toEqual([]);
});
