// When each member's quests began: the first kudos or hug they gave on the Monday path. Nothing before it counts.
// Today's convex/quests/start.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { questStarts } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { unique } from "../db/unique.ts";

const byMember = indexOrder(questStarts, ["member"]);

export async function startQuests(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  if ((await questStartOf(ctx, member)) === null) await ctx.tx.insert(questStarts).values({ ...ctx.newRow(), member, at });
}

/** The member's start, or `null`; two starts fail, as `.unique()` did. */
export async function questStartOf(ctx: QueryContext, member: MemberId): Promise<number | null> {
  const rows = await ctx.tx.select({ at: questStarts.at }).from(questStarts).where(eq(questStarts.member, member)).orderBy(...byMember.orderBy()).limit(2);
  return unique("questStarts", rows)?.at ?? null;
}
