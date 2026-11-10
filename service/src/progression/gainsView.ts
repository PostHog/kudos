// The module map's skeleton of convex/progression/gainsView.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export function xpGainsShownTo(ctx: QueryContext, workspace: string, member: MemberId | null): Promise<boolean> {
  throw notPorted("progression.gainsView.xpGainsShownTo");
}

export async function questGainsShownTo(ctx: QueryContext, member: MemberId | null): Promise<boolean> {
  throw notPorted("progression.gainsView.questGainsShownTo");
}

export async function bonusGainsShownTo(ctx: QueryContext, workspace: string, member: MemberId | null): Promise<boolean> {
  throw notPorted("progression.gainsView.bonusGainsShownTo");
}
