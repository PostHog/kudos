// The module map's skeleton of convex/achievements/tierRewards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ItemId } from "../store/catalogue.ts";
import type { MemberId } from "../workspace/directory.ts";
import { tierOf, type TierRef } from "./ladders.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type RecordedTierReward = { coins: number; item: ItemId | null; recordedAt: number };

export type TierRewardsRecorded = Map<string, RecordedTierReward>;

export type TierRewardsTold = { coins: number; items: ItemId[] };

const tierRewardKeys = "tier:";

export function tierRewardKeyOf(reward: string) {
  return `${tierRewardKeys}${reward}`;
}

export async function tierRewardsRecordedFor(ctx: QueryContext, member: MemberId): Promise<TierRewardsRecorded> {
  throw notPorted("achievements.tierRewards.tierRewardsRecordedFor");
}

export function recordedRewardsOf(ref: TierRef, recorded: TierRewardsRecorded): TierRewardsTold {
  const records = tierOf(ref).rewards.flatMap(({ reward }) => recorded.get(reward) ?? []);
  return { coins: records.reduce((sum, { coins }) => sum + coins, 0), items: records.flatMap(({ item }) => (item === null ? [] : [item])) };
}
