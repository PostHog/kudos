// The Monday quests a member's quests panel shows: their getting-started journey, their drawn week, or their two quests.
// Today's convex/website/mondayQuests.ts; the panel's time is the reading operation's instant.
import { members } from "../db/schema/index.ts";
import { hasHuggedBefore } from "../hugs/records.ts";
import { earnedItemOf, newestTurnOf } from "../album/items/ledger.ts";
import type { QueryContext } from "../operations.ts";
import { rewardKeyOf } from "../quests/crates.ts";
import { twoQuestsOn } from "../quests/flag.ts";
import { questItemKeyOf } from "../album/items/questHoggies.ts";
import { nextOnboardingQuestOf, onboardingFinishedBy, onboardingGoalOf, onboardingQuestFactsOf, onboardingReward, onboardingTargetOf, type OnboardingQuestFacts, type OnboardingStep } from "../quests/onboarding.ts";
import { withoutFullStop, type QuestId } from "../quests/pool.ts";
import type { Side } from "../quests/sides.ts";
import type { Quest } from "../quests/step.ts";
import { twoQuestsOf, type HowTo, type TwoQuestsRow } from "../quests/twoQuests.ts";
import { daysLeftInWeek } from "../quests/week.ts";
import { drawnWeekOf, type DrawnWeek } from "../quests/weekly.ts";
import type { MemberId } from "../workspace/directory.ts";
import { rowById } from "../workspace/rows.ts";
import { followTheClock } from "./clock.ts";
import type { VerifiedMember } from "./memberQuery.ts";

export type QuestItemState = "waiting" | "turned" | null;

export type StepProgress = { done: number; target: number };

export type GettingStartedStepId = "hug" | OnboardingStep | "turn";

export type GettingStartedStep = { step: GettingStartedStepId; goal: string; hint: string | null; progress: StepProgress; done: boolean; reward: { xp: number } | null; item: QuestItemState };

export type DrawnQuest = { quest: QuestId; goal: string; progress: StepProgress; done: boolean; reward: { xp: number }; item: QuestItemState };

export type SideQuest = { side: Side; goal: string; hint: string | null; progress: StepProgress; done: boolean; reward: { xp: number }; item: QuestItemState; next: boolean; drawn: boolean };

export type MondayQuestList = { kind: "journey"; steps: GettingStartedStep[] } | { kind: "drawn"; quests: DrawnQuest[] } | { kind: "two-quests"; quests: SideQuest[]; steps: SideQuest[] };

export type MondayQuests = { kind: "monday"; firstName: string | null; next: OnboardingStep | null; daysLeft: number; quests: MondayQuestList };

const hugHint = "React with your kudos emoji on any message in Slack.";

const guidance: Record<"hug" | "turn", { goal: string; hint: string | null }> = {
  hug: { goal: "Give your first hug", hint: hugHint },
  turn: { goal: "Identify the hoggie it left on your board", hint: null },
};

const questHints: Record<OnboardingStep, string> = {
  "first-thanks": "Mention someone in a Slack message and add your kudos emoji.",
  "someone-new": "Someone from another team counts, and so does a new joiner.",
  "two-days": "One kudos today and another on any later day.",
};

export async function mondayQuestsOf(ctx: QueryContext, me: VerifiedMember): Promise<MondayQuests> {
  await followTheClock(ctx);
  const at = ctx.now;
  const timeZone = (await rowById<{ timeZone?: string }>(ctx, members, me.member))?.timeZone;
  return {
    kind: "monday",
    firstName: firstNameOf(me),
    next: await nextOnboardingQuestOf(ctx, me.member),
    daysLeft: daysLeftInWeek(at, timeZone),
    quests: await questListOf(ctx, me.member, at),
  };
}

async function questListOf(ctx: QueryContext, member: MemberId, at: number): Promise<MondayQuestList> {
  if (await twoQuestsOn(ctx, member)) {
    const quests = await Promise.all((await twoQuestsOf(ctx, member, at)).map((row) => sideQuestOf(ctx, member, row)));
    return { kind: "two-quests", quests, steps: quests };
  }
  const week = (await onboardingFinishedBy(ctx, member)) ? await drawnWeekOf(ctx, member, at) : null;
  if (week === null) return { kind: "journey", steps: await gettingStartedOf(ctx, member, at) };
  return { kind: "drawn", quests: await Promise.all(week.slots.map((slot) => drawnQuestOf(ctx, member, slot))) };
}

async function gettingStartedOf(ctx: QueryContext, member: MemberId, at: number): Promise<GettingStartedStep[]> {
  const quests = await onboardingQuestFactsOf(ctx, member, at);
  return [
    guidanceStep("hug", await hasHuggedBefore(ctx, member)),
    await questStepOf(ctx, member, quests["first-thanks"]),
    guidanceStep("turn", (await newestTurnOf(ctx, member)) !== null),
    await questStepOf(ctx, member, quests["someone-new"]),
    await questStepOf(ctx, member, quests["two-days"]),
  ];
}

function guidanceStep(step: "hug" | "turn", done: boolean): GettingStartedStep {
  return { step, ...guidance[step], progress: { done: done ? 1 : 0, target: 1 }, done, reward: null, item: null };
}

async function questStepOf(ctx: QueryContext, member: MemberId, { step, finish, progress }: OnboardingQuestFacts): Promise<GettingStartedStep> {
  const target = onboardingTargetOf(step);
  const done = finish !== null;
  return {
    step,
    goal: onboardingGoalOf(step),
    hint: questHints[step],
    progress: { done: done ? target : (progress?.done ?? 0), target },
    done,
    reward: { xp: finish?.xp ?? onboardingReward.xp },
    item: done ? await itemStateOf(ctx, member, { kind: "journey", step }) : null,
  };
}

async function drawnQuestOf(ctx: QueryContext, member: MemberId, { quest, goal, progress, target, finishedAt, reward, crate }: DrawnWeek["slots"][number]): Promise<DrawnQuest> {
  const done = finishedAt !== null;
  return { quest, goal: withoutFullStop(goal), progress: { done: progress, target }, done, reward: { xp: reward.xp }, item: done ? await itemStateOf(ctx, member, crate) : null };
}

async function sideQuestOf(ctx: QueryContext, member: MemberId, { side, quest, goal, finished, progress, xp, howTo, next }: TwoQuestsRow): Promise<SideQuest> {
  const item = finished ? await itemStateOf(ctx, member, quest) : null;
  return { side, goal, hint: howTo === null ? null : hintOf(howTo), progress: { done: progress.done, target: progress.of }, done: finished, reward: { xp }, item, next, drawn: quest.kind === "weekly" };
}

function hintOf(howTo: HowTo): string {
  return howTo === "hug" ? hugHint : questHints[howTo];
}

async function itemStateOf(ctx: QueryContext, member: MemberId, quest: Quest): Promise<QuestItemState> {
  const item = await earnedItemOf(ctx, member, "hoggie", questItemKeyOf(rewardKeyOf(quest)));
  if (item === null) return null;
  return item.turnedAt === undefined ? "waiting" : "turned";
}

function firstNameOf({ givenName, name }: VerifiedMember): string | null {
  return givenName ?? name?.split(/\s+/)[0] ?? null;
}
