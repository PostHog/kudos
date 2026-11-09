// A member's analytics ID, as today's convex/analytics/person.ts reads and makes it. The person events and the jobs
// that send them are S14's: `identifyNewPeopleLater` is their seam.
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { Id } from "../db/columns.ts";
import { analyticsIds } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

type MemberId = Id<"members">;

/** The member's analytics ID, made the first time it is needed. */
export async function analyticsIdOf(ctx: MutationContext, member: MemberId): Promise<string> {
  return (await existingAnalyticsId(ctx, member)) ?? recordAnalyticsId(ctx, member, randomUUID());
}

export async function recordAnalyticsId(ctx: MutationContext, member: MemberId, analyticsId: string): Promise<string> {
  await ctx.tx.insert(analyticsIds).values({ ...ctx.newRow(), member, analyticsId });
  await identifyNewPeopleLater(ctx);
  return analyticsId;
}

/** The oldest analytics ID stored for the member, or `null`; a member with two never fails a read. */
export async function existingAnalyticsId(ctx: QueryContext, member: MemberId): Promise<string | null> {
  const [row] = await ctx.tx
    .select({ analyticsId: analyticsIds.analyticsId })
    .from(analyticsIds)
    .where(eq(analyticsIds.member, member))
    .orderBy(asc(analyticsIds._creationTime), asc(analyticsIds._id))
    .limit(1);
  return row?.analyticsId ?? null;
}

/**
 * S14's seam: today this schedules the one identify job a new analytics ID's $identify waits for, while capture is
 * on and no other ID waits. Until S14 registers that job, a new ID waits here with nothing scheduled.
 */
async function identifyNewPeopleLater(_ctx: MutationContext): Promise<void> {}
