// The module map's skeleton of convex/quests/judged.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { awardIdValidator, type AwardId } from "../engine/awards.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const questsJudgedValidator = z.strictObject({ award: awardIdValidator });

export async function judgeQuestsOf(ctx: MutationContext, awards: { award: AwardId }[]): Promise<void> {
  throw notPorted("quests.judged.judgeQuestsOf");
}

export async function questsJudgedFor(ctx: QueryContext, awards: { award: AwardId }[]): Promise<boolean> {
  throw notPorted("quests.judged.questsJudgedFor");
}
