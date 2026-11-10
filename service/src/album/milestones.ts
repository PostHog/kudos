// The module map's skeleton of convex/album/milestones.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { companyMatchesKeptEventValidator, hoggieDroppedEventValidator } from "../bus/events.ts";
import type { Moved, ProgressRead } from "../quests/progress.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MilestoneId, Step } from "./milestoneCatalogue.ts";
import type { MilestoneTier } from "./records.ts";
import type { PageOwner, TeamPage } from "./teamPages.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type MilestoneAnswer = { id: MilestoneId; count: number; tiers: (Step & { earnedAt: number | null; unlockedAt?: number })[] };

export type ReachedTier = { milestone: MilestoneId; tier: MilestoneTier };

export const membersPerMilestonePage = 25;

export const holdersScannedAMutation = 100;

export const recordMilestonesInWorkspaceArgs = z.strictObject({ workspace: z.string(), cursor: z.union([z.string(), z.null()]) });
export async function recordMilestonesInWorkspace(ctx: MutationContext, args: z.infer<typeof recordMilestonesInWorkspaceArgs>): Promise<null> {
  throw notPorted("album.milestones.recordMilestonesInWorkspace");
}
export const recordMilestonesInWorkspaceJob = mutationJob("album.milestones.recordMilestonesInWorkspace", recordMilestonesInWorkspaceArgs, recordMilestonesInWorkspace);

export const recordMilestonesAfterTheMatchesArgs = z.strictObject({ event: companyMatchesKeptEventValidator });
export async function recordMilestonesAfterTheMatches(ctx: MutationContext, args: z.infer<typeof recordMilestonesAfterTheMatchesArgs>): Promise<null> {
  throw notPorted("album.milestones.recordMilestonesAfterTheMatches");
}
export const recordMilestonesAfterTheMatchesJob = mutationJob("album.milestones.recordMilestonesAfterTheMatches", recordMilestonesAfterTheMatchesArgs, recordMilestonesAfterTheMatches);

export const recordMilestonesOfStickerHoldersArgs = z.strictObject({ workspace: z.string(), after: z.union([zv.id("members"), z.null()]) });
export async function recordMilestonesOfStickerHolders(ctx: MutationContext, args: z.infer<typeof recordMilestonesOfStickerHoldersArgs>): Promise<null> {
  throw notPorted("album.milestones.recordMilestonesOfStickerHolders");
}
export const recordMilestonesOfStickerHoldersJob = mutationJob("album.milestones.recordMilestonesOfStickerHolders", recordMilestonesOfStickerHoldersArgs, recordMilestonesOfStickerHolders);

export const recordMilestonesAfterAHoggieDropArgs = z.strictObject({ event: hoggieDroppedEventValidator });
export async function recordMilestonesAfterAHoggieDrop(ctx: MutationContext, args: z.infer<typeof recordMilestonesAfterAHoggieDropArgs>): Promise<null> {
  throw notPorted("album.milestones.recordMilestonesAfterAHoggieDrop");
}
export const recordMilestonesAfterAHoggieDropJob = mutationJob("album.milestones.recordMilestonesAfterAHoggieDrop", recordMilestonesAfterAHoggieDropArgs, recordMilestonesAfterAHoggieDrop);

export async function milestonesOf(ctx: QueryContext, owner: PageOwner, pages: TeamPage[]): Promise<MilestoneAnswer[]> {
  throw notPorted("album.milestones.milestonesOf");
}

export function recordMilestonesOf(ctx: MutationContext, owner: PageOwner, at: number): Promise<ReachedTier[]> {
  throw notPorted("album.milestones.recordMilestonesOf");
}

export async function tiersEarnedBy(ctx: QueryContext, member: MemberId): Promise<ReachedTier[]> {
  throw notPorted("album.milestones.tiersEarnedBy");
}

export async function kudosGivenMovedSince(ctx: QueryContext, member: MemberId, { since, until, mostAwards }: ProgressRead): Promise<Moved[]> {
  throw notPorted("album.milestones.kudosGivenMovedSince");
}
