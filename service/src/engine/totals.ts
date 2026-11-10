// The module map's skeleton of convex/engine/totals.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { Award } from "./awards.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type LifetimeTotals = { given: number; received: number };

export async function addToTotals(ctx: MutationContext, award: Award): Promise<void> {
  throw notPorted("engine.totals.addToTotals");
}

export async function lifetimeTotals(ctx: QueryContext, member: MemberId): Promise<LifetimeTotals> {
  throw notPorted("engine.totals.lifetimeTotals");
}
