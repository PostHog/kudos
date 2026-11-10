// The module map's skeleton of convex/activity/spotlight.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Spotlight } from "./entries.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type SpotlightFrom = { seed: number } | { after: string };

export async function spotlightOf(ctx: QueryContext, workspace: string, from: SpotlightFrom): Promise<Spotlight> {
  throw notPorted("activity.spotlight.spotlightOf");
}
