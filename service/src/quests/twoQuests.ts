// The module map's skeleton of convex/quests/twoQuests.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import { type OnboardingStep } from "./onboarding.ts";
import { type QuestProgress } from "./progress.ts";
import { type Side } from "./sides.ts";
import type { Quest } from "./step.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type HowTo = "hug" | OnboardingStep;

export type TwoQuestsProgress = { done: number; of: number; unit: QuestProgress["unit"] | "hugs" };

export type TwoQuestsRow = { side: Side; quest: Quest; goal: string; finished: boolean; progress: TwoQuestsProgress; xp: number; howTo: HowTo | null; next: boolean };

export async function twoQuestsOf(ctx: QueryContext, member: MemberId, at: number): Promise<TwoQuestsRow[]> {
  throw notPorted("quests.twoQuests.twoQuestsOf");
}

export async function hugLadderRowOf(ctx: QueryContext, member: MemberId): Promise<TwoQuestsRow | null> {
  throw notPorted("quests.twoQuests.hugLadderRowOf");
}
