// The module map's skeleton of convex/progression/medalRewards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { medalsUnlockedEventValidator } from "../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const payMedalsUnlockedArgs = z.strictObject({ event: medalsUnlockedEventValidator });
export async function payMedalsUnlocked(ctx: MutationContext, args: z.infer<typeof payMedalsUnlockedArgs>): Promise<void> {
  throw notPorted("progression.medalRewards.payMedalsUnlocked");
}
export const payMedalsUnlockedJob = mutationJob("progression.medalRewards.payMedalsUnlocked", payMedalsUnlockedArgs, payMedalsUnlocked);
