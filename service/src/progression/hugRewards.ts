// The module map's skeleton of convex/progression/hugRewards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugGivenEventValidator, hugReceivedEventValidator } from "../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const payHugGivenArgs = z.strictObject({ event: hugGivenEventValidator });
export async function payHugGiven(ctx: MutationContext, args: z.infer<typeof payHugGivenArgs>): Promise<void> {
  throw notPorted("progression.hugRewards.payHugGiven");
}
export const payHugGivenJob = mutationJob("progression.hugRewards.payHugGiven", payHugGivenArgs, payHugGiven);

export const payHugReceivedArgs = z.strictObject({ event: hugReceivedEventValidator });
export async function payHugReceived(ctx: MutationContext, args: z.infer<typeof payHugReceivedArgs>): Promise<void> {
  throw notPorted("progression.hugRewards.payHugReceived");
}
export const payHugReceivedJob = mutationJob("progression.hugRewards.payHugReceived", payHugReceivedArgs, payHugReceived);
