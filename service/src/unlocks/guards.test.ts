// The unlocks' per-row guards, each run twice: what a replayed event or a restarted sweep relies on during the data move.
// They call the guarded writes directly, so they run before S5's notices land; unlocks.test.ts drives the same guards
// through the jobs, and waits on S5.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsFromPostHog, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import type { LevelReachedEvent, UnlocksLaunchedEvent } from "../bus/events.ts";
import { levelUps, members, unlockLaunches, unlocks } from "../db/schema/index.ts";
import type { MutationContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { unlocksLiveIn } from "./launch.ts";
import { scheduled } from "./schedule.ts";
import { keepOpen, makeReadyJob, storeReadiness } from "./unlocks.ts";

const now = new Date("2026-10-13T10:00:00Z").getTime();

const backend = useTestBackend({ now });

beforeEach(() => {
  postHogDeciding("sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("readiness stored twice is one row at the first time, and one unlockReady", async () => {
  const { t, alice } = await withMember();

  const first = await t.run((ctx) => storeReadiness(ctx, { workspace: "T1", member: alice, at: now }, [scheduled("leaderboard")]));
  const second = await t.run((ctx) => storeReadiness(ctx, { workspace: "T1", member: alice, at: now + 1000 }, [scheduled("leaderboard")]));

  expect(first.map(({ feature }) => feature)).toEqual(["leaderboard"]);
  expect(second).toEqual([]);
  expect(await unlockRows(t, alice)).toEqual([{ feature: "leaderboard", readyAt: now, openedAt: null }]);
  expect(await publishedOf(t, "unlockReady")).toHaveLength(1);
});

test("an opening kept twice keeps the first openedAt, and publishes one unlockOpened", async () => {
  const { t, alice } = await withMember();
  await t.run((ctx) => storeReadiness(ctx, { workspace: "T1", member: alice, at: now }, [scheduled("leaderboard")]));

  const first = await t.run((ctx) => keepOpen(ctx, { workspace: "T1", member: alice, at: now + 1000 }, "leaderboard"));
  const second = await t.run((ctx) => keepOpen(ctx, { workspace: "T1", member: alice, at: now + 2000 }, "leaderboard"));

  expect([first, second]).toEqual([true, false]);
  expect(await unlockRows(t, alice)).toEqual([{ feature: "leaderboard", readyAt: now, openedAt: now + 1000 }]);
  expect(await publishedOf(t, "unlockOpened")).toHaveLength(1);
});

test("a levelReached whose level-up is already recorded writes and publishes nothing", async () => {
  const { t, alice } = await withMember();
  await t.seed.insert("levelUps", { member: alice, level: 3, ready: [], at: now });
  const publishedBefore = (await t.published()).length;

  await t.run((ctx) => makeReadyJob.handler(ctx, makeReadyJob.args.parse({ event: levelReachedEvent(alice, 3) })));

  expect(await t.query(({ tx }) => tx.select({ level: levelUps.level }).from(levelUps).where(eq(levelUps.member, alice)))).toEqual([{ level: 3 }]);
  expect(await unlockRows(t, alice)).toEqual([]);
  expect((await t.published()).length).toBe(publishedBefore);
});

test("unlocks turned live twice in a workspace launch it once", async () => {
  const { t } = await withMember();

  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));

  expect(await t.query(({ tx }) => tx.select({ at: unlockLaunches.at }).from(unlockLaunches).where(eq(unlockLaunches.workspace, "T1")))).toHaveLength(1);
});

test("a launch opens what shipped for every member already there, once, in events of 1000 openings", async () => {
  const t = backend();
  await flagsFromPostHog(t.operations, t.postHog, ...["xp-levels", "unlocks", "everyone-board", "quests"].map(onForEveryone));
  const { inT1, bot, elsewhere } = await t.run(async (ctx) => {
    const inT1: MemberId[] = [];
    for (let index = 0; index < 501; index += 1) inT1.push(await insertMember(ctx, "T1", `U_${index}`, "member"));
    return { inT1, bot: await insertMember(ctx, "T1", "U_BOT", "bot"), elsewhere: await insertMember(ctx, "T2", "U_ELSEWHERE", "member") };
  });
  t.clock.advance(60_000);
  const at = t.clock.now();

  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));
  t.clock.advance(60_000);
  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));

  const openings = inT1.flatMap((member) => [{ member, feature: "leaderboard" }, { member, feature: "quests" }]);
  const rows = await t.query(({ tx }) => tx.select({ member: unlocks.member, feature: unlocks.feature, readyAt: unlocks.readyAt, openedAt: unlocks.openedAt }).from(unlocks));
  expect(sorted(rows)).toEqual(sorted(openings.map((opening) => ({ ...opening, readyAt: at, openedAt: at }))));
  expect(rows.some(({ member }) => member === bot || member === elsewhere)).toBe(false);
  const opened = await publishedOf(t, "unlockOpened");
  expect(sorted(opened.map(({ fact: _, ...event }) => event))).toEqual(sorted(openings.map((opening) => ({ type: "unlockOpened", workspace: "T1", ...opening, at, byLaunch: true }))));
  const launched = (await t.published()).filter((event) => event.type === "unlocksLaunched") as unknown as UnlocksLaunchedEvent[];
  expect(launched.map(({ workspace, at, openings }) => ({ workspace, at, count: openings.length }))).toEqual([
    { workspace: "T1", at, count: 1000 },
    { workspace: "T1", at, count: 2 },
  ]);
  expect(sorted(launched.flatMap(({ openings }) => openings))).toEqual(sorted(openings));
}, 60_000);

test("a levelReached handled late stores readiness at the time the level was reached", async () => {
  const { t, alice } = await withMember();
  await flagsFromPostHog(t.operations, t.postHog, ...["unlocks", "everyone-board"].map(onForEveryone));
  const event = levelReachedEvent(alice, 3);
  t.clock.advance(60 * 60 * 1000);

  await t.run((ctx) => makeReadyJob.handler(ctx, makeReadyJob.args.parse({ event })));

  expect(await unlockRows(t, alice)).toEqual([{ feature: "leaderboard", readyAt: now, openedAt: null }]);
  expect(await t.query(({ tx }) => tx.select({ level: levelUps.level, at: levelUps.at }).from(levelUps).where(eq(levelUps.member, alice)))).toEqual([{ level: 3, at: now }]);
  expect((await publishedOf(t, "unlockReady")).map(({ at }) => at)).toEqual([now]);
});

async function withMember() {
  const t = backend();
  await flagsFromPostHog(t.operations, t.postHog, ...["xp-levels", "unlocks", "everyone-board"].map(onForEveryone));
  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));
  const alice = (await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", timeZone: "UTC" })) as MemberId;
  return { t, alice };
}

async function insertMember(ctx: MutationContext, workspace: string, user: string, kind: "member" | "bot"): Promise<MemberId> {
  const row = { ...ctx.newRow(), workspace, user, kind, timeZone: "UTC" };
  await ctx.tx.insert(members).values(row);
  return row._id as MemberId;
}

function sorted<T>(rows: T[]): T[] {
  return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function unlockRows(t: TestBackend, member: MemberId) {
  return t.query(({ tx }) => tx.select({ feature: unlocks.feature, readyAt: unlocks.readyAt, openedAt: unlocks.openedAt }).from(unlocks).where(eq(unlocks.member, member)));
}

async function publishedOf(t: TestBackend, type: "unlockReady" | "unlockOpened") {
  return (await t.published()).filter((event) => event.type === type);
}

function levelReachedEvent(member: MemberId, level: number): LevelReachedEvent {
  return {
    type: "levelReached",
    workspace: "T1",
    member,
    level,
    skillPointsGained: 0,
    skillPoints: 0,
    xpToNextLevel: 100,
    message: { workspace: "T1", conversation: "C1", message: "1760349600.000100" },
    at: now,
  };
}
