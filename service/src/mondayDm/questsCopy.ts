import { hoggieRewardOf, waitingHoggiesLineOf } from "../feedback/waitingHoggies.ts";
import type { WaitingCount } from "../album/items/ledger.ts";
import type { QuestsSection, SectionQuest } from "../quests/mondaySection.ts";
import { onboardingReward, type OnboardingStep } from "../quests/onboarding.ts";
import { mondayReward } from "../quests/pool.ts";
import type { HowTo, TwoQuestsProgress, TwoQuestsRow } from "../quests/twoQuests.ts";

export type ChecklistItem = { goal: string; mark: "done" | "next" | "open"; progress: string | null; howTo?: string; reward?: string };

export type QuestsCopy = { heading: string; checklist: ChecklistItem[] };

const countWords = ["no", "one", "two", "three"];

const rewardOf: Record<Exclude<QuestsSection["kind"], "two-quests">, string> = {
  onboarding: hoggieRewardOf(onboardingReward.xp),
  drawn: hoggieRewardOf(mondayReward.xp),
};

export const onboardingHowTos: Record<OnboardingStep, (kudosEmoji: string) => string> = {
  "first-thanks": (kudosEmoji) => `Mention them in a message and add :${kudosEmoji}:.`,
  "someone-new": () => "Someone from another team counts too.",
  "two-days": () => "One kudos today and another on any later day.",
};

export function howToHug(kudosEmoji: string) {
  return `react to any message with :${kudosEmoji}:`;
}

export function questRewardLineOf(xp: number) {
  return `🎁 ${hoggieRewardOf(xp)}`;
}

export function questsCopyOf(section: QuestsSection, waiting: WaitingCount): QuestsCopy {
  const waitingLine = waitingHoggiesLineOf(waiting);
  const heading = [...headingLinesOf(section), ...(waitingLine === null ? [] : ["", waitingLine])].join("\n");
  return { heading, checklist: checklistOf(section) };
}

function headingLinesOf(section: QuestsSection): string[] {
  if (section.kind === "two-quests") return [weekOpeningOf(section.quests.length)];
  const reward = rewardOf[section.kind];
  if (section.kind === "drawn") {
    const count = section.quests.length;
    return [`${weekOpeningOf(count)} ${eachPays(count, reward)}`];
  }
  const left = section.quests.length - section.done;
  return [onboardingHeadingOf(section.done, section.quests.length), `${capitalized(countWordOf(left))} ${left === 1 ? "quest" : "quests"} left. ${eachPays(left, reward)}`];
}

function weekOpeningOf(count: number) {
  return `Happy Monday :sun_with_face: Here ${count === 1 ? "is one quest" : `are ${countWordOf(count)} quests`} for your week.`;
}

export function onboardingHeadingOf(done: number, of: number): string {
  return `*Your onboarding journey* · ${done} of ${of} done`;
}

export function onboardingChecklistOf(quests: SectionQuest[]): ChecklistItem[] {
  const next = quests.findIndex(({ finished }) => !finished);
  return quests.map((quest, index) => checklistItemOf(quest, index === next));
}

export function twoQuestsItemOf({ goal, finished, progress, xp, howTo, next }: TwoQuestsRow, kudosEmoji: string): ChecklistItem {
  const item = checklistItemOf({ goal, finished, progress: progress.of > 1 ? progress : null }, next);
  if (finished) return item;
  return { ...item, ...(howTo === null ? {} : { howTo: slackHowToOf(howTo, kudosEmoji) }), reward: questRewardLineOf(xp) };
}

function checklistOf(section: QuestsSection): ChecklistItem[] {
  switch (section.kind) {
    case "onboarding":
      return onboardingChecklistOf(section.quests);
    case "drawn":
      return section.quests.map((quest) => checklistItemOf(quest, false));
    case "two-quests":
      return section.quests.map((quest) => twoQuestsItemOf(quest, section.kudosEmoji));
  }
}

export function checklistItemOf(quest: Pick<SectionQuest, "goal" | "finished"> & { progress: TwoQuestsProgress | null }, isNext: boolean): ChecklistItem {
  return { goal: quest.goal, mark: quest.finished ? "done" : isNext ? "next" : "open", progress: progressOf(quest) };
}

function progressOf({ finished, progress }: { finished: boolean; progress: TwoQuestsProgress | null }): string | null {
  return finished || progress === null ? null : `${progress.done} of ${progress.of} ${progress.unit}`;
}

function slackHowToOf(howTo: HowTo, kudosEmoji: string): string {
  return howTo === "hug" ? `${capitalized(howToHug(kudosEmoji))}.` : onboardingHowTos[howTo](kudosEmoji);
}

function eachPays(count: number, reward: string) {
  return `${count === 1 ? "It pays" : "Each one pays"} ${reward}.`;
}

function countWordOf(count: number) {
  return countWords[count] ?? String(count);
}

function capitalized(word: string) {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}
