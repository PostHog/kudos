// The Monday DM's quests section: nothing off the Monday path, before the member's quests start, or with the quests
// message off; under two-quests the week's two quests, drawing any side due first; otherwise the onboarding quests while
// one is unfinished, then the week's drawn quests. Today's convex/quests/mondaySection.ts over the service's transaction.
import { placeOf } from "../messageSettings/messageSettings.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { settingsOf } from "../workspace/settings.ts";
import { onTheMondayPath, twoQuestsOn } from "./flag.ts";
import { onboardingQuestsOf } from "./onboarding.ts";
import { questOf, withoutFullStop } from "./pool.ts";
import { progressUnitOf, type QuestProgress } from "./progress.ts";
import { drawSidesWhenDue } from "./sides.ts";
import { questStartOf } from "./start.ts";
import { twoQuestsOf, type TwoQuestsRow } from "./twoQuests.ts";
import { thisWeeksQuestsOf, type WeeklySlot } from "./weekly.ts";
import type { MutationContext } from "../operations.ts";

export type SectionQuest = { goal: string; finished: boolean; progress: QuestProgress | null };

export type QuestsSection = { kind: "onboarding"; done: number; quests: SectionQuest[] } | { kind: "drawn"; quests: SectionQuest[] } | { kind: "two-quests"; kudosEmoji: string; quests: TwoQuestsRow[] };

export async function questsSectionFor(ctx: MutationContext, member: MemberId, at: number): Promise<QuestsSection | null> {
  if (!(await mondayQuestsWantedBy(ctx, member))) return null;
  if (await twoQuestsOn(ctx, member)) return twoQuestsSectionFor(ctx, member, at);
  const onboarding = await onboardingQuestsOf(ctx, member, at);
  if (onboarding.some(({ finished }) => !finished)) {
    return { kind: "onboarding", done: onboarding.filter(({ finished }) => finished).length, quests: onboarding.map(({ goal, finished, progress }) => ({ goal, finished, progress })) };
  }
  const week = await thisWeeksQuestsOf(ctx, member, at);
  return week === null ? null : { kind: "drawn", quests: week.slots.map(drawnQuestOf) };
}

async function twoQuestsSectionFor(ctx: MutationContext, member: MemberId, at: number): Promise<QuestsSection | null> {
  await drawSidesWhenDue(ctx, member, at);
  const quests = await twoQuestsOf(ctx, member, at);
  if (quests.length === 0) return null;
  const { workspace } = await chatUserOf(ctx, member);
  return { kind: "two-quests", kudosEmoji: (await settingsOf(ctx, workspace)).kudosEmoji, quests };
}

async function mondayQuestsWantedBy(ctx: MutationContext, member: MemberId) {
  return (await onTheMondayPath(ctx, member)) && (await questStartOf(ctx, member)) !== null && (await placeOf(ctx, member, "quests")) !== "none";
}

function drawnQuestOf({ quest, goal, progress, target, finishedAt }: WeeklySlot): SectionQuest {
  const counted = target > 1 ? { done: progress, of: target, unit: progressUnitOf(questOf(quest)) } : null;
  return { goal: withoutFullStop(goal), finished: finishedAt !== null, progress: counted };
}
