// The module map's skeleton of convex/website/abandonedHandshakes.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const deleteAbandonedArgs = z.strictObject({});
export async function deleteAbandoned(ctx: MutationContext, args: z.infer<typeof deleteAbandonedArgs>): Promise<void> {
  throw notPorted("website.abandonedHandshakes.deleteAbandoned");
}
export const deleteAbandonedJob = mutationJob("website.abandonedHandshakes.deleteAbandoned", deleteAbandonedArgs, deleteAbandoned);
