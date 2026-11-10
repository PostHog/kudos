// The module map's skeleton of convex/quests/weekly.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { KudosGivenEvent } from "../bus/events.ts";
import { awardIdValidator } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import { rewardValidator } from "./journey.ts";
import { isPaidOnTheMondayPath } from "./mondayCatalogue.ts";
import { feasibleBecauseValidator, questIdValidator } from "./pool.ts";
import type { Moved, MovedQuest, ProgressRead } from "./progress.ts";
import type { WeeklyQuest } from "./step.ts";
import type { WeekKey } from "./week.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

const slotValidator = z.strictObject({
  slot: zv.number(),
  quest: questIdValidator,
  reward: rewardValidator,
  catalogueVersion: z.string(),
  feasibleBecause: feasibleBecauseValidator,
});

export const questDrawValidator = z.strictObject({ member: zv.id("members"), week: z.string(), drawnAt: zv.number(), slots: z.array(slotValidator) });

export const questProgressValidator = z.strictObject({
  member: zv.id("members"),
  week: z.string(),
  slot: zv.number(),
  quest: questIdValidator,
  award: awardIdValidator,
  recipient: zv.id("members"),
  day: z.string(),
  at: zv.number(),
});

type Slot = z.infer<typeof slotValidator>;

export type WeeklySlot = Slot & { goal: string; progress: number; target: number; finishedAt: number | null };

export type DrawnWeek = Omit<WeeklyQuests, "slots"> & { slots: Array<WeeklySlot & { crate: WeeklyQuest }> };

type WeeklyQuests = { week: WeekKey; drawnAt: number; slots: WeeklySlot[] };

export type FinishedWeeklyQuest = { crate: WeeklyQuest; goal: string; reward: Slot["reward"] };

export type AdvancedWeeklyQuests = { finished: FinishedWeeklyQuest[]; moved: MovedQuest[] };

export async function advanceWeeklyQuests(ctx: MutationContext, event: KudosGivenEvent): Promise<AdvancedWeeklyQuests> {
  throw notPorted("quests.weekly.advanceWeeklyQuests");
}

export const drawNewWeekArgs = z.strictObject({ member: zv.id("members") });
export async function drawNewWeek(ctx: MutationContext, args: z.infer<typeof drawNewWeekArgs>): Promise<void> {
  throw notPorted("quests.weekly.drawNewWeek");
}
export const drawNewWeekJob = mutationJob("quests.weekly.drawNewWeek", drawNewWeekArgs, drawNewWeek);

export async function thisWeeksQuestsOf(ctx: MutationContext, member: MemberId, at: number): Promise<WeeklyQuests | null> {
  throw notPorted("quests.weekly.thisWeeksQuestsOf");
}

export async function awaitsThisWeeksDraw(ctx: QueryContext, { _id: member, timeZone }: Doc<"members">, at: number): Promise<boolean> {
  throw notPorted("quests.weekly.awaitsThisWeeksDraw");
}

export async function weeklyQuestsOf(ctx: QueryContext, member: MemberId, at: number): Promise<WeeklyQuests | null> {
  throw notPorted("quests.weekly.weeklyQuestsOf");
}

export async function mondayQuestsMovedSince(ctx: QueryContext, member: MemberId, { since, until, mostAwards }: ProgressRead): Promise<Moved[]> {
  throw notPorted("quests.weekly.mondayQuestsMovedSince");
}

export async function drawnWeekOf(ctx: QueryContext, member: MemberId, at: number): Promise<DrawnWeek | null> {
  throw notPorted("quests.weekly.drawnWeekOf");
}

export async function weeklyGoalOf(ctx: QueryContext, member: MemberId, { week, slot }: WeeklyQuest): Promise<string> {
  throw notPorted("quests.weekly.weeklyGoalOf");
}

export function isMondayDraw({ slots }: { slots: Array<{ catalogueVersion: string }> }): boolean {
  return slots.some(isPaidOnTheMondayPath);
}
