// The module map's skeleton of convex/leaderboard/thankers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type DayKey } from "../engine/allowance.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Landing } from "./counts.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function noteThanker(ctx: MutationContext, { member, day }: Landing, thanker: MemberId): Promise<void> {
  throw notPorted("leaderboard.thankers.noteThanker");
}

export async function teammatesWhoThanked(ctx: QueryContext, member: MemberId, week: DayKey): Promise<number> {
  throw notPorted("leaderboard.thankers.teammatesWhoThanked");
}
