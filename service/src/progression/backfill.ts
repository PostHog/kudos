// The module map's skeleton of convex/progression/backfill.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Backfilled = { awards: number; recorded: number };

export const replayAwardsArgs = z.strictObject({});
export async function replayAwards(ctx: MutationContext, args: z.infer<typeof replayAwardsArgs>): Promise<Backfilled & { isDone: boolean }> {
  throw notPorted("progression.backfill.replayAwards");
}
