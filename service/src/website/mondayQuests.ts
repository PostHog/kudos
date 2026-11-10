// The module map's skeleton of convex/website/mondayQuests.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { OnboardingStep } from "../quests/onboarding.ts";
import type { QuestId } from "../quests/pool.ts";
import type { Side } from "../quests/sides.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type QuestItemState = "waiting" | "turned" | null;

export type StepProgress = { done: number; target: number };

export type GettingStartedStepId = "hug" | OnboardingStep | "turn";

export type GettingStartedStep = { step: GettingStartedStepId; goal: string; hint: string | null; progress: StepProgress; done: boolean; reward: { xp: number } | null; item: QuestItemState };

export type DrawnQuest = { quest: QuestId; goal: string; progress: StepProgress; done: boolean; reward: { xp: number }; item: QuestItemState };

export type SideQuest = { side: Side; goal: string; hint: string | null; progress: StepProgress; done: boolean; reward: { xp: number }; item: QuestItemState; next: boolean; drawn: boolean };

export type MondayQuestList = { kind: "journey"; steps: GettingStartedStep[] } | { kind: "drawn"; quests: DrawnQuest[] } | { kind: "two-quests"; quests: SideQuest[]; steps: SideQuest[] };

export type MondayQuests = { kind: "monday"; firstName: string | null; next: OnboardingStep | null; daysLeft: number; quests: MondayQuestList };

export async function mondayQuestsOf(ctx: QueryContext, me: VerifiedMember): Promise<MondayQuests> {
  throw notPorted("website.mondayQuests.mondayQuestsOf");
}
