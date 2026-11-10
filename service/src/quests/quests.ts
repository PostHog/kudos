// The module map's skeleton of convex/quests/quests.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { hugGivenEventValidator, kudosGivenEventValidator } from "../bus/events.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const followKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator });
export async function followKudosGiven(ctx: MutationContext, args: z.infer<typeof followKudosGivenArgs>): Promise<void> {
  throw notPorted("quests.quests.followKudosGiven");
}
export const followKudosGivenJob = mutationJob("quests.quests.followKudosGiven", followKudosGivenArgs, followKudosGiven);

export const followHugGivenArgs = z.strictObject({ event: hugGivenEventValidator });
export async function followHugGiven(ctx: MutationContext, args: z.infer<typeof followHugGivenArgs>): Promise<void> {
  throw notPorted("quests.quests.followHugGiven");
}
export const followHugGivenJob = mutationJob("quests.quests.followHugGiven", followHugGivenArgs, followHugGiven);
