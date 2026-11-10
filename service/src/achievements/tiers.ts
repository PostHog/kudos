// The module map's skeleton of convex/achievements/tiers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { awardIdValidator, type AwardId } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { BatchId } from "./replay.ts";
import { ladderValidator, promisedRewardValidator, tierValidator, type LadderId, type Tier } from "./ladders.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Page } from "../db/page.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const earnedTierValidator = z.strictObject({
  member: zv.id("members"),
  ladder: ladderValidator,
  tier: tierValidator,
  earnedAt: zv.number(),
  award: awardIdValidator,
  catalogueVersion: z.string(),
  rewards: z.array(promisedRewardValidator),
  batch: z.optional(zv.id("bookBatches")),
  hidden: z.optional(z.literal(true)),
});

export type EarnedTier = z.infer<typeof earnedTierValidator>;

export type Reaching = { workspace: string; member: MemberId; ladder: LadderId; award: AwardId; at: number; batch?: BatchId; hidden?: true };

export async function earnTier(ctx: MutationContext, { workspace, member, ladder, award, at, batch, hidden }: Reaching, { tier, rewards }: Tier): Promise<boolean> {
  throw notPorted("achievements.tiers.earnTier");
}

export function everyTierEarnedBy(ctx: QueryContext, member: MemberId): Promise<EarnedTier[]> {
  throw notPorted("achievements.tiers.everyTierEarnedBy");
}

export function earnedTiersPage(ctx: QueryContext, cursor: string | null, numItems: number): Promise<Page<Doc<"earnedTiers">>> {
  throw notPorted("achievements.tiers.earnedTiersPage");
}

export function earnedTiersOf(ctx: QueryContext, member: MemberId, ladder: LadderId): Promise<EarnedTier[]> {
  throw notPorted("achievements.tiers.earnedTiersOf");
}
