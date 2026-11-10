// A member's lifetime totals, what they gave and received in all, kept beside the awards as each one is inserted.
// Today's convex/engine/totals.ts over the service's transaction.
import { eq } from "drizzle-orm";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { kudosTotals, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Award } from "./awards.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export type LifetimeTotals = { given: number; received: number };

const byMember = indexOrder(kudosTotals, ["member"]);

export async function addToTotals(ctx: MutationContext, award: Award): Promise<void> {
  await add(ctx, award.giver, { given: award.kudos, received: 0 });
  await add(ctx, award.recipient, { given: 0, received: award.kudos });
}

export async function lifetimeTotals(ctx: QueryContext, member: MemberId): Promise<LifetimeTotals> {
  const totals = await totalsRow(ctx, member);
  return { given: totals?.given ?? 0, received: totals?.received ?? 0 };
}

async function add(ctx: MutationContext, member: MemberId, kudos: LifetimeTotals) {
  const totals = await totalsRow(ctx, member);
  if (totals === null) await ctx.tx.insert(kudosTotals).values(fromDocument(kudosTotals, { ...ctx.newRow(), member, ...kudos }) as typeof kudosTotals.$inferInsert);
  else await ctx.tx.update(kudosTotals).set({ given: totals.given + kudos.given, received: totals.received + kudos.received }).where(eq(kudosTotals._id, totals._id));
}

async function totalsRow({ tx }: QueryContext, member: MemberId): Promise<Doc<"kudosTotals"> | null> {
  const rows = await tx.select().from(kudosTotals).where(eq(kudosTotals.member, member)).orderBy(...byMember.orderBy()).limit(2);
  return unique("kudosTotals", rows.map((row) => toDocument<Doc<"kudosTotals">>(kudosTotals, row)));
}
