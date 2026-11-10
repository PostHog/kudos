// The module map's skeleton of convex/achievements/tierCoins.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type EarnedTier } from "./tiers.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type TierCoinsBackfilled = { tiers: number; paid: number };

type PayingTier = Pick<EarnedTier, "member" | "tier" | "rewards" | "catalogueVersion">;

export async function payTierCoins(ctx: MutationContext, workspace: string, earned: PayingTier, at: number): Promise<number> {
  throw notPorted("achievements.tierCoins.payTierCoins");
}

export const payTierCoinsPageArgs = z.strictObject({ cursor: z.union([z.string(), z.null()]) });
export async function payTierCoinsPage(ctx: MutationContext, args: z.infer<typeof payTierCoinsPageArgs>): Promise<TierCoinsBackfilled & { isDone: boolean; continueCursor: string }> {
  throw notPorted("achievements.tierCoins.payTierCoinsPage");
}
