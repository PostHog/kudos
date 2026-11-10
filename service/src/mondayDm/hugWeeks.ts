// The module map's skeleton of convex/mondayDm/hugWeeks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const ensureMondayDmsOfHugWeeksArgs = z.strictObject({ cursor: z.optional(z.string()) });
export async function ensureMondayDmsOfHugWeeks(ctx: MutationContext, args: z.infer<typeof ensureMondayDmsOfHugWeeksArgs>): Promise<void> {
  throw notPorted("mondayDm.hugWeeks.ensureMondayDmsOfHugWeeks");
}
export const ensureMondayDmsOfHugWeeksJob = mutationJob("mondayDm.hugWeeks.ensureMondayDmsOfHugWeeks", ensureMondayDmsOfHugWeeksArgs, ensureMondayDmsOfHugWeeks);
