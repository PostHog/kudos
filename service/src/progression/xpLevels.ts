// The module map's skeleton of convex/progression/xpLevels.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const xpLevels = { key: "xp-levels", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function xpLevelsShownIn(ctx: QueryContext | MutationContext, workspace: string): Promise<boolean> {
  throw notPorted("progression.xpLevels.xpLevelsShownIn");
}

export function xpLevelsOnFor(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("progression.xpLevels.xpLevelsOnFor");
}

export async function xpLevelsShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("progression.xpLevels.xpLevelsShownTo");
}
