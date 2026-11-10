// The module map's skeleton of convex/achievements/tierEmoji.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type EarnedTier } from "./tiers.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type TierEmojiBackfilled = { tiers: number; granted: number };

type GrantingTier = Pick<EarnedTier, "member" | "ladder" | "rewards" | "catalogueVersion">;

export async function grantTierEmoji(ctx: MutationContext, workspace: string, earned: GrantingTier, at: number): Promise<number> {
  throw notPorted("achievements.tierEmoji.grantTierEmoji");
}

export const grantTierEmojiPageArgs = z.strictObject({ cursor: z.union([z.string(), z.null()]) });
export async function grantTierEmojiPage(ctx: MutationContext, args: z.infer<typeof grantTierEmojiPageArgs>): Promise<TierEmojiBackfilled & { isDone: boolean; continueCursor: string }> {
  throw notPorted("achievements.tierEmoji.grantTierEmojiPage");
}
