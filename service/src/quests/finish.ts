// Finishing a Monday-path quest: recorded once, then announced on the bus, which pays its reward.
// Today's convex/quests/finish.ts over the service's transaction.
import type { QuestFinishedEvent } from "../bus/events.ts";
import { rewardKeyOf } from "./crates.ts";
import { recordQuestFinish } from "./finishes.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Reward } from "./journey.ts";
import type { QuestId } from "./pool.ts";
import type { Quest } from "./step.ts";
import type { MutationContext } from "../operations.ts";

export type PromisedReward = { reward: Reward; catalogueVersion: string; poolQuest?: QuestId };

export async function finishMondayQuest(ctx: MutationContext, workspace: string, member: MemberId, quest: Quest, { reward, catalogueVersion, poolQuest }: PromisedReward, at: number, cause?: MessageRef): Promise<boolean> {
  const rewardKey = rewardKeyOf(quest);
  const recorded = await recordQuestFinish(ctx, { member, key: rewardKey, xp: reward.xp, catalogueVersion, at, ...(cause && { cause }) });
  if (recorded === "already recorded") return false;
  const finished: QuestFinishedEvent = { type: "questFinished", workspace, member, quest, ...(poolQuest === undefined ? {} : { poolQuest }), rewardKey, reward: { xp: reward.xp, coins: 0 }, catalogueVersion, at, ...(cause && { cause }) };
  await ctx.publish(finished);
  return true;
}
