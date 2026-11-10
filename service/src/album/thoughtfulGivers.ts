// How many people gave a thoughtful kudos this week, counted once each, and shown from three.
// Today's convex/album/thoughtfulGivers.ts over the service's transaction, the app's clock in place of Date.now().
import { and, eq } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { thoughtfulGiverCounts, type Doc } from "../db/schema/index.ts";
import { allowanceDay } from "../engine/allowance.ts";
import { keyOf, type PeriodKey } from "../leaderboard/periods.ts";
import { teasersShownTo } from "./items/flag.ts";
import { insertInto, uniqueIn } from "./rows.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const fewestThoughtfulGiversShown = 3;

export type NormViewer = { workspace: string; member: MemberId; timeZone: string | undefined };

export async function countThoughtfulGiver(ctx: MutationContext, workspace: string, week: PeriodKey): Promise<void> {
  const counted = await countOf(ctx, workspace, week);
  if (counted === null) await insertInto(ctx, thoughtfulGiverCounts, { workspace, week, givers: 1 });
  else await ctx.tx.update(thoughtfulGiverCounts).set({ givers: counted.givers + 1 }).where(eq(thoughtfulGiverCounts._id, counted._id));
}

const byWorkspaceWeek = indexOrder(thoughtfulGiverCounts, ["workspace", "week"]);

function countOf(ctx: QueryContext, workspace: string, week: PeriodKey) {
  const where = and(eq(thoughtfulGiverCounts.workspace, workspace), eq(thoughtfulGiverCounts.week, week));
  return uniqueIn<Doc<"thoughtfulGiverCounts">>(ctx, thoughtfulGiverCounts, byWorkspaceWeek, where);
}

export async function thoughtfulGiversShownTo(ctx: QueryContext, viewer: NormViewer): Promise<number | null> {
  return (await teasersShownTo(ctx, viewer.member)) ? thoughtfulGiversThisWeek(ctx, viewer) : null;
}

export async function thoughtfulGiversThisWeek(ctx: QueryContext, { workspace, timeZone }: Omit<NormViewer, "member">): Promise<number | null> {
  const givers = (await countOf(ctx, workspace, keyOf("week", allowanceDay(ctx.now, timeZone))))?.givers ?? 0;
  return givers < fewestThoughtfulGiversShown ? null : givers;
}
