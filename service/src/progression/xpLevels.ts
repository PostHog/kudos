// The xp-levels flag: whether XP and levels show in a workspace and to a member. Today's convex/progression/xpLevels.ts.
import { exposed, memberDecision, workspaceDecision, type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const xpLevels = { key: "xp-levels", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function xpLevelsShownIn(ctx: QueryContext | MutationContext, workspace: string): Promise<boolean> {
  return workspaceDecision(ctx, xpLevels, workspace);
}

export function xpLevelsOnFor(ctx: QueryContext | MutationContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, xpLevels, member);
}

export async function xpLevelsShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const shown = await xpLevelsOnFor(ctx, member);
  await exposed(ctx, xpLevels, member, shown);
  return shown;
}
