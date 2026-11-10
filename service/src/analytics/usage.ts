// The module map's skeleton of convex/analytics/usage.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { failuresLogged } from "./failures.ts";
import type { UsageFact } from "./projections.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const usageNotRecorded = "analytics.usage_not_recorded";

export async function recordUsage(ctx: MutationContext, fact: UsageFact): Promise<void> {
  throw notPorted("analytics.usage.recordUsage");
}

export async function recordUsageWithoutBlocking(recording: () => Promise<unknown>) {
  try {
    await failuresLogged(usageNotRecorded, recording);
  } catch {
    return;
  }
}
