// The module map's skeleton of convex/progression/rewards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Page } from "../db/page.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const rewardRecordValidator = z.strictObject({
  member: zv.id("members"),
  key: z.string(),
  xp: zv.number(),
  coins: zv.number(),
  item: z.union([z.string(), z.null()]),
  catalogueVersion: z.string(),
  at: zv.number(),
  cause: z.optional(messageRefValidator),
  held: z.optional(z.literal(true)),
});

export type RewardRecord = z.infer<typeof rewardRecordValidator>;

const standingWithCoinsValidator = z.strictObject({ xp: zv.number(), level: zv.number(), coins: zv.number(), skillPoints: zv.number() });

export const appliedRewardValidator = z.strictObject({ xp: zv.number(), coins: zv.number(), from: standingWithCoinsValidator, to: standingWithCoinsValidator });

export type AppliedReward = z.infer<typeof appliedRewardValidator>;

export type StandingWithCoins = AppliedReward["from"];

export async function insertReward(ctx: MutationContext, reward: RewardRecord): Promise<void> {
  throw notPorted("progression.rewards.insertReward");
}

export function rewardOf(ctx: QueryContext, member: MemberId, key: string): Promise<null | Doc<"rewardRecords">> {
  throw notPorted("progression.rewards.rewardOf");
}

export function rewardsPage(ctx: QueryContext, cursor: string | null, numItems: number): Promise<Page<Doc<"rewardRecords">>> {
  throw notPorted("progression.rewards.rewardsPage");
}

export function rewardsKeyedFrom(ctx: QueryContext, member: MemberId, keyPrefix: string): Promise<Doc<"rewardRecords">[]> {
  throw notPorted("progression.rewards.rewardsKeyedFrom");
}

export function rewardsCausedBy(ctx: QueryContext, member: MemberId, { workspace, conversation, message }: MessageRef): Promise<Doc<"rewardRecords">[]> {
  throw notPorted("progression.rewards.rewardsCausedBy");
}
