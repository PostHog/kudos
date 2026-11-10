// The module map's skeleton of convex/unlocks/sweep.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const sweepArgs = z.strictObject({ cursor: z.optional(z.string()) });
export async function sweep(ctx: MutationContext, args: z.infer<typeof sweepArgs>): Promise<void> {
  throw notPorted("unlocks.sweep.sweep");
}
export const sweepJob = mutationJob("unlocks.sweep.sweep", sweepArgs, sweep);
