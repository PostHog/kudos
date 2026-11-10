// The module map's skeleton of convex/quests/finish.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Reward } from "./journey.ts";
import type { QuestId } from "./pool.ts";
import type { Quest } from "./step.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type PromisedReward = { reward: Reward; catalogueVersion: string; poolQuest?: QuestId };

export async function finishMondayQuest(ctx: MutationContext, workspace: string, member: MemberId, quest: Quest, { reward, catalogueVersion, poolQuest }: PromisedReward, at: number, cause?: MessageRef): Promise<boolean> {
  throw notPorted("quests.finish.finishMondayQuest");
}
