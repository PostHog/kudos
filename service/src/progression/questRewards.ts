// The module map's skeleton of convex/progression/questRewards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { questFinishedEventValidator } from "../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const payQuestFinishedArgs = z.strictObject({ event: questFinishedEventValidator });
export async function payQuestFinished(ctx: MutationContext, args: z.infer<typeof payQuestFinishedArgs>): Promise<void> {
  throw notPorted("progression.questRewards.payQuestFinished");
}
export const payQuestFinishedJob = mutationJob("progression.questRewards.payQuestFinished", payQuestFinishedArgs, payQuestFinished);
