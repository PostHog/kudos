import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { KudosGivenEvent } from "../bus/events";
import { isSameMessage, type MessageRef } from "../engine/messageEvent";
import { earliestAwardFrom, firstDecidedOf, givenBetween, givenRecordedAfter, givenSinceWithin, messagesGivenDecidedAfter, type AwardId, type DatedAward, type GivenKudos } from "../engine/awards";
import { progressionWaitedFor } from "../progression/effects";
import type { MemberId } from "../workspace/directory";
import { rewardKeyOf } from "./crates";
import { finishMondayQuest } from "./finish";
import { questFinishOf, type QuestFinish } from "./finishes";
import { hasThankedEveryone, type Reward } from "./journey";
import { journeyGoalOf } from "./journeyCopy";
import { questsJudgedFor } from "./judged";
import { isPaidOnTheMondayPath, mondayCatalogueVersion } from "./mondayCatalogue";
import type { Moved, MovedQuest, ProgressRead, QuestProgress } from "./progress";
import { questStartOf } from "./start";
import type { JourneyStep } from "./step";

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

export async function nextOnboardingQuestOf(ctx: QueryCtx, member: MemberId): Promise<OnboardingStep | null> {
  for (const step of onboardingSteps) if ((await finishOf(ctx, member, step)) === null) return step;
  return null;
}

export async function onboardingQuestsOf(ctx: QueryCtx, member: MemberId, at: number): Promise<OnboardingQuest[]> {
  const facts = await onboardingQuestFactsOf(ctx, member, at);
  return onboardingSteps.map((step) => {
    const { finish, progress } = facts[step];
    return { step, goal: onboardingGoalOf(step), finished: finish !== null, progress };
  });
}

export async function onboardingQuestFactsOf(ctx: QueryCtx, member: MemberId, at: number): Promise<Record<OnboardingStep, OnboardingQuestFacts>> {
  return {
    "first-thanks": { step: "first-thanks", finish: await finishOf(ctx, member, "first-thanks"), progress: null },
    "someone-new": { step: "someone-new", finish: await finishOf(ctx, member, "someone-new"), progress: null },
    "two-days": await twoDaysFactsOf(ctx, member, at),
  };
}

export async function twoDaysMovedSince(ctx: QueryCtx, member: MemberId, { since, until, mostAwards }: ProgressRead): Promise<Moved[]> {
  const start = await questStartOf(ctx, member);
  if (start === null || (await twoDaysFinishedBy(ctx, member, since))) return [];
  const givenSinceTheStart = await givenSinceWithin(ctx, member, start, mostAwards);
  const decidedSince = await messagesGivenDecidedAfter(ctx, member, since, mostAwards);
  if (givenSinceTheStart === null || decidedSince === null) return [];
  const decidedAfter = (instant: number) => new Set<AwardId>(decidedSince.filter(({ created }) => created > instant).flatMap(({ awards }) => awards.map(({ award }) => award)));
  const decidedBy = (instant: number) => {
    const later = decidedAfter(instant);
    return givenSinceTheStart.filter(({ award }) => !later.has(award));
  };
  const from = daysAmong(decidedBy(since));
  const to = daysAmong(decidedBy(until));
  return from < to && to < daysToFinishTwoDays ? [{ name: onboardingGoalOf("two-days"), from, to, of: daysToFinishTwoDays }] : [];
}

async function twoDaysFactsOf(ctx: QueryCtx, member: MemberId, at: number): Promise<OnboardingQuestFacts> {
  const finish = await finishOf(ctx, member, "two-days");
  const progress = finish === null ? { done: await daysThankingOf(ctx, member, at), of: daysToFinishTwoDays, unit: "days" as const } : null;
  return { step: "two-days", finish, progress };
}

async function daysThankingOf(ctx: QueryCtx, member: MemberId, at: number): Promise<number> {
  const start = await questStartOf(ctx, member);
  if (start === null) return 0;
  return daysAmong(await givenBetween(ctx, member, start, at));
}

function daysAmong(given: DatedAward[]): number {
  return Math.min(new Set(given.map(({ day }) => day)).size, daysToFinishTwoDays);
}

export async function onboardingFinishedBy(ctx: QueryCtx, member: MemberId): Promise<boolean> {
  return (await onboardingFinishedAt(ctx, member)) !== null;
}

export async function onboardingFinishedAt(ctx: QueryCtx, member: MemberId): Promise<number | null> {
  let finishedAt = 0;
  for (const step of onboardingSteps) {
    const finish = await finishOf(ctx, member, step);
    if (finish === null) return null;
    finishedAt = Math.max(finishedAt, finish.at);
  }
  return finishedAt;
}

export const onboardingRewardKeys = onboardingSteps.map((step) => rewardKeyOf({ kind: "journey", step }));

export async function advanceOnboarding(ctx: MutationCtx, event: KudosGivenEvent): Promise<FinishedOnboardingQuest[]> {
  const start = await questStartOf(ctx, event.giver);
  if (start === null || event.at < start) return [];
  await advanceFirstThanks(ctx, event, start);
  await advanceSomeoneNew(ctx, event);
  await advanceTwoDays(ctx, event, start);
  return onboardingFinishedFor(ctx, event);
}

async function onboardingFinishedFor(ctx: QueryCtx, { giver, message }: KudosGivenEvent): Promise<FinishedOnboardingQuest[]> {
  const finished: FinishedOnboardingQuest[] = [];
  for (const step of onboardingSteps) {
    const finish = await finishOf(ctx, giver, step);
    if (finish?.cause !== undefined && isPaidOnTheMondayPath(finish) && isSameMessage(finish.cause, message)) finished.push({ step, reward: onboardingReward });
  }
  return finished;
}

export async function onboardingMovedBy(ctx: QueryCtx, { giver, at }: KudosGivenEvent): Promise<MovedQuest[]> {
  const before = (await twoDaysFactsOf(ctx, giver, at - 1)).progress;
  const after = (await twoDaysFactsOf(ctx, giver, at)).progress;
  return before !== null && after !== null && after.done > before.done ? [{ goal: onboardingGoalOf("two-days"), progress: after }] : [];
}

export async function someoneNewWaitsOnTheMondayPath(ctx: QueryCtx, member: MemberId): Promise<boolean> {
  return (await questStartOf(ctx, member)) !== null && (await finishOf(ctx, member, "someone-new")) === null;
}

export async function finishSomeoneNewOnceEveryoneIsThanked(ctx: MutationCtx, workspace: string, member: MemberId, at: number): Promise<void> {
  const start = await questStartOf(ctx, member);
  if (start === null || at < start || (await finishOf(ctx, member, "someone-new")) !== null || !(await firstThanksCameBefore(ctx, member, start, at))) return;
  if (await hasThankedEveryone(ctx, workspace, member, at)) await finished(ctx, workspace, member, "someone-new", at);
}

async function firstThanksCameBefore(ctx: QueryCtx, member: MemberId, start: number, at: number): Promise<boolean> {
  const firstThanks = await finishOf(ctx, member, "first-thanks");
  if (firstThanks !== null) return firstThanks.at < at;
  return (await givenBetween(ctx, member, start, at - 1)).length > 0;
}

async function advanceFirstThanks(ctx: MutationCtx, event: KudosGivenEvent, start: number): Promise<void> {
  if ((await finishOf(ctx, event.giver, "first-thanks")) !== null) return;
  const earliest = (await earliestKudosAwaitingQuests(ctx, event, start)) ?? event;
  await finished(ctx, event.workspace, event.giver, "first-thanks", earliest.at, earliest.message);
}

async function earliestKudosAwaitingQuests(ctx: QueryCtx, event: KudosGivenEvent, start: number): Promise<GivenKudos | null> {
  const recent = await givenRecordedAfter(ctx, event.giver, (await recordedAtOf(ctx, event)) - progressionWaitedFor);
  for (const kudos of recent.filter(({ at }) => at >= start && at <= event.at).toSorted((one, other) => one.at - other.at)) {
    if (!(await questsJudgedFor(ctx, [kudos]))) return kudos;
  }
  return null;
}

async function advanceSomeoneNew(ctx: MutationCtx, event: KudosGivenEvent): Promise<void> {
  if ((await finishOf(ctx, event.giver, "someone-new")) !== null || !(await firstThanksPaidForAnotherMessage(ctx, event))) return;
  const someoneNew = (await thanksSomeoneNew(ctx, event)) || (await hasThankedEveryone(ctx, event.workspace, event.giver, event.at));
  if (someoneNew) await finished(ctx, event.workspace, event.giver, "someone-new", event.at, event.message);
}

async function firstThanksPaidForAnotherMessage(ctx: QueryCtx, { giver, message }: KudosGivenEvent): Promise<boolean> {
  const firstThanks = await finishOf(ctx, giver, "first-thanks");
  return firstThanks !== null && (firstThanks.cause === undefined || !isSameMessage(firstThanks.cause, message));
}

async function thanksSomeoneNew(ctx: QueryCtx, { giver, awards }: KudosGivenEvent): Promise<boolean> {
  for (const { award, recipient } of awards) if ((await earliestAwardFrom(ctx, giver, recipient))?.award === award) return true;
  return false;
}

async function advanceTwoDays(ctx: MutationCtx, event: KudosGivenEvent, start: number): Promise<void> {
  if ((await finishOf(ctx, event.giver, "two-days")) !== null) return;
  const recorded = await recordedAtOf(ctx, event);
  const given = (await givenBetween(ctx, event.giver, start, Infinity)).filter(({ at, created }) => at <= event.at || created < recorded);
  const reachedAt = whenTheSecondDayCame([...given, event]);
  if (reachedAt !== null) await finished(ctx, event.workspace, event.giver, "two-days", Math.max(reachedAt, event.at), event.message);
}

function whenTheSecondDayCame(given: { day: string; at: number }[]): number | null {
  const days = new Set<string>();
  for (const { day, at } of given.toSorted((one, other) => one.at - other.at)) if (days.add(day).size === daysToFinishTwoDays) return at;
  return null;
}

async function recordedAtOf(ctx: QueryCtx, { awards }: KudosGivenEvent): Promise<number> {
  const first = awards[0] === undefined ? null : await ctx.db.get(awards[0].award);
  return first?._creationTime ?? 0;
}

async function finished(ctx: MutationCtx, workspace: string, member: MemberId, step: OnboardingStep, at: number, cause?: MessageRef): Promise<void> {
  await finishMondayQuest(ctx, workspace, member, { kind: "journey", step }, { reward: onboardingReward, catalogueVersion: mondayCatalogueVersion }, at, cause);
}

async function twoDaysFinishedBy(ctx: QueryCtx, member: MemberId, instant: number): Promise<boolean> {
  const finish = await finishOf(ctx, member, "two-days");
  if (finish === null) return false;
  const decided = finish.cause === undefined ? null : await firstDecidedOf(ctx, finish.cause);
  return (decided ?? finish.at) <= instant;
}

function finishOf(ctx: QueryCtx, member: MemberId, step: OnboardingStep) {
  return questFinishOf(ctx, member, rewardKeyOf({ kind: "journey", step }));
}
