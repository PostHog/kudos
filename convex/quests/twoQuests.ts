import type { QueryCtx } from "../_generated/server";
import type { MemberId } from "../workspace/directory";
import { hugLadderReward, hugLadderTargetOf, hugsOnTheLadderOf, nextHugLadderStepOf } from "./hugLadder";
import { journeyGoalOf } from "./journeyCopy";
import { nextOnboardingQuestOf, onboardingGoalOf, onboardingQuestFactsOf, onboardingReward, onboardingTargetOf, type OnboardingStep } from "./onboarding";
import { withoutFullStop, type PoolQuest } from "./pool";
import { progressUnitOf, type QuestProgress } from "./progress";
import { sideQuestOfTheWeek, type Side } from "./sides";
import type { Quest } from "./step";

export type HowTo = "hug" | OnboardingStep;

export type TwoQuestsProgress = { done: number; of: number; unit: QuestProgress["unit"] | "hugs" };

export type TwoQuestsRow = { side: Side; quest: Quest; goal: string; finished: boolean; progress: TwoQuestsProgress; xp: number; howTo: HowTo | null; next: boolean };

type Row = Omit<TwoQuestsRow, "next">;

// The week's quests, the hug side first; the first unfinished row is the member's next quest (HH55).
export async function twoQuestsOf(ctx: QueryCtx, member: MemberId, at: number): Promise<TwoQuestsRow[]> {
  const rows = (await Promise.all([hugQuestRowOf(ctx, member, at), kudosQuestRowOf(ctx, member, at)])).filter((row) => row !== null);
  const next = rows.findIndex(({ finished }) => !finished);
  return rows.map((row, index) => ({ ...row, next: index === next }));
}

export async function hugLadderRowOf(ctx: QueryCtx, member: MemberId): Promise<TwoQuestsRow | null> {
  const row = await ladderStepRowOf(ctx, member);
  return row === null ? null : { ...row, next: true };
}

async function hugQuestRowOf(ctx: QueryCtx, member: MemberId, at: number): Promise<Row | null> {
  return (await ladderStepRowOf(ctx, member)) ?? drawnRowOf(ctx, member, "hug", at);
}

async function ladderStepRowOf(ctx: QueryCtx, member: MemberId): Promise<Row | null> {
  const step = await nextHugLadderStepOf(ctx, member);
  if (step === null) return null;
  const target = hugLadderTargetOf(step);
  const progress = { done: Math.min(await hugsOnTheLadderOf(ctx, member), target), of: target, unit: "hugs" as const };
  return { side: "hug", quest: { kind: "journey", step }, goal: journeyGoalOf(step), finished: false, progress, xp: hugLadderReward.xp, howTo: "hug" };
}

async function kudosQuestRowOf(ctx: QueryCtx, member: MemberId, at: number): Promise<Row | null> {
  const step = await nextOnboardingQuestOf(ctx, member);
  if (step === null) return drawnRowOf(ctx, member, "kudos", at);
  const { progress } = (await onboardingQuestFactsOf(ctx, member, at))[step];
  const counted = progress ?? { done: 0, of: onboardingTargetOf(step), unit: "kudos" as const };
  return { side: "kudos", quest: { kind: "journey", step }, goal: onboardingGoalOf(step), finished: false, progress: counted, xp: onboardingReward.xp, howTo: step };
}

async function drawnRowOf(ctx: QueryCtx, member: MemberId, side: Side, at: number): Promise<Row | null> {
  const drawn = await sideQuestOfTheWeek(ctx, member, side, at);
  if (drawn === null) return null;
  const { quest, pooled, xp, done, finished } = drawn;
  const progress = { done, of: pooled.progress.target, unit: side === "hug" ? hugUnitOf(pooled) : progressUnitOf(pooled) };
  return { side, quest, goal: withoutFullStop(pooled.goal), finished, progress, xp, howTo: side === "hug" ? "hug" : null };
}

function hugUnitOf({ progress: { counts } }: PoolQuest): TwoQuestsProgress["unit"] {
  return counts === "days" ? "days" : "hugs";
}
