// The module map's skeleton of convex/leaderboard/newGivers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import type { DayKey } from "../engine/allowance.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const weeklyHighlightsFlag = { key: "weekly-highlights", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const newGiversListed = 3;
export const mostGiversRanked = 5_000;
export const mostGiversChecked = 200;
export const mostGiversFeatured = 5_000;

export type NewGiver = { member: MemberId; name: string; thoughtful: number };

export function weeklyHighlightsApplyTo(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("leaderboard.newGivers.weeklyHighlightsApplyTo");
}

export async function newGiversOf(ctx: QueryContext, workspace: string, postWeek: DayKey): Promise<NewGiver[]> {
  throw notPorted("leaderboard.newGivers.newGiversOf");
}

export async function featureNewGivers(ctx: MutationContext, workspace: string, postWeek: DayKey, givers: NewGiver[]): Promise<void> {
  throw notPorted("leaderboard.newGivers.featureNewGivers");
}

export async function unfeatureNewGivers(ctx: MutationContext, workspace: string, postWeek: DayKey): Promise<void> {
  throw notPorted("leaderboard.newGivers.unfeatureNewGivers");
}
