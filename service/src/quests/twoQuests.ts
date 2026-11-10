// The week's two quests under two-quests, the hug side first: each side's onboarding step while it is unfinished (the
// hug ladder, the kudos journey), then that side's quest drawn for the week, the first unfinished one marked next.
// Today's convex/quests/twoQuests.ts over the service's transaction.
import type { MemberId } from "../workspace/directory.ts";
import { hugLadderReward, hugLadderTargetOf, hugsOnTheLadderOf, nextHugLadderStepOf } from "./hugLadder.ts";
import { journeyGoalOf } from "./journeyCopy.ts";
import { nextOnboardingQuestOf, onboardingGoalOf, onboardingQuestFactsOf, onboardingReward, onboardingTargetOf, type OnboardingStep } from "./onboarding.ts";
import { withoutFullStop, type PoolQuest } from "./pool.ts";
import { progressUnitOf, type QuestProgress } from "./progress.ts";
import { sideQuestOfTheWeek, type Side } from "./sides.ts";
import type { Quest } from "./step.ts";
import type { QueryContext } from "../operations.ts";

export type HowTo = "hug" | OnboardingStep;

export type TwoQuestsProgress = { done: number; of: number; unit: QuestProgress["unit"] | "hugs" };

export type TwoQuestsRow = { side: Side; quest: Quest; goal: string; finished: boolean; progress: TwoQuestsProgress; xp: number; howTo: HowTo | null; next: boolean };

type Row = Omit<TwoQuestsRow, "next">;

export async function twoQuestsOf(ctx: QueryContext, member: MemberId, at: number): Promise<TwoQuestsRow[]> {
  const rows = (await Promise.all([hugQuestRowOf(ctx, member, at), kudosQuestRowOf(ctx, member, at)])).filter((row) => row !== null);
  const next = rows.findIndex(({ finished }) => !finished);
  return rows.map((row, index) => ({ ...row, next: index === next }));
}

export async function hugLadderRowOf(ctx: QueryContext, member: MemberId): Promise<TwoQuestsRow | null> {
  const row = await ladderStepRowOf(ctx, member);
  return row === null ? null : { ...row, next: true };
}

async function hugQuestRowOf(ctx: QueryContext, member: MemberId, at: number): Promise<Row | null> {
  return (await ladderStepRowOf(ctx, member)) ?? drawnRowOf(ctx, member, "hug", at);
}

async function ladderStepRowOf(ctx: QueryContext, member: MemberId): Promise<Row | null> {
  const step = await nextHugLadderStepOf(ctx, member);
  if (step === null) return null;
  const target = hugLadderTargetOf(step);
  const progress = { done: Math.min(await hugsOnTheLadderOf(ctx, member), target), of: target, unit: "hugs" as const };
  return { side: "hug", quest: { kind: "journey", step }, goal: journeyGoalOf(step), finished: false, progress, xp: hugLadderReward.xp, howTo: "hug" };
}

async function kudosQuestRowOf(ctx: QueryContext, member: MemberId, at: number): Promise<Row | null> {
  const step = await nextOnboardingQuestOf(ctx, member);
  if (step === null) return drawnRowOf(ctx, member, "kudos", at);
  const { progress } = (await onboardingQuestFactsOf(ctx, member, at))[step];
  const counted = progress ?? { done: 0, of: onboardingTargetOf(step), unit: "kudos" as const };
  return { side: "kudos", quest: { kind: "journey", step }, goal: onboardingGoalOf(step), finished: false, progress: counted, xp: onboardingReward.xp, howTo: step };
}

async function drawnRowOf(ctx: QueryContext, member: MemberId, side: Side, at: number): Promise<Row | null> {
  const drawn = await sideQuestOfTheWeek(ctx, member, side, at);
  if (drawn === null) return null;
  const { quest, pooled, xp, done, finished } = drawn;
  const progress = { done, of: pooled.progress.target, unit: side === "hug" ? hugUnitOf(pooled) : progressUnitOf(pooled) };
  return { side, quest, goal: withoutFullStop(pooled.goal), finished, progress, xp, howTo: side === "hug" ? "hug" : null };
}

function hugUnitOf({ progress: { counts } }: PoolQuest): TwoQuestsProgress["unit"] {
  return counts === "days" ? "days" : "hugs";
}
