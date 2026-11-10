// The unlocks' per-row guards, each run twice: what a replayed event or a restarted sweep relies on during the data move.
// They call the guarded writes directly, so they run before S5's notices land; unlocks.test.ts drives the same guards
// through the jobs, and waits on S5.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsFromPostHog, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { levelUps, unlockLaunches, unlocks } from "../db/schema/index.ts";
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

async function withMember() {
  const t = backend();
  await flagsFromPostHog(t.operations, t.postHog, ...["xp-levels", "unlocks", "everyone-board"].map(onForEveryone));
  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));
  const alice = (await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", timeZone: "UTC" })) as MemberId;
  return { t, alice };
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
