// Today's convex/unlocks/unlocks.test.ts on S4's in-process backend: the backend's clock for the fake timers, the
// committed events `published()` records for the mocked `publish`, and the jobs table for `_scheduled_functions`.
// A level reached and a feature shipped are told through messageSettings' placeOf (S5); a member's own open draws a
// hoggie through album.hoggies.drops.dropFor (S9): the tests that reach them wait on those stacks.
import { and, asc, eq, getTableColumns, getTableName, is, ne } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type PublishedEvent, type TestBackend } from "../../testing/backend.ts";
import { flagsFromPostHog, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { decodeStored } from "../db/codec.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import * as schema from "../db/schema/index.ts";
import * as loadTables from "../db/schema/load.ts";
import { jobs, memberProgress, members } from "../db/schema/index.ts";
import * as serviceTables from "../db/schema/service.ts";
import type { MutationJob } from "../jobs/define.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Feature } from "./feature.ts";
import { unlocksLiveIn } from "./launch.ts";
import { sweepJob } from "./sweep.ts";
import { makeReadyJob, openUnlock, stateOf, unlocksOf as memberUnlocks } from "./unlocks.ts";


const now = new Date("2026-10-13T10:00:00Z");
const weekMs = 7 * 24 * 60 * 60 * 1000;

const backend = useTestBackend({ now: now.getTime() });

// What PostHog serves when a test starts, as `flagsOnForEveryone` set it in the Convex test.
let flagsOn: string[];
// How many events were published when the test last cleared its record, as `vi.mocked(publish).mockClear()` did.
let cleared: number;

beforeEach(() => {
  postHogDeciding("sandbox");
  flagsOn = ["xp-levels", "unlocks", "everyone-board"];
  cleared = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("P73 P79: readiness is stored once, with its time, when levelReached arrives", () => {
  waitsOn(["S5"], "reaching level 3 with everyone-board on makes the Leaderboard ready at the event's time and publishes unlockReady", async () => {
    const { t, alice } = await withMember();

    await levelReached(t, alice, 3);

    expect(await unlocksOf(t, alice)).toEqual([{ feature: "leaderboard", state: "ready", readyAt: now.getTime(), openedAt: null }]);
    expect(await published(t, "unlockReady")).toEqual([{ type: "unlockReady", workspace: "T1", member: alice, feature: "leaderboard", at: now.getTime() }]);
  });

  waitsOn(["S5"], "P6: a member who jumps from level 1 to level 5 gets every shipped feature at or below level 5, and level 2 alone makes nothing ready", async () => {
    const { t, alice } = await withMember();
    await flagsFromPostHog(t.operations, t.postHog, onForEveryone("xp-levels"), onForEveryone("unlocks"), offForEveryone("everyone-board"), onForEveryone("quests"));

    await levelReached(t, alice, 2);
    expect(await unlocksOf(t, alice)).toEqual([{ feature: "quests", state: "locked", readyAt: null, openedAt: null }]);

    await levelReached(t, alice, 5);
    expect(await unlocksOf(t, alice)).toEqual([{ feature: "quests", state: "ready", readyAt: now.getTime(), openedAt: null }]);
  });

  waitsOn(["S5"], "a replayed levelReached writes nothing new and publishes nothing new", async () => {
    const { t, alice } = await withMember();
    const event = levelReachedEvent(t, alice, 3);
    await runJob(t, makeReadyJob, { event });
    const before = await everyTable(t);
    await clearPublished(t);

    t.clock.advance(60_000);
    await runJob(t, makeReadyJob, { event });

    expect(await everyTable(t)).toEqual(before);
    expect(await publishedSinceCleared(t)).toEqual([]);
  });
});

describe("P78: an unshipped feature is never ready, named or counted", () => {
  waitsOn(["S5"], "with everyone-board off, level 7 makes nothing ready, and the website read leaves every feature out", async () => {
    const { t, alice } = await withMember();
    await boardTurned(t, "off");

    await levelReached(t, alice, 7);

    expect(await unlocksOf(t, alice)).toEqual([]);
    expect(await state(t, alice, "leaderboard")).toBe("unshipped");
    expect(await published(t, "unlockReady")).toEqual([]);
  });

  waitsOn(["S5", "S9"], "the website read gives each shipped feature's state, readyAt and openedAt, and leaves unshipped features out", async () => {
    const { t, alice } = await withMember();
    expect(await unlocksOf(t, alice)).toEqual([{ feature: "leaderboard", state: "locked", readyAt: null, openedAt: null }]);

    await levelReached(t, alice, 2);
    expect(await unlocksOf(t, alice)).toEqual([{ feature: "leaderboard", state: "ready", readyAt: now.getTime(), openedAt: null }]);

    t.clock.advance(60_000);
    await open(t, alice, "leaderboard");
    expect(await unlocksOf(t, alice)).toEqual([{ feature: "leaderboard", state: "open", readyAt: now.getTime(), openedAt: now.getTime() + 60_000 }]);
    expect(await state(t, alice, "quests")).toBe("unshipped");
  });
});

describe("P73: openUnlock opens a ready feature and refuses every other", () => {
  waitsOn(["S5", "S9"], "opening a ready feature stores openedAt, publishes unlockOpened and is done", async () => {
    const { t, alice } = await withMember();
    await levelReached(t, alice, 3);
    t.clock.advance(60_000);

    expect(await open(t, alice, "leaderboard")).toBe("done");

    const openedAt = now.getTime() + 60_000;
    expect(await unlocksOf(t, alice)).toEqual([{ feature: "leaderboard", state: "open", readyAt: now.getTime(), openedAt }]);
    expect(await published(t, "unlockOpened")).toEqual([{ type: "unlockOpened", workspace: "T1", member: alice, feature: "leaderboard", at: openedAt }]);
  });

  for (const [stale, level, feature, board] of [
    ["locked", 1, "leaderboard", "on"],
    ["unshipped, with no flag", 7, "book", "on"],
    ["ready while everyone-board is off", 3, "leaderboard", "off"],
  ] as const)
    waitsOn(["S5"], `a stale open for a feature that is ${stale} writes nothing, publishes nothing and is refused`, async () => {
      const { t, alice } = await withMember();
      await levelReached(t, alice, level);
      if (board === "off") await boardTurned(t, "off");
      const before = await everyTable(t);
      await clearPublished(t);

      expect(await open(t, alice, feature)).toBe("refused");

      expect(await everyTable(t)).toEqual(before);
      expect(await publishedSinceCleared(t)).toEqual([]);
    });
});

describe("P92: opening grants nothing", () => {
  waitsOn(["S5", "S9"], "opening writes only the feature's openedAt: every effects record, the XP, the level and the skill points spent are as they were", async () => {
    const { t, alice } = await withMember();
    await withEarnings(t, alice, 300);
    await levelReached(t, alice, 3);
    const before = await everyTable(t);

    await open(t, alice, "leaderboard");

    const after = await everyTable(t);
    expect(withoutCollectionExposure({ ...after, unlocks: [] })).toEqual({ ...before, unlocks: [] });
    expect(after.unlocks).toEqual(before.unlocks!.map((row) => ({ ...row, openedAt: now.getTime() })));
    expect(await published(t, "unlockOpened")).toHaveLength(1);
  });

  waitsOn(["S5", "S9"], "with collection on, a member's own open also drops one hoggie before unlockOpened, and nothing else changes", async () => {
    flagsOn = ["xp-levels", "unlocks", "everyone-board", "collection"];
    const { t, alice } = await withMember();
    await withEarnings(t, alice, 300);
    await levelReached(t, alice, 3);
    const before = await everyTable(t);
    await clearPublished(t);

    await open(t, alice, "leaderboard");

    const after = await everyTable(t);
    expect(withoutDropExposures({ ...after, unlocks: [], drops: [], hoggieTallies: [], dropTallies: [] })).toEqual({ ...before, unlocks: [] });
    expect(after.drops).toEqual([expect.objectContaining({ member: alice, crate: "unlock:leaderboard", n: 1, copy: 1, at: now.getTime() })]);
    expect((await publishedSinceCleared(t)).map((event) => event.type)).toEqual(["hoggieDropped", "unlockOpened"]);
  });
});

describe("P5: a ready or opened feature is kept for good", () => {
  waitsOn(["S5"], "through a week, a later level up and its flag going off and on, a ready Leaderboard stays ready with its first readyAt and is never made ready again", async () => {
    const { t, alice } = await withMember();
    await levelReached(t, alice, 3);
    const ready = [{ feature: "leaderboard", state: "ready", readyAt: now.getTime(), openedAt: null }];

    t.clock.advance(weekMs);
    await levelReached(t, alice, 4);
    expect(await unlocksOf(t, alice)).toEqual(ready);

    await boardTurned(t, "off");
    expect(await state(t, alice, "leaderboard")).toBe("unshipped");
    await levelReached(t, alice, 5);

    await boardTurned(t, "on");
    expect(await unlocksOf(t, alice)).toEqual(ready);
    expect(await published(t, "unlockReady")).toHaveLength(1);
  });

  waitsOn(["S5", "S9"], "a second open, a replayed levelReached, a later level up and the flag going off and on leave an opened Leaderboard open with its first times, publishing nothing and writing only the later level ups, which make nothing ready", async () => {
    const { t, alice } = await withMember();
    const reached = levelReachedEvent(t, alice, 3);
    await runJob(t, makeReadyJob, { event: reached });
    await open(t, alice, "leaderboard");
    const before = await everyTable(t);
    await clearPublished(t);

    t.clock.advance(weekMs);
    expect(await open(t, alice, "leaderboard")).toBe("refused");
    await runJob(t, makeReadyJob, { event: reached });
    await levelReached(t, alice, 4);
    await boardTurned(t, "off");
    await levelReached(t, alice, 5);
    await boardTurned(t, "on");

    const laterLevelUps = [4, 5].map((level) => expect.objectContaining({ member: alice, level, ready: [] }));
    expect(await everyTable(t)).toEqual({ ...before, levelUps: [...before.levelUps!, ...laterLevelUps] });
    expect(await state(t, alice, "leaderboard")).toBe("open");
    expect(await publishedSinceCleared(t)).toEqual([]);
  });
});

describe("P78: a feature that ships later is made ready once by the ship sweep", () => {
  waitsOn(["S5"], "a level 4 member's Leaderboard is made ready by the first sweep after everyone-board turns on; later sweeps and the flag going off and on write and publish nothing", async () => {
    const { t, alice } = await withMember();
    await withEarnings(t, alice, 300);
    await boardTurned(t, "off");
    await sweep(t);
    expect(await unlocksOf(t, alice)).toEqual([]);

    await boardTurned(t, "on");
    await sweep(t);
    expect(await unlocksOf(t, alice)).toEqual([{ feature: "leaderboard", state: "ready", readyAt: now.getTime(), openedAt: null }]);
    expect(await published(t, "unlockReady")).toEqual([{ type: "unlockReady", workspace: "T1", member: alice, feature: "leaderboard", at: now.getTime() }]);
    const before = await everyTable(t);
    await clearPublished(t);

    t.clock.advance(weekMs);
    await sweep(t);
    await boardTurned(t, "off");
    await sweep(t);
    await boardTurned(t, "on");
    await sweep(t);

    expect(await everyTable(t)).toEqual(before);
    expect(await publishedSinceCleared(t)).toEqual([]);
  });

  waitsOn(["S5", "S9"], "an opened Leaderboard stays open with its first times through sweeps and its flag going off and on", async () => {
    const { t, alice } = await withMember();
    await withEarnings(t, alice, 300);
    await sweep(t);
    await open(t, alice, "leaderboard");
    const before = await everyTable(t);

    await boardTurned(t, "off");
    await sweep(t);
    await boardTurned(t, "on");
    await sweep(t);

    expect(await everyTable(t)).toEqual(before);
    expect(await state(t, alice, "leaderboard")).toBe("open");
  });

  test("a member below the Leaderboard's level gets nothing from the sweep", async () => {
    const { t, alice } = await withMember();
    await withEarnings(t, alice, 19);

    await sweep(t);

    expect(await unlocksOf(t, alice)).toEqual([{ feature: "leaderboard", state: "locked", readyAt: null, openedAt: null }]);
    expect(await published(t, "unlockReady")).toEqual([]);
  });

  waitsOn(["S5"], "a sweep that makes the Leaderboard ready for 600 members schedules fewer than Convex's 1000 functions in each of its mutations, and every one of them ends up ready", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
    const { t } = await withMember();
    const ids = await t.run(async (ctx) => {
      const inserted: MemberId[] = [];
      for (let index = 0; index < 600; index += 1) {
        const member = await insert(ctx, members, { workspace: "T1", user: `U_${index}`, kind: "member", timeZone: "UTC" });
        await insert(ctx, memberProgress, { member, xp: 100, pointsSpent: 0 });
        inserted.push(member as MemberId);
      }
      return inserted;
    });

    const scheduledPerPage = await sweepPageByPage(t);

    for (const scheduled of scheduledPerPage) expect(scheduled).toBeLessThan(1000);
    expect(scheduledPerPage.length).toBeGreaterThan(1);
    expect(await published(t, "unlockReady")).toHaveLength(ids.length);
  }, 60_000);

  // Convex's `transactionLimits: true` has no counterpart: Postgres sets no such limit, so this proves the page runs.
  waitsOn(["S5"], "a page of level 5 members, each deciding every ship flag for themselves with capture on, fits in one mutation within Convex's transaction limits", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
    const t = await unlocksShippedBeforeAnyoneJoined(await flagsLoaded(backend()));
    await t.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        const member = await insert(ctx, members, { workspace: "T1", user: `U_${index}`, kind: "member", timeZone: "UTC" });
        await insert(ctx, memberProgress, { member, xp: 600, pointsSpent: 0 });
      }
    });
    await flagsFromPostHog(t.operations, t.postHog, ...["xp-levels", "unlocks", "everyone-board", "quests", "skill-tree"].map(onForEveryone));

    await sweepPageByPage(t);

    expect(await published(t, "unlockReady")).toHaveLength(100 * 3);
  }, 30_000);
});

type Ctx = Parameters<Parameters<TestBackend["run"]>[0]>[0];
type Row = Record<string, unknown>;

// The events the test backend records are jobs too; Convex's `publish` mock recorded them without scheduling anything.
const recorderName = "testing.published";

async function sweepPageByPage(t: TestBackend) {
  const scheduledPerPage: number[] = [];
  let next: { cursor?: string } | undefined = {};
  while (next !== undefined) {
    await runJob(t, sweepJob, next);
    const scheduled = await t.query(({ tx }) => tx.select({ _id: jobs._id, name: jobs.name, args: jobs.args }).from(jobs).where(and(eq(jobs.state, "pending"), ne(jobs.name, recorderName))));
    scheduledPerPage.push(scheduled.length);
    const page = scheduled.find(({ name }) => name === sweepJob.name);
    next = page === undefined ? undefined : (decodeStored(page.args) as { cursor: string });
    await t.run(async (ctx) => {
      for (const { _id } of scheduled) await ctx.jobs.cancel(_id);
    });
  }
  return scheduledPerPage;
}

function sweep(t: TestBackend) {
  return runJob(t, sweepJob, {});
}

function boardTurned(t: TestBackend, value: "on" | "off") {
  return flagsFromPostHog(t.operations, t.postHog, onForEveryone("xp-levels"), onForEveryone("unlocks"), (value === "on" ? onForEveryone : offForEveryone)("everyone-board"));
}

async function flagsLoaded(t: TestBackend) {
  await flagsFromPostHog(t.operations, t.postHog, ...flagsOn.map(onForEveryone));
  return t;
}

async function unlocksShippedBeforeAnyoneJoined(t: TestBackend, workspace = "T1") {
  await t.run((ctx) => unlocksLiveIn(ctx, workspace));
  return t;
}

async function withMember() {
  const t = await unlocksShippedBeforeAnyoneJoined(await flagsLoaded(backend()));
  const alice = (await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", timeZone: "UTC" })) as MemberId;
  return { t, alice };
}

async function withEarnings(t: TestBackend, member: MemberId, xp: number) {
  await t.run(async (ctx) => {
    const award = await insert(ctx, schema.awards, { workspace: "T1", conversation: "C1", message: "1.0", giver: member, recipient: member, kudos: 1, day: "2026-10-13", at: now.getTime() });
    await insert(ctx, schema.effectsRecords, { award, side: "giver", member, day: "2026-10-13", baseXp: xp, gate: null, catalogueVersion: "1" });
    await insert(ctx, memberProgress, { member, xp, pointsSpent: 0 });
  });
}

async function insert(ctx: Ctx, table: PgTable, document: Row): Promise<string> {
  const stamped = { ...ctx.newRow(), ...document };
  await ctx.tx.insert(table).values(fromDocument(table, stamped) as never);
  return stamped._id;
}

function levelReachedEvent(t: TestBackend, member: MemberId, level: number): LevelReachedEvent {
  return {
    type: "levelReached",
    workspace: "T1",
    member,
    level,
    skillPointsGained: 0,
    skillPoints: 0,
    xpToNextLevel: 100,
    message: { workspace: "T1", conversation: "C1", message: "1760349600.000100" },
    at: t.clock.now(),
  };
}

// A job run as one mutation with its args checked, as `t.mutation(internal...)` ran the Convex function.
function runJob<Args, Input>(t: TestBackend, job: MutationJob<Args, Input>, args: Input) {
  return t.run((ctx) => job.handler(ctx, job.args.parse(args)));
}

function levelReached(t: TestBackend, member: MemberId, level: number) {
  return runJob(t, makeReadyJob, { event: levelReachedEvent(t, member, level) });
}

function open(t: TestBackend, member: MemberId, feature: Feature) {
  return t.run((ctx) => openUnlock(ctx, member, feature, "slack"));
}

function unlocksOf(t: TestBackend, member: MemberId) {
  return t.query((ctx) => memberUnlocks(ctx, member));
}

function state(t: TestBackend, member: MemberId, feature: Feature) {
  return t.run((ctx) => stateOf(ctx, member, feature));
}

// Each event as the domain published it, without the fact the bus adds.
async function everyEvent(t: TestBackend) {
  return (await t.published()).map(({ fact: _, ...event }): Omit<PublishedEvent, "fact"> => event);
}

async function published(t: TestBackend, type: "unlockReady" | "unlockOpened") {
  return (await everyEvent(t)).slice(cleared).filter((event) => event.type === type);
}

async function clearPublished(t: TestBackend) {
  cleared = (await t.published()).length;
}

async function publishedSinceCleared(t: TestBackend) {
  return (await everyEvent(t)).slice(cleared);
}

// Every table Convex's schema has, so not the service's own (the job history among them) nor the load's.
const ownTables = new Set<unknown>([...Object.values(serviceTables), ...Object.values(loadTables)]);
const appTables = (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable) && !ownTables.has(table));

async function everyTable(t: TestBackend) {
  return t.query(async ({ tx }) => {
    const tables: Record<string, Row[]> = {};
    for (const table of appTables) {
      const columns = getTableColumns(table);
      const rows = await tx.select().from(table).orderBy(asc(columns._creationTime!), asc(columns._id!));
      tables[getTableName(table)] = rows.map((row) => toDocument<Row>(table, row));
    }
    return tables;
  });
}

type Tables = Record<string, Row[]>;

function withoutExposureOf<T extends Tables>(flag: string, tables: T): T {
  return {
    ...tables,
    flagExposures: tables.flagExposures!.filter((exposure) => exposure.flag !== flag),
    analyticsOutbox: tables.analyticsOutbox!.filter(({ properties }) => (properties as Row | undefined)?.feature_flag !== flag),
  };
}

function withoutCollectionExposure<T extends Tables>(tables: T): T {
  return withoutExposureOf("collection", tables);
}

function withoutDropExposures<T extends Tables>(tables: T): T {
  return withoutExposureOf("rarity-caps", withoutExposureOf("packs", withoutCollectionExposure(tables)));
}
