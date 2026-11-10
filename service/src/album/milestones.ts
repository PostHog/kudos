// The album's milestones: people, team pages, reach, hoggies and thoughtful kudos, each with tiers a member earns once.
// The backfills walk a workspace's members by the directory's cursor, then every sticker holder by the album's own
// index, a job a page. Today's convex/album/milestones.ts over the service's transaction, the app's clock in place of
// Date.now().
import { eq } from "drizzle-orm";
import { companyMatchesKeptEventValidator, hoggieDroppedEventValidator } from "../bus/events.ts";
import { messagesGivenDecidedAfter, type AnnotatedGivenMessage } from "../engine/awards.ts";
import type { Annotations } from "../engine/messageEvent.ts";
import { saysWhy } from "../progression/gate.ts";
import type { Moved, ProgressRead } from "../quests/progress.ts";
import { chatUserOf, membersPageIn, type MemberId } from "../workspace/directory.ts";
import { collectionOf } from "./hoggies/collection.ts";
import { earnTierItem } from "./items/achievements.ts";
import { milestoneCatalogue, type MilestoneId, type Step } from "./milestoneCatalogue.ts";
import type { MilestoneTier } from "./records.ts";
import { allIn, insertInto } from "./rows.ts";
import { holdsAnySticker, nextStickerHolderAfter, peopleHeldBy } from "./stickers.ts";
import { talliedAwardOf } from "./tallies.ts";
import { teamPagesOf, type PageOwner, type TeamPage } from "./teamPages.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { milestoneTiers, weekTallies, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export type MilestoneAnswer = { id: MilestoneId; count: number; tiers: (Step & { earnedAt: number | null; unlockedAt?: number })[] };

export type ReachedTier = { milestone: MilestoneId; tier: MilestoneTier };

type Counts = Record<MilestoneId, number>;

export const membersPerMilestonePage = 25;

export const holdersScannedAMutation = 100;

export const recordMilestonesInWorkspaceArgs = z.strictObject({ workspace: z.string(), cursor: z.union([z.string(), z.null()]) });
export async function recordMilestonesInWorkspace(ctx: MutationContext, { workspace, cursor }: z.infer<typeof recordMilestonesInWorkspaceArgs>): Promise<null> {
  const { members, continueCursor } = await membersPageIn(ctx, workspace, cursor, membersPerMilestonePage);
  for (const member of members) if (!(await holdsAnySticker(ctx, member))) await recordTiersOf(ctx, { workspace, member }, async () => [], ctx.now);
  if (continueCursor !== null) await ctx.jobs.enqueue(recordMilestonesInWorkspaceJob, { workspace, cursor: continueCursor });
  else await recordStickerHoldersLater(ctx, workspace);
  return null;
}
export const recordMilestonesInWorkspaceJob = mutationJob("album.milestones.recordMilestonesInWorkspace", recordMilestonesInWorkspaceArgs, recordMilestonesInWorkspace);

export const recordMilestonesAfterTheMatchesArgs = z.strictObject({ event: companyMatchesKeptEventValidator });
export async function recordMilestonesAfterTheMatches(ctx: MutationContext, { event }: z.infer<typeof recordMilestonesAfterTheMatchesArgs>): Promise<null> {
  await recordStickerHoldersLater(ctx, event.workspace);
  return null;
}
export const recordMilestonesAfterTheMatchesJob = mutationJob("album.milestones.recordMilestonesAfterTheMatches", recordMilestonesAfterTheMatchesArgs, recordMilestonesAfterTheMatches);

export const recordMilestonesOfStickerHoldersArgs = z.strictObject({ workspace: z.string(), after: z.union([zv.id("members"), z.null()]) });
export async function recordMilestonesOfStickerHolders(ctx: MutationContext, { workspace, after }: z.infer<typeof recordMilestonesOfStickerHoldersArgs>): Promise<null> {
  const holder = await nextHolderIn(ctx, workspace, after);
  if (holder.found !== null) await recordMilestonesOf(ctx, { workspace, member: holder.found }, ctx.now);
  if (holder.last !== null) await ctx.jobs.enqueue(recordMilestonesOfStickerHoldersJob, { workspace, after: holder.last });
  return null;
}
export const recordMilestonesOfStickerHoldersJob = mutationJob("album.milestones.recordMilestonesOfStickerHolders", recordMilestonesOfStickerHoldersArgs, recordMilestonesOfStickerHolders);

export const recordMilestonesAfterAHoggieDropArgs = z.strictObject({ event: hoggieDroppedEventValidator });
export async function recordMilestonesAfterAHoggieDrop(ctx: MutationContext, { event }: z.infer<typeof recordMilestonesAfterAHoggieDropArgs>): Promise<null> {
  await recordMilestonesOf(ctx, { workspace: event.workspace, member: event.member }, event.at);
  return null;
}
export const recordMilestonesAfterAHoggieDropJob = mutationJob("album.milestones.recordMilestonesAfterAHoggieDrop", recordMilestonesAfterAHoggieDropArgs, recordMilestonesAfterAHoggieDrop);

async function recordStickerHoldersLater(ctx: MutationContext, workspace: string) {
  await ctx.jobs.enqueue(recordMilestonesOfStickerHoldersJob, { workspace, after: null });
}

async function nextHolderIn(ctx: QueryContext, workspace: string, after: MemberId | null): Promise<{ found: MemberId | null; last: MemberId | null }> {
  let last = after;
  for (let scanned = 0; scanned < holdersScannedAMutation; scanned += 1) {
    const next = await nextStickerHolderAfter(ctx, last);
    if (next === null) return { found: null, last: null };
    last = next;
    if ((await chatUserOf(ctx, next)).workspace === workspace) return { found: next, last };
  }
  return { found: null, last };
}

export async function milestonesOf(ctx: QueryContext, owner: PageOwner, pages: TeamPage[]): Promise<MilestoneAnswer[]> {
  const counts = await countsOf(ctx, owner.member, async () => pages);
  const earned = await earnedTiersOf(ctx, owner.member);
  return milestoneCatalogue.milestones.map(({ id, steps }) => ({ id, count: counts[id], tiers: steps.map((step) => ({ ...step, earnedAt: earned.get(tierKey(id, step.tier)) ?? null })) }));
}

export function recordMilestonesOf(ctx: MutationContext, owner: PageOwner, at: number): Promise<ReachedTier[]> {
  return recordTiersOf(ctx, owner, () => teamPagesOf(ctx, owner), at);
}

async function recordTiersOf(ctx: MutationContext, owner: PageOwner, pagesOf: () => Promise<TeamPage[]>, at: number): Promise<ReachedTier[]> {
  const { member } = owner;
  const { counts, hoggieFirstFinds } = await factsOf(ctx, member, pagesOf);
  const earned = await earnedTiersOf(ctx, member);
  const reached: ReachedTier[] = [];
  for (const { id, steps } of milestoneCatalogue.milestones) {
    for (const step of steps.filter(({ at: needed, tier }) => counts[id] >= needed && !earned.has(tierKey(id, tier)))) {
      const reachedAt = id === "hoggies" ? (hoggieFirstFinds[step.at - 1] ?? at) : at;
      await insertInto(ctx, milestoneTiers, { member, milestone: id, tier: step.tier, at: reachedAt, catalogue: milestoneCatalogue.version });
      await earnTierItem(ctx, owner, { milestone: id, tier: step.tier }, at);
      reached.push({ milestone: id, tier: step.tier });
    }
  }
  return reached;
}

export async function tiersEarnedBy(ctx: QueryContext, member: MemberId): Promise<ReachedTier[]> {
  const earned = await earnedTiersOf(ctx, member);
  return milestoneCatalogue.milestones.flatMap(({ id, steps }) => steps.filter(({ tier }) => earned.has(tierKey(id, tier))).map(({ tier }) => ({ milestone: id, tier })));
}

export async function kudosGivenMovedSince(ctx: QueryContext, member: MemberId, { since, until, mostAwards }: ProgressRead): Promise<Moved[]> {
  const givenSince = await messagesGivenDecidedAfter(ctx, member, since, mostAwards);
  if (givenSince === null) return [];
  const talliedSince = await countedAwardsIn(ctx, givenSince);
  const from = Math.max((await kudosAwardsGivenBy(ctx, member)) - talliedSince.length, 0);
  const to = from + talliedSince.filter(({ created }) => created <= until).length;
  const next = milestoneCatalogue.milestones.find(({ id }) => id === "thoughtful")!.steps.find((step) => step.at > from);
  return next === undefined || to === from ? [] : [{ name: next.name, from, to: Math.min(to, next.at), of: next.at }];
}

async function countedAwardsIn(ctx: QueryContext, messages: AnnotatedGivenMessage[]): Promise<{ created: number }[]> {
  const awards = messages.flatMap(({ created, awards, annotations }) => awards.map(({ award }) => ({ award, created, annotations })));
  const counted: { created: number }[] = [];
  for (const { award, created, annotations } of awards) if (countedTheMilestone(await talliedAwardOf(ctx, award), annotations)) counted.push({ created });
  return counted;
}

function countedTheMilestone(tallied: Doc<"talliedAwards"> | null, annotations: Annotations): boolean {
  return tallied !== null && (tallied.everyKudos === true || saysWhy(annotations));
}

async function countsOf(ctx: QueryContext, member: MemberId, pagesOf: () => Promise<TeamPage[]>): Promise<Counts> {
  return (await factsOf(ctx, member, pagesOf)).counts;
}

async function factsOf(ctx: QueryContext, member: MemberId, pagesOf: () => Promise<TeamPage[]>): Promise<{ counts: Counts; hoggieFirstFinds: number[] }> {
  const people = (await peopleHeldBy(ctx, member)).size;
  const pages = people === 0 ? [] : await pagesOf();
  const hoggieFirstFinds = (await collectionOf(ctx, member, { crests: false })).hoggies.flatMap(({ count, firstAt }) => (count > 0 && firstAt !== null ? [firstAt] : [])).toSorted((one, other) => one - other);
  return {
    counts: {
      people,
      teams: pages.filter(({ state }) => state === "unlocked").length,
      reach: pages.filter(({ held }) => held > 0).length,
      hoggies: hoggieFirstFinds.length,
      thoughtful: await kudosAwardsGivenBy(ctx, member),
    },
    hoggieFirstFinds,
  };
}

const weeksByMember = indexOrder(weekTallies, ["member", "week"]);
const tiersByMember = indexOrder(milestoneTiers, ["member", "milestone", "tier"]);

async function kudosAwardsGivenBy(ctx: QueryContext, member: MemberId): Promise<number> {
  const weeks = await allIn<Doc<"weekTallies">>(ctx, weekTallies, weeksByMember, eq(weekTallies.member, member));
  return weeks.reduce((sum, { thoughtfulGiven }) => sum + thoughtfulGiven, 0);
}

async function earnedTiersOf(ctx: QueryContext, member: MemberId): Promise<Map<string, number>> {
  const tiers = await allIn<Doc<"milestoneTiers">>(ctx, milestoneTiers, tiersByMember, eq(milestoneTiers.member, member));
  return new Map(tiers.map(({ milestone, tier, at }) => [tierKey(milestone, tier), at]));
}

function tierKey(milestone: MilestoneId, tier: MilestoneTier) {
  return `${milestone}:${tier}`;
}
