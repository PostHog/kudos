// The module map's skeleton of convex/website/clock.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const tickArgs = z.strictObject({});
export async function tick(ctx: MutationContext, args: z.infer<typeof tickArgs>): Promise<void> {
  throw notPorted("website.clock.tick");
}
export const tickJob = mutationJob("website.clock.tick", tickArgs, tick);

export async function followTheClock(ctx: QueryContext): Promise<void> {
  throw notPorted("website.clock.followTheClock");
}
