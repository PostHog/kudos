// Who paid a recipient their receiving coins this week, so each giver pays them once and at most ten givers a week do.
// Today's convex/progression/receiving.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import type { KudosGivenEvent } from "../bus/events.ts";
import { allowanceDay, weekOf, type DayKey } from "../engine/allowance.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { members, receivingGivers } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import { catalogue } from "./catalogue.ts";
import { noReceiving, type EffectsRecord, type Receiving } from "./progress.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export type ReceivingWeek = Receiving & { recipient: MemberId; week: DayKey };

const byRecipientWeek = indexOrder(receivingGivers, ["recipient", "week"]);

export async function receivingWeekOf(ctx: QueryContext, { giver, at }: KudosGivenEvent, member: MemberId): Promise<ReceivingWeek | null> {
  if (member === giver) return null;
  const [recipient] = await ctx.tx.select({ kind: members.kind, timeZone: members.timeZone }).from(members).where(eq(members._id, member));
  const timeZone = recipient?.kind === "member" ? (recipient.timeZone ?? undefined) : undefined;
  const week = weekOf(allowanceDay(at, timeZone)).monday;
  const paid = await ctx.tx
    .select({ giver: receivingGivers.giver })
    .from(receivingGivers)
    .where(and(eq(receivingGivers.recipient, member), eq(receivingGivers.week, week)))
    .orderBy(...byRecipientWeek.orderBy())
    .limit(catalogue.coins.receivingGiversAWeek);
  return { recipient: member, week, paidBy: paid.map(({ giver }) => giver) };
}

export function receivingOf(week: ReceivingWeek | null): Receiving {
  return week === null ? noReceiving : { paidBy: week.paidBy };
}

export async function recordReceiving(ctx: MutationContext, week: ReceivingWeek | null, giver: MemberId, effects: EffectsRecord[]): Promise<void> {
  if (week === null || !effects.some(({ coins = [] }) => coins.some(({ source }) => source === "receiving"))) return;
  await ctx.tx.insert(receivingGivers).values({ ...ctx.newRow(), recipient: week.recipient, week: week.week, giver });
}
