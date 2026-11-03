import type { MutationCtx } from "../_generated/server";
import { placeOf } from "../messageSettings/messageSettings";
import { chatUserOf, type MemberId } from "../workspace/directory";
import { settingsOf } from "../workspace/settings";
import { onTheMondayPath, twoQuestsOn } from "./flag";
import { onboardingQuestsOf } from "./onboarding";
import { questOf, withoutFullStop } from "./pool";
import { progressUnitOf, type QuestProgress } from "./progress";
import { drawSidesWhenDue } from "./sides";
import { questStartOf } from "./start";
import { twoQuestsOf, type TwoQuestsRow } from "./twoQuests";
import { thisWeeksQuestsOf, type WeeklySlot } from "./weekly";

export type SectionQuest = { goal: string; finished: boolean; progress: QuestProgress | null };

export type QuestsSection = { kind: "onboarding"; done: number; quests: SectionQuest[] } | { kind: "drawn"; quests: SectionQuest[] } | { kind: "two-quests"; kudosEmoji: string; quests: TwoQuestsRow[] };

export async function questsSectionFor(ctx: MutationCtx, member: MemberId, at: number): Promise<QuestsSection | null> {
  if (!(await mondayQuestsWantedBy(ctx, member))) return null;
  if (await twoQuestsOn(ctx, member)) return twoQuestsSectionFor(ctx, member, at);
  const onboarding = await onboardingQuestsOf(ctx, member, at);
  if (onboarding.some(({ finished }) => !finished)) {
    return { kind: "onboarding", done: onboarding.filter(({ finished }) => finished).length, quests: onboarding.map(({ goal, finished, progress }) => ({ goal, finished, progress })) };
  }
  const week = await thisWeeksQuestsOf(ctx, member, at);
  return week === null ? null : { kind: "drawn", quests: week.slots.map(drawnQuestOf) };
}

async function twoQuestsSectionFor(ctx: MutationCtx, member: MemberId, at: number): Promise<QuestsSection | null> {
  await drawSidesWhenDue(ctx, member, at);
  const quests = await twoQuestsOf(ctx, member, at);
  if (quests.length === 0) return null;
  const { workspace } = await chatUserOf(ctx, member);
  return { kind: "two-quests", kudosEmoji: (await settingsOf(ctx, workspace)).kudosEmoji, quests };
}

async function mondayQuestsWantedBy(ctx: MutationCtx, member: MemberId) {
  return (await onTheMondayPath(ctx, member)) && (await questStartOf(ctx, member)) !== null && (await placeOf(ctx, member, "quests")) !== "none";
}

function drawnQuestOf({ quest, goal, progress, target, finishedAt }: WeeklySlot): SectionQuest {
  const counted = target > 1 ? { done: progress, of: target, unit: progressUnitOf(questOf(quest)) } : null;
  return { goal: withoutFullStop(goal), finished: finishedAt !== null, progress: counted };
}
