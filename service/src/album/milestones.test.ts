// The album's milestones over the service: each tier earned once with its item, the hoggies tier dated by the find that
// reached it, and the backfills that walk a workspace's members by the directory's cursor and then every sticker
// holder by the album's own index, a job a page.
//
// The directory's pages and chat users (S3), the hoggie collection (S10), team pages (S10), the tier items (S8) and the
// given messages (S4) are still stubs in the module map. Here they read a world the test gives, through the map's own
// signatures, so this file proves the album's side today. The faithful port of convex/album/milestones.test.ts waits on
// those stacks. The backfills run as the worker runs them: one job enqueued, and each job enqueues the next.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/service.ts";
import type { MutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { milestoneCatalogue } from "./milestoneCatalogue.ts";
import {
  holdersScannedAMutation,
  kudosGivenMovedSince,
  membersPerMilestonePage,
  milestonesOf,
  recordMilestonesAfterAHoggieDrop,
  recordMilestonesInWorkspaceJob,
  recordMilestonesOf,
  recordMilestonesOfStickerHolders,
  recordMilestonesOfStickerHoldersJob,
  tiersEarnedBy,
} from "./milestones.ts";
import { anEmptyWeek } from "./tallies.ts";

const world = vi.hoisted(() => ({
  members: [] as Array<{ member: string; workspace: string }>,
  hoggieFinds: new Map<string, number[]>(),
  pages: new Map<string, Array<{ state: string; held: number }>>(),
  pagesRead: [] as string[],
  items: [] as Array<{ member: string; milestone: string; tier: string; at: number }>,
  given: null as null | Array<{ created: number; awards: Array<{ award: string }>; annotations: Record<string, unknown> }>,
  // The directory's cursors are opaque, as Convex's are: each names where its page ended, and a made-up one is refused.
  cursors: new Map<string, number>(),
  cursorsRead: [] as Array<string | null>,
}));

vi.mock("../workspace/directory.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspace/directory.ts")>()),
  membersPageIn: async (_ctx: unknown, workspace: string, cursor: string | null, numItems: number) => {
    world.cursorsRead.push(cursor);
    const members = world.members.filter((each) => each.workspace === workspace).map(({ member }) => member);
    const from = cursor === null ? 0 : world.cursors.get(cursor);
    if (from === undefined) throw new Error(`The directory never gave the cursor ${cursor}`);
    const to = from + numItems;
    if (to >= members.length) return { members: members.slice(from), continueCursor: null };
    const next = `opaque-${world.cursors.size + 1}-${Math.random().toString(36).slice(2)}`;
    world.cursors.set(next, to);
    return { members: members.slice(from, to), continueCursor: next };
  },
  chatUserOf: async (_ctx: unknown, member: string) => {
    const found = world.members.find((each) => each.member === member);
    if (!found) throw new Error(`No member ${member}`);
    return { workspace: found.workspace, user: `U_${member}` };
  },
}));

vi.mock("./hoggies/collection.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hoggies/collection.ts")>()),
  collectionOf: async (_ctx: unknown, member: string) => ({
    rarities: [],
    hoggies: (world.hoggieFinds.get(member) ?? []).map((firstAt, index) => ({ slug: `h${index}`, count: 1, firstAt })),
    owned: 0,
    total: 0,
  }),
}));

vi.mock("./teamPages.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./teamPages.ts")>()),
  teamPagesOf: async (_ctx: unknown, { member }: { member: string }) => {
    world.pagesRead.push(member);
    return world.pages.get(member) ?? [];
  },
}));

vi.mock("./items/achievements.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./items/achievements.ts")>()),
  earnTierItem: async (_ctx: unknown, { member }: { member: string }, { milestone, tier }: { milestone: string; tier: string }, at: number) => {
    world.items.push({ member, milestone, tier, at });
  },
}));

vi.mock("../engine/awards.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/awards.ts")>()),
  messagesGivenDecidedAfter: async () => world.given,
}));

const start = Date.parse("2026-10-13T10:00:00Z");
const minute = 60_000;
const alice = "m_alice" as MemberId;
const bob = "m_bob" as MemberId;

const backend = useTestBackend({ now: start });
let t: TestBackend;

beforeEach(() => {
  t = backend();
  world.members.length = 0;
  world.hoggieFinds.clear();
  world.pages.clear();
  world.pagesRead.length = 0;
  world.items.length = 0;
  world.given = null;
  world.cursors.clear();
  world.cursorsRead.length = 0;
});

describe("a tier is earned once, with its item", () => {
  test("a first thoughtful kudos and a first face earn their bronze tiers, each item given at the moment", async () => {
    member(alice, "T1");
    await gaveThoughtfully(alice, 1);
    await holds(alice, bob);

    const reached = await mutation((ctx) => recordMilestonesOf(ctx, { workspace: "T1", member: alice }, start));

    expect(reached).toEqual([
      { milestone: "people", tier: "bronze" },
      { milestone: "thoughtful", tier: "bronze" },
    ]);
    expect(world.items).toEqual([
      { member: alice, milestone: "people", tier: "bronze", at: start },
      { member: alice, milestone: "thoughtful", tier: "bronze", at: start },
    ]);
    expect(await mutation((ctx) => recordMilestonesOf(ctx, { workspace: "T1", member: alice }, start + minute)), "a second run earns nothing").toEqual([]);
    expect(await t.seed.all("milestoneTiers")).toHaveLength(2);
  });

  test("the hoggies tier is dated by the find that reached it, and the people tiers read the team pages only when someone is held", async () => {
    member(alice, "T1");
    const finds = Array.from({ length: 12 }, (_, index) => start - (12 - index) * minute);
    world.hoggieFinds.set(alice, finds.toReversed());

    await mutation((ctx) => recordMilestonesOf(ctx, { workspace: "T1", member: alice }, start));

    expect(await t.seed.all("milestoneTiers")).toEqual([expect.objectContaining({ member: alice, milestone: "hoggies", tier: "bronze", at: finds[9], catalogue: milestoneCatalogue.version })]);
    expect(world.pagesRead, "nobody held, so no team page is read").toEqual([]);
  });

  test("full team pages and pages with someone held count for teams and reach", async () => {
    member(alice, "T1");
    await holds(alice, bob);
    world.pages.set(alice, [
      { state: "unlocked", held: 3 },
      { state: "locked", held: 1 },
      { state: "locked", held: 1 },
    ]);

    await mutation((ctx) => recordMilestonesOf(ctx, { workspace: "T1", member: alice }, start));

    expect(await query((ctx) => tiersEarnedBy(ctx, alice))).toEqual([
      { milestone: "people", tier: "bronze" },
      { milestone: "teams", tier: "bronze" },
      { milestone: "reach", tier: "bronze" },
    ]);
    const answer = await query((ctx) => milestonesOf(ctx, { workspace: "T1", member: alice }, []));
    expect(answer.find(({ id }) => id === "people")).toMatchObject({ count: 1, tiers: [expect.objectContaining({ tier: "bronze", earnedAt: start }), expect.objectContaining({ tier: "silver", earnedAt: null }), expect.anything(), expect.anything()] });
    expect(answer.find(({ id }) => id === "teams"), "milestonesOf counts the pages it is given").toMatchObject({ count: 0 });
  });

  test("a hoggie drop records the dropped member's milestones at the drop", async () => {
    member(alice, "T1");
    world.hoggieFinds.set(alice, Array.from({ length: 10 }, (_, index) => start - index * minute));

    await mutation((ctx) => recordMilestonesAfterAHoggieDrop(ctx, { event: { type: "hoggieDropped", workspace: "T1", member: alice, crate: "quest:1", hoggie: "h1", rarity: "common", copy: 1, at: start + minute } }));

    expect(world.items).toEqual([{ member: alice, milestone: "hoggies", tier: "bronze", at: start + minute }]);
  });
});

describe("the backfills walk by cursor, a job a page", () => {
  test(`members go ${membersPerMilestonePage} a job by the directory's cursor, sticker holders are left for the holders' walk, which follows once`, async () => {
    const crowd = Array.from({ length: membersPerMilestonePage + 5 }, (_, index) => `m_${String(index).padStart(2, "0")}` as MemberId);
    for (const each of crowd) {
      member(each, "T1");
      await gaveThoughtfully(each, 1);
    }
    await holds(crowd[0]!, crowd[1]!);

    await enqueue(recordMilestonesInWorkspaceJob, { workspace: "T1", cursor: null });
    const { ran } = await t.settle();

    expect(ran.filter((name) => name === recordMilestonesInWorkspaceJob.name), "two pages of members").toHaveLength(2);
    expect(world.cursorsRead, "the second job reads on from the cursor the directory gave").toEqual([null, [...world.cursors.keys()][0]]);
    expect(ran.filter((name) => name === recordMilestonesOfStickerHoldersJob.name), "the holders' walk follows once: the holder, then the end").toHaveLength(2);
    const tiered = new Set((await t.seed.all("milestoneTiers")).map(({ member }) => member));
    expect(tiered, "everyone, the sticker holder by the holders' walk").toEqual(new Set(crowd));
    expect(world.pagesRead, "only the holders' walk reads team pages, for the holder").toEqual([crowd[0]]);
  });

  test("restarted from its start, as recovery restarts it, the workspace walk earns nothing twice", async () => {
    const crowd = Array.from({ length: membersPerMilestonePage + 5 }, (_, index) => `m_${String(index).padStart(2, "0")}` as MemberId);
    for (const each of crowd) {
      member(each, "T1");
      await gaveThoughtfully(each, 1);
    }
    await holds(crowd[0]!, crowd[1]!);
    await enqueue(recordMilestonesInWorkspaceJob, { workspace: "T1", cursor: null });
    await t.settle();
    const tiers = await t.seed.all("milestoneTiers");
    const items = [...world.items];

    await enqueue(recordMilestonesInWorkspaceJob, { workspace: "T1", cursor: null });
    await t.settle();

    expect(await t.seed.all("milestoneTiers")).toEqual(tiers);
    expect(world.items).toEqual(items);
  });

  test("the holders' walk records one holder of the workspace a job, in member order, skipping other workspaces, and ends", async () => {
    for (const [each, workspace] of [["m_a", "T1"], ["m_b", "T2"], ["m_c", "T1"]] as const) {
      member(each as MemberId, workspace);
      await holds(each as MemberId, bob);
    }

    await enqueue(recordMilestonesOfStickerHoldersJob, { workspace: "T1", after: null });
    const { ran } = await t.settle();

    expect(world.items.map(({ member }) => member)).toEqual(["m_a", "m_c"]);
    expect(ran.filter((name) => name === recordMilestonesOfStickerHoldersJob.name), "one job a holder, then the end").toHaveLength(3);
  });

  test(`a job scans at most ${holdersScannedAMutation} holders of other workspaces, then hands on where it stopped, and the next job goes on from there`, async () => {
    const others = Array.from({ length: holdersScannedAMutation + 1 }, (_, index) => `m_${String(index).padStart(3, "0")}` as MemberId);
    for (const each of others) {
      member(each, "T2");
      await holds(each, bob);
    }

    await mutation((ctx) => recordMilestonesOfStickerHolders(ctx, { workspace: "T1", after: null }));

    expect(world.items).toEqual([]);
    expect(await pending()).toEqual([{ name: "album.milestones.recordMilestonesOfStickerHolders", args: { workspace: "T1", after: others[holdersScannedAMutation - 1] } }]);

    member("m_t1" as MemberId, "T1");
    await holds("m_t1" as MemberId, bob);
    await t.settle();
    expect(world.items.map(({ member }) => member), "the next job takes over where it stopped and finds the workspace's holder").toEqual(["m_t1"]);
  });
});

describe("thoughtful progress since a moment", () => {
  test("counts the tallied awards decided since, up to the next step, from what was given before", async () => {
    await gaveThoughtfully(alice, 3);
    await t.seed.insert("talliedAwards", { award: "a1", everyKudos: true });
    await t.seed.insert("talliedAwards", { award: "a2" });
    world.given = [
      { created: start - minute, awards: [{ award: "a1" }], annotations: {} },
      { created: start + minute, awards: [{ award: "a2" }], annotations: { gate: { version: 1, thoughtful: true, words: 6 } } },
      { created: start, awards: [{ award: "a3" }], annotations: {} },
    ];

    const moved = await query((ctx) => kudosGivenMovedSince(ctx, alice, { since: start - 2 * minute, until: start, mostAwards: 50 }));

    expect(moved, "two of three given count; the one after `until` doesn't move it yet").toEqual([{ name: "Generous soul", from: 1, to: 2, of: 25 }]);
  });

  test("nothing given since moves nothing", async () => {
    expect(await query((ctx) => kudosGivenMovedSince(ctx, alice, { since: start, until: start, mostAwards: 50 }))).toEqual([]);
  });
});

function member(member: MemberId, workspace: string) {
  world.members.push({ member, workspace });
}

async function gaveThoughtfully(member: MemberId, awards: number) {
  await t.seed.insert("weekTallies", { member, week: "2026-10-12", ...anEmptyWeek(), thoughtfulGiven: awards });
}

async function holds(member: MemberId, person: MemberId) {
  await t.seed.insert("albumStickers", { member, person, from: "history", at: start - minute });
}

function mutation<T>(handler: (ctx: MutationContext) => Promise<T>): Promise<T> {
  return t.run(handler);
}

function query<T>(handler: (ctx: QueryContext) => Promise<T>): Promise<T> {
  return t.query(handler);
}

function enqueue<Args, Input>(job: MutationJob<Args, Input>, args: Input) {
  return mutation((ctx) => ctx.jobs.enqueue(job, args));
}

async function pending() {
  return t.query(async ({ tx }) => {
    const rows = await tx.select().from(jobs).where(eq(jobs.state, "pending"));
    return rows.map((row) => toDocument<{ name: string; args: unknown; _creationTime: number }>(jobs, row)).toSorted((a, b) => a._creationTime - b._creationTime).map(({ name, args }) => ({ name, args }));
  });
}

