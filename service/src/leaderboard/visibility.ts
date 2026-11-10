// The module map's skeleton of convex/leaderboard/visibility.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function isOnTheBoards(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("leaderboard.visibility.isOnTheBoards");
}

export async function setLeaderboardVisibility(ctx: MutationContext, member: MemberId, visible: boolean): Promise<boolean> {
  throw notPorted("leaderboard.visibility.setLeaderboardVisibility");
}
