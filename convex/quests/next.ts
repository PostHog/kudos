import type { QueryCtx } from "../_generated/server";
import type { MemberId } from "../workspace/directory";
import { onTheMondayPath, twoQuestsOn } from "./flag";
import { nextHugLadderStepOf } from "./hugLadder";
import { nextOnboardingQuestOf } from "./onboarding";
import { unfinishedSideQuestOf, type Side } from "./sides";
import type { Quest } from "./step";

export type NextQuest = { side: Side; quest: Quest };

export async function nextQuestOf(ctx: QueryCtx, member: MemberId, at: number): Promise<NextQuest | null> {
  if (!(await onTheMondayPath(ctx, member))) return null;
  if (!(await twoQuestsOn(ctx, member))) return kudosOnboardingQuestOf(ctx, member);
  return (await hugQuestOf(ctx, member, at)) ?? (await kudosOnboardingQuestOf(ctx, member)) ?? (await drawnQuestOf(ctx, member, "kudos", at));
}

async function hugQuestOf(ctx: QueryCtx, member: MemberId, at: number): Promise<NextQuest | null> {
  const step = await nextHugLadderStepOf(ctx, member);
  return step === null ? drawnQuestOf(ctx, member, "hug", at) : { side: "hug", quest: { kind: "journey", step } };
}

async function kudosOnboardingQuestOf(ctx: QueryCtx, member: MemberId): Promise<NextQuest | null> {
  const step = await nextOnboardingQuestOf(ctx, member);
  return step === null ? null : { side: "kudos", quest: { kind: "journey", step } };
}

async function drawnQuestOf(ctx: QueryCtx, member: MemberId, side: Side, at: number): Promise<NextQuest | null> {
  const quest = await unfinishedSideQuestOf(ctx, member, side, at);
  return quest === null ? null : { side, quest };
}
