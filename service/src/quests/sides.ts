// The module map's skeleton of convex/quests/sides.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { rewardValidator } from "./journey.ts";
import { feasibleBecauseValidator, hugFeasibleBecauseValidator, questIdValidator, type PoolQuest } from "./pool.ts";
import type { RecognitionFact } from "./recognitions.ts";
import type { WeeklyQuest } from "./step.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const sides: Side[] = ["hug", "kudos"];

export type Side = RecognitionFact["source"];

const sideValidator = z.union([z.literal("hug"), z.literal("kudos")]);

export const questSideDrawValidator = z.strictObject({
  member: zv.id("members"),
  week: z.string(),
  side: sideValidator,
  quest: questIdValidator,
  reward: rewardValidator,
  catalogueVersion: z.string(),
  feasibleBecause: z.union([feasibleBecauseValidator, hugFeasibleBecauseValidator]),
  drawnAt: zv.number(),
});

export async function drawSidesWhenDue(ctx: MutationContext, member: MemberId, at: number): Promise<boolean> {
  throw notPorted("quests.sides.drawSidesWhenDue");
}

export async function awaitsASideDraw(ctx: QueryContext, member: MemberId, at: number): Promise<boolean> {
  throw notPorted("quests.sides.awaitsASideDraw");
}

export type SideQuestOfTheWeek = { quest: WeeklyQuest; pooled: PoolQuest; xp: number; done: number; finished: boolean };

export type KudosQuestFinished = { goal: string; xp: number };

export async function advanceSide(ctx: MutationContext, fact: RecognitionFact): Promise<void> {
  throw notPorted("quests.sides.advanceSide");
}

export async function sideQuestOfTheWeek(ctx: QueryContext, member: MemberId, side: Side, at: number): Promise<SideQuestOfTheWeek | null> {
  throw notPorted("quests.sides.sideQuestOfTheWeek");
}

export async function kudosQuestFinishedBy(ctx: QueryContext, member: MemberId, day: string, message: MessageRef): Promise<KudosQuestFinished[]> {
  throw notPorted("quests.sides.kudosQuestFinishedBy");
}

export async function sideGoalOf(ctx: QueryContext, member: MemberId, { week, slot }: WeeklyQuest): Promise<string | null> {
  throw notPorted("quests.sides.sideGoalOf");
}
