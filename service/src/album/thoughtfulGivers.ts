// The module map's skeleton of convex/album/thoughtfulGivers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { PeriodKey } from "../leaderboard/periods.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const fewestThoughtfulGiversShown = 3;

export type NormViewer = { workspace: string; member: MemberId; timeZone: string | undefined };

export async function countThoughtfulGiver(ctx: MutationContext, workspace: string, week: PeriodKey): Promise<void> {
  throw notPorted("album.thoughtfulGivers.countThoughtfulGiver");
}

export async function thoughtfulGiversShownTo(ctx: QueryContext, viewer: NormViewer): Promise<number | null> {
  throw notPorted("album.thoughtfulGivers.thoughtfulGiversShownTo");
}

export async function thoughtfulGiversThisWeek(ctx: QueryContext, { workspace, timeZone }: Omit<NormViewer, "member">): Promise<number | null> {
  throw notPorted("album.thoughtfulGivers.thoughtfulGiversThisWeek");
}
