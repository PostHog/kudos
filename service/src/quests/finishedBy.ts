// The Monday-path quests a kudos message finished, for its reply. Today's convex/quests/finishedBy.ts.
import { rewardsCausedBy } from "../progression/rewards.ts";
import { journeyQuestOfRewardKey, weeklyQuestOfRewardKey } from "./crates.ts";
import { isPaidOnTheMondayPath } from "./mondayCatalogue.ts";
import { finishedStepGoalOf } from "./onboarding.ts";
import { weeklyGoalOf } from "./weekly.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export type QuestFinishedBy = { kind: "weekly" | "journey"; goal: string; xp: number; hoggie: boolean };

export async function questsFinishedByMessage(ctx: QueryContext, member: MemberId, message: MessageRef): Promise<QuestFinishedBy[]> {
  const finished: QuestFinishedBy[] = [];
  for (const { key, xp } of (await rewardsCausedBy(ctx, member, message)).filter(isPaidOnTheMondayPath)) {
    const weekly = weeklyQuestOfRewardKey(key);
    const journey = journeyQuestOfRewardKey(key);
    if (weekly !== null) finished.push({ kind: "weekly", goal: await weeklyGoalOf(ctx, member, weekly), xp, hoggie: true });
    else if (journey !== null) finished.push({ kind: "journey", goal: finishedStepGoalOf(journey.step, true), xp, hoggie: true });
  }
  return finished;
}
