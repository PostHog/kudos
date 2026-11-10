// The module map's skeleton of convex/analytics/sweep.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const sweepArgs = z.strictObject({});
export async function sweep(ctx: MutationContext, args: z.infer<typeof sweepArgs>): Promise<void> {
  throw notPorted("analytics.sweep.sweep");
}
export const sweepJob = mutationJob("analytics.sweep.sweep", sweepArgs, sweep);
