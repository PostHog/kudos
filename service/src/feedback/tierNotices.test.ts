// The notices of tiers a member earned, from outside: beside the kudos that earned them, as a summary when the member
// opens the book, and to each member of a replayed batch once it completes. Whether a tier is told reads S6's book,
// ladders and earned tiers, and a summary republishes the member's home through S17, so those steps are declared
// waiting; the steps that reach none of them run here. The ledger's tests of these notices are S6's
// (convex/slack/tierNotices.test.ts, tierSummaries.test.ts).
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { definitionsStored, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { TierRef } from "../achievements/ladders.ts";
import type { BatchId } from "../achievements/replay.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { UnlockOpenedEvent } from "../bus/events.ts";
import { decodeStored } from "../db/codec.ts";
import { jobs } from "../db/schema/service.ts";
import { serviceRegistry } from "../registry.ts";
import { publishHomeJob } from "../slack/appHome.ts";
import { openUnlock } from "../unlocks/unlocks.ts";
import type { MemberId } from "../workspace/directory.ts";
import { tellBatchSummaries, tellBatchSummariesJob, tellTiersEarned } from "./tierNotices.ts";

// S17 registers the App Home's publishing when it ports it; until then a summary's republished home reaches its stub
// here rather than failing as a job nobody registered.
const registry = { ...serviceRegistry, jobs: new Map([...serviceRegistry.jobs, [publishHomeJob.name, publishHomeJob]]) };
const backend = useTestBackend({ now: Date.parse("2026-10-13T10:00:00Z"), registry });
type Backend = ReturnType<typeof backend>;

const hourMs = 3_600_000;
const kudos = { workspace: "T1", conversation: "C_KUDOS", message: "1700000000.000100" };
const bronze: TierRef = { ladder: "generosity", tier: "bronze" };
const silver: TierRef = { ladder: "generosity", tier: "silver" };

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  postHogDeciding("sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Each member has an analytics ID, so a read that can't write decides their flags as a mutation would.
async function member(t: Backend, user: string) {
  const id = (await t.seed.insert("members", { workspace: "T1", user, kind: "member" })) as MemberId;
  await t.run((ctx) => analyticsIdOf(ctx, id));
  return id;
}

async function withTheBook(t: Backend, ...users: string[]) {
  await definitionsStored(t.operations, ...["xp-levels", "unlocks", "achievements"].map(onForEveryone));
  const opened: MemberId[] = [];
  for (const user of users) {
    const id = await member(t, user);
    await t.run((ctx) => openUnlock(ctx, id, "book", "slack"));
    opened.push(id);
  }
  return opened;
}

function earned(t: Backend, member: MemberId, tier: TierRef, batch?: BatchId) {
  return t.seed.insert("earnedTiers", { member, ...tier, earnedAt: t.clock.now(), award: "award1", catalogueVersion: "v1", rewards: [], ...(batch !== undefined && { batch }) });
}

const pendingPages = (t: Backend) =>
  t.query(async ({ tx }) => (await tx.select().from(jobs).where(and(eq(jobs.name, tellBatchSummariesJob.name), eq(jobs.state, "pending")))).map(({ args }) => decodeStored(args)));

describe("the tiers a kudos earned", () => {
  test("a kudos that earned no tier and finished no team tells nothing and writes nothing", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");

    await t.run((ctx) => tellTiersEarned(ctx, { member: alice, message: kudos, at: ctx.now, earned: [] }));

    expect((await t.settle()).ran).toEqual([]);
    expect(await t.seed.all("tierNotices")).toEqual([]);
    expect(t.slack.calls).toEqual([]);
  });

  waitsOn(["S5", "S6", "S17"], "are told beside the kudos once, and a tier earned later on the same kudos is told alone", async () => {
    const t = backend();
    const [alice] = await withTheBook(t, "U_ALICE");

    await t.run((ctx) => tellTiersEarned(ctx, { member: alice!, message: kudos, at: ctx.now, earned: [bronze] }));
    await t.run((ctx) => tellTiersEarned(ctx, { member: alice!, message: kudos, at: ctx.now, earned: [bronze, silver] }));
    await t.run((ctx) => tellTiersEarned(ctx, { member: alice!, message: kudos, at: ctx.now, earned: [bronze, silver] }));
    await t.settle();

    expect((await t.seed.all("tierNotices")).map(({ tiers }) => tiers)).toEqual([[bronze, silver]]);
    expect(t.slack.callsTo("chat.postEphemeral")).toHaveLength(2);
  });
});

describe("a member who opens the book", () => {
  test("is told nothing when a launch opened it, or when another feature opened", async () => {
    const t = backend();
    const alice = await member(t, "U_ALICE");
    const opened = (feature: UnlockOpenedEvent["feature"], byLaunch?: true): UnlockOpenedEvent => ({ type: "unlockOpened", workspace: "T1", member: alice, feature, at: t.clock.now(), ...(byLaunch && { byLaunch }) });

    await t.run((ctx) => ctx.publish(opened("book", true)));
    await t.run((ctx) => ctx.publish(opened("quests")));

    expect((await t.settle()).ran).toEqual([]);
  });

  waitsOn(["S5", "S6"], "is told the tiers earned before it opened, in one summary", async () => {
    const t = backend();
    const [alice] = await withTheBook(t, "U_ALICE");
    await earned(t, alice!, bronze);

    const event: UnlockOpenedEvent = { type: "unlockOpened", workspace: "T1", member: alice!, feature: "book", at: t.clock.now() };
    await t.run((ctx) => ctx.publish(event));
    await t.settle();

    expect((await t.seed.all("tierSummaries")).map(({ tiers }) => tiers)).toEqual([[bronze]]);
  });
});

describe("a replayed batch", () => {
  test("tells nobody before it completes, or once it is gone", async () => {
    const t = backend();
    await member(t, "U_ALICE");
    const open = (await t.seed.insert("bookBatches", { workspace: "T1", at: t.clock.now() })) as BatchId;

    await t.run((ctx) => tellBatchSummaries(ctx, { batch: open, cursor: null }));
    await t.run((ctx) => tellBatchSummaries(ctx, { batch: "bookBatches_gone" as BatchId, cursor: null }));

    expect((await t.settle()).ran).toEqual([]);
    expect(await t.seed.all("tierSummaries")).toEqual([]);
    expect(t.slack.calls).toEqual([]);
  });

  waitsOn(["S5", "S6", "S17"], "tells each member the tiers it earned them once, even when the walk restarts from the first page", async () => {
    const t = backend();
    const [alice] = await withTheBook(t, "U_ALICE");
    await t.time.advance(hourMs);
    const batch = (await t.seed.insert("bookBatches", { workspace: "T1", at: t.clock.now() - 1, completedAt: t.clock.now() })) as BatchId;
    await earned(t, alice!, bronze, batch);

    await t.run((ctx) => tellBatchSummaries(ctx, { batch, cursor: null }));
    await t.run((ctx) => tellBatchSummaries(ctx, { batch, cursor: null }));
    await t.settle();

    expect((await t.seed.all("tierSummaries")).map(({ tiers, batch: told }) => ({ tiers, batch: told }))).toEqual([{ tiers: [bronze], batch }]);
    expect(t.slack.callsTo("chat.postMessage")).toHaveLength(1);
  });

  waitsOn(
    ["S6"],
    "walks the workspace's members a hundred at a time",
    async () => {
      const t = backend();
      for (let index = 0; index < 101; index += 1) await member(t, `U_${String(index).padStart(3, "0")}`);
      const batch = (await t.seed.insert("bookBatches", { workspace: "T1", at: t.clock.now(), completedAt: t.clock.now() })) as BatchId;

      await t.run((ctx) => tellBatchSummaries(ctx, { batch, cursor: null }));
      const [next] = await pendingPages(t);

      expect(next).toEqual({ batch, cursor: expect.any(String) });
      await t.run((ctx) => tellBatchSummaries(ctx, next as { batch: BatchId; cursor: string }));
      expect(await pendingPages(t)).toEqual([next]);
    },
    60_000,
  );
});
