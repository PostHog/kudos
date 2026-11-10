// The module map's skeleton of convex/analytics/recordedFacts.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function recordsOnce(ctx: MutationContext, fact: string | undefined): Promise<boolean> {
  throw notPorted("analytics.recordedFacts.recordsOnce");
}
