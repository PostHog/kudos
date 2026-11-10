// The module map's skeleton of convex/quests/onboarding.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { KudosGivenEvent } from "../bus/events.ts";
import type { MemberId } from "../workspace/directory.ts";
import { rewardKeyOf } from "./crates.ts";
import { type QuestFinish } from "./finishes.ts";
import { type Reward } from "./journey.ts";
import { journeyGoalOf } from "./journeyCopy.ts";
import type { Moved, MovedQuest, ProgressRead, QuestProgress } from "./progress.ts";
import type { JourneyStep } from "./step.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const onboardingSteps = ["first-thanks", "someone-new", "two-days"] as const satisfies readonly JourneyStep[];

export type OnboardingStep = (typeof onboardingSteps)[number];

export const onboardingReward: Reward = { xp: 50, coins: 0, item: null };

const daysToFinishTwoDays = 2;

const onboardingGoals: Record<OnboardingStep, string> = {
  "first-thanks": "Give a kudos to someone",
  "someone-new": "Thank someone new",
  "two-days": "Thank someone on two different days",
};

export type FinishedOnboardingQuest = { step: OnboardingStep; reward: Reward };

export type OnboardingQuest = { step: OnboardingStep; goal: string; finished: boolean; progress: QuestProgress | null };

export type OnboardingQuestFacts = { step: OnboardingStep; finish: QuestFinish | null; progress: QuestProgress | null };

export function onboardingGoalOf(step: OnboardingStep): string {
  return onboardingGoals[step];
}

export function finishedStepGoalOf(step: JourneyStep, paidOnTheMondayPath: boolean): string {
  return paidOnTheMondayPath && isOnboardingStep(step) ? onboardingGoalOf(step) : journeyGoalOf(step);
}

export function onboardingTargetOf(step: OnboardingStep): number {
  return step === "two-days" ? daysToFinishTwoDays : 1;
}

export function isOnboardingStep(step: JourneyStep): step is OnboardingStep {
  return (onboardingSteps as readonly JourneyStep[]).includes(step);
}

export async function nextOnboardingQuestOf(ctx: QueryContext, member: MemberId): Promise<OnboardingStep | null> {
  throw notPorted("quests.onboarding.nextOnboardingQuestOf");
}

export async function onboardingQuestsOf(ctx: QueryContext, member: MemberId, at: number): Promise<OnboardingQuest[]> {
  throw notPorted("quests.onboarding.onboardingQuestsOf");
}

export async function onboardingQuestFactsOf(ctx: QueryContext, member: MemberId, at: number): Promise<Record<OnboardingStep, OnboardingQuestFacts>> {
  throw notPorted("quests.onboarding.onboardingQuestFactsOf");
}

export async function twoDaysMovedSince(ctx: QueryContext, member: MemberId, { since, until, mostAwards }: ProgressRead): Promise<Moved[]> {
  throw notPorted("quests.onboarding.twoDaysMovedSince");
}

export async function onboardingFinishedBy(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("quests.onboarding.onboardingFinishedBy");
}

export async function onboardingFinishedAt(ctx: QueryContext, member: MemberId): Promise<number | null> {
  throw notPorted("quests.onboarding.onboardingFinishedAt");
}

export const onboardingRewardKeys = onboardingSteps.map((step) => rewardKeyOf({ kind: "journey", step }));

export async function advanceOnboarding(ctx: MutationContext, event: KudosGivenEvent): Promise<FinishedOnboardingQuest[]> {
  throw notPorted("quests.onboarding.advanceOnboarding");
}

export async function onboardingMovedBy(ctx: QueryContext, { giver, at }: KudosGivenEvent): Promise<MovedQuest[]> {
  throw notPorted("quests.onboarding.onboardingMovedBy");
}

export async function someoneNewWaitsOnTheMondayPath(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("quests.onboarding.someoneNewWaitsOnTheMondayPath");
}

export async function finishSomeoneNewOnceEveryoneIsThanked(ctx: MutationContext, workspace: string, member: MemberId, at: number): Promise<void> {
  throw notPorted("quests.onboarding.finishSomeoneNewOnceEveryoneIsThanked");
}
