// The module map's skeleton of convex/quests/hugLadder.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { Reward } from "./journey.ts";
import type { JourneyStep } from "./step.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const hugLadderSteps = ["hugs-3", "hugs-5", "hugs-10"] as const satisfies readonly JourneyStep[];

export type HugLadderStep = (typeof hugLadderSteps)[number];

export const hugLadderReward: Reward = { xp: 20, coins: 0, item: null };

const hugsToFinish: Record<HugLadderStep, number> = { "hugs-3": 3, "hugs-5": 5, "hugs-10": 10 };

export function hugLadderTargetOf(step: HugLadderStep): number {
  return hugsToFinish[step];
}

export async function startTheHugLadder(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  throw notPorted("quests.hugLadder.startTheHugLadder");
}

export async function advanceHugLadder(ctx: MutationContext, workspace: string, member: MemberId): Promise<void> {
  throw notPorted("quests.hugLadder.advanceHugLadder");
}

export async function hugsOnTheLadderOf(ctx: QueryContext, member: MemberId): Promise<number> {
  throw notPorted("quests.hugLadder.hugsOnTheLadderOf");
}

export async function nextHugLadderStepOf(ctx: QueryContext, member: MemberId): Promise<HugLadderStep | null> {
  throw notPorted("quests.hugLadder.nextHugLadderStepOf");
}
