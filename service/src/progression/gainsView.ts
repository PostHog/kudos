// Which gains a reply or a view shows: XP, quest progress and perk bonuses. Today's convex/progression/gainsView.ts.
import { onTheMondayPath } from "../quests/flag.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { skillTreeAppliesIn } from "./skillTree.ts";
import { xpLevelsOnFor, xpLevelsShownIn } from "./xpLevels.ts";

export function xpGainsShownTo(ctx: QueryContext, workspace: string, member: MemberId | null): Promise<boolean> {
  return member === null ? xpLevelsShownIn(ctx, workspace) : xpLevelsOnFor(ctx, member);
}

export async function questGainsShownTo(ctx: QueryContext, member: MemberId | null): Promise<boolean> {
  return member !== null && (await onTheMondayPath(ctx, member));
}

export async function bonusGainsShownTo(ctx: QueryContext, workspace: string, member: MemberId | null): Promise<boolean> {
  return (await xpGainsShownTo(ctx, workspace, member)) && (await skillTreeAppliesIn(ctx, workspace));
}
