// The module map's skeleton of convex/achievements/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function achievementsApplyIn(ctx: QueryContext | MutationContext, workspace: string): Promise<boolean> {
  throw notPorted("achievements.flag.achievementsApplyIn");
}

export async function achievementsLiveIn(ctx: MutationContext, workspace: string): Promise<boolean> {
  throw notPorted("achievements.flag.achievementsLiveIn");
}

export async function bookLaunchDueIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("achievements.flag.bookLaunchDueIn");
}

export async function bookAppliesIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("achievements.flag.bookAppliesIn");
}

export async function bookLaunchedAt(ctx: QueryContext, workspace: string): Promise<number | null> {
  throw notPorted("achievements.flag.bookLaunchedAt");
}

export async function achievementsShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("achievements.flag.achievementsShownTo");
}
