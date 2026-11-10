// Whether achievements apply in a workspace, and the book's one launch there. Today's convex/achievements/flag.ts over
// the service's transaction.
import { eq } from "drizzle-orm";
import { exposed, workspaceDecision } from "../analytics/flags.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { bookLaunches } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { xpLevelsShownIn } from "../progression/xpLevels.ts";
import { unlocksAppliedIn } from "../unlocks/launch.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { achievementsFlag } from "./achievementsFlag.ts";
import { replayWhatIsNew } from "./replay.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export async function achievementsApplyIn(ctx: QueryContext | MutationContext, workspace: string): Promise<boolean> {
  return (await workspaceDecision(ctx, achievementsFlag, workspace)) && (await xpLevelsShownIn(ctx, workspace)) && (await unlocksAppliedIn(ctx, workspace));
}

export async function achievementsLiveIn(ctx: MutationContext, workspace: string): Promise<boolean> {
  if (!(await achievementsApplyIn(ctx, workspace))) return false;
  if ((await bookLaunchIn(ctx, workspace)) === null) await ctx.tx.insert(bookLaunches).values({ ...ctx.newRow(), workspace, at: ctx.now });
  await replayWhatIsNew(ctx, workspace);
  return true;
}

export async function bookLaunchDueIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await achievementsApplyIn(ctx, workspace)) && (await bookLaunchIn(ctx, workspace)) === null;
}

export async function bookAppliesIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await achievementsApplyIn(ctx, workspace)) && (await bookLaunchedAt(ctx, workspace)) !== null;
}

export async function bookLaunchedAt(ctx: QueryContext, workspace: string): Promise<number | null> {
  return (await bookLaunchIn(ctx, workspace))?.at ?? null;
}

const byWorkspace = indexOrder(bookLaunches, ["workspace"]);

/** The workspace's one book launch, or `null`; two fail, as `.unique()` did. */
async function bookLaunchIn(ctx: QueryContext, workspace: string) {
  return unique("bookLaunches", await ctx.tx.select({ at: bookLaunches.at }).from(bookLaunches).where(eq(bookLaunches.workspace, workspace)).orderBy(...byWorkspace.orderBy()).limit(2));
}

export async function achievementsShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const { workspace } = await chatUserOf(ctx, member);
  if (!(await xpLevelsShownIn(ctx, workspace)) || !(await unlocksAppliedIn(ctx, workspace))) return false;
  const live = await achievementsLiveIn(ctx, workspace);
  await exposed(ctx, achievementsFlag, member, live);
  return live;
}
