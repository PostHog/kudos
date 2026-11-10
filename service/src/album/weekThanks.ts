// What a member's week and pair tallies say about thanks: the hoggies found in a week, and how many teammates the
// member has thanked. Today's convex/album/weekThanks.ts over the service's transaction.
import { eq } from "drizzle-orm";
import type { DayKey } from "../engine/allowance.ts";
import { pairTallies } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { weekRowOf } from "./tallies.ts";

export async function hoggiesFoundIn(ctx: QueryContext, member: MemberId, week: DayKey): Promise<number> {
  const found = (await weekRowOf(ctx, member, week))?.hoggiesFound;
  return found === undefined ? 0 : found.hoggies.length + found.more;
}

/**
 * The teammates the member has given kudos or hugs to. The sum is compared here, as today, not in SQL: Postgres holds
 * NaN greater than every number, where JavaScript's comparison with NaN is false.
 */
export async function teammatesThankedBy(ctx: QueryContext, member: MemberId): Promise<number> {
  const pairs = await ctx.tx.select({ kudosGiven: pairTallies.kudosGiven, hugsGiven: pairTallies.hugsGiven }).from(pairTallies).where(eq(pairTallies.member, member));
  return pairs.filter(({ kudosGiven, hugsGiven }) => kudosGiven + hugsGiven > 0).length;
}
