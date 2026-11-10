// The module map's skeleton of convex/quests/mondaySection.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { QuestProgress } from "./progress.ts";
import type { TwoQuestsRow } from "./twoQuests.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type SectionQuest = { goal: string; finished: boolean; progress: QuestProgress | null };

export type QuestsSection = { kind: "onboarding"; done: number; quests: SectionQuest[] } | { kind: "drawn"; quests: SectionQuest[] } | { kind: "two-quests"; kudosEmoji: string; quests: TwoQuestsRow[] };

export async function questsSectionFor(ctx: MutationContext, member: MemberId, at: number): Promise<QuestsSection | null> {
  throw notPorted("quests.mondaySection.questsSectionFor");
}
