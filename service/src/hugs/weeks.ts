// Each member's hugs by week: given and received, their XP, and the message hugged most; and each message's hug count.
// Today's convex/hugs/weeks.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { allowanceDay, weekOf, type DayKey } from "../engine/allowance.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { timeZoneOf, type MemberId } from "../workspace/directory.ts";
import type { Hug } from "./records.ts";
import { hugXp } from "./xp.ts";
import type { PageOptions } from "../db/page.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { encodeStored } from "../db/codec.ts";
import { hugCounts, hugWeekMessages, hugWeeks, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type HugWeek = Doc<"hugWeeks">;

export type MostHugged = NonNullable<HugWeek["mostHugged"]>;

type CountedHug = MessageRef & { giver: MemberId; day: DayKey };

const weekByMemberWeek = indexOrder(hugWeeks, ["member", "week"]);
const weekMessageByMemberWeekMessage = indexOrder(hugWeekMessages, ["member", "week", "conversation", "message"]);
const countByMessage = indexOrder(hugCounts, ["workspace", "conversation", "message"]);

export async function countHugGiven(ctx: MutationContext, hug: CountedHug): Promise<void> {
  const week = await weekRowOf(ctx, hug.workspace, hug.giver, weekOf(hug.day).monday);
  await ctx.tx.update(hugWeeks).set({ given: week.given + 1, givenXp: week.givenXp + hugXp }).where(eq(hugWeeks._id, week._id));
  await countHugOnTheMessage(ctx, hug);
}

export type HugWeeksPage = { weeks: HugWeek[]; next: string | null };

// Waits on the shared keyset paging S11 lands in service/src/db/ (no stack builds its own).
export async function hugWeeksSince(ctx: QueryContext, since: DayKey, page: PageOptions): Promise<HugWeeksPage> {
  throw notPorted("hugs.weeks.hugWeeksSince");
}

export async function weekOfPersonAt(ctx: QueryContext, person: MemberId, at: number): Promise<DayKey> {
  const timeZone = (await timeZoneOf(ctx, person)) ?? undefined;
  return weekOf(allowanceDay(at, timeZone)).monday;
}

export async function countHugReceived(ctx: MutationContext, hug: Hug, person: MemberId): Promise<void> {
  const week = await weekRowOf(ctx, hug.workspace, person, await weekOfPersonAt(ctx, person, hug.at));
  const onTheMessage = await countHugOnTheMessageFor(ctx, person, week.week, hug);
  const mostHugged = mostHuggedOf(week.mostHugged, onTheMessage);
  await ctx.tx
    .update(hugWeeks)
    .set({ received: week.received + 1, receivedXp: week.receivedXp + hugXp, mostHugged: encodeStored(mostHugged) })
    .where(eq(hugWeeks._id, week._id));
}

function mostHuggedOf(current: MostHugged | undefined, candidate: MostHugged): MostHugged {
  if (current === undefined || candidate.hugs > current.hugs) return candidate;
  return candidate.hugs === current.hugs && candidate.lastAt >= current.lastAt ? candidate : current;
}

async function weekRowOf(ctx: MutationContext, workspace: string, member: MemberId, week: DayKey): Promise<HugWeek> {
  const rows = await ctx.tx
    .select()
    .from(hugWeeks)
    .where(and(eq(hugWeeks.member, member), eq(hugWeeks.week, week)))
    .orderBy(...weekByMemberWeek.orderBy())
    .limit(2);
  const existing = unique("hugWeeks", rows);
  if (existing !== null) return toDocument<HugWeek>(hugWeeks, existing);
  const created: HugWeek = { ...ctx.newRow(), workspace, member, week, given: 0, givenXp: 0, received: 0, receivedXp: 0 } as HugWeek;
  await ctx.tx.insert(hugWeeks).values(fromDocument(hugWeeks, created) as typeof hugWeeks.$inferInsert);
  return created;
}

async function countHugOnTheMessageFor(ctx: MutationContext, member: MemberId, week: DayKey, { conversation, message, at }: Hug): Promise<MostHugged> {
  const rows = await ctx.tx
    .select()
    .from(hugWeekMessages)
    .where(and(eq(hugWeekMessages.member, member), eq(hugWeekMessages.week, week), eq(hugWeekMessages.conversation, conversation), eq(hugWeekMessages.message, message)))
    .orderBy(...weekMessageByMemberWeekMessage.orderBy())
    .limit(2);
  const row = unique("hugWeekMessages", rows);
  const counted = { hugs: (row?.hugs ?? 0) + 1, lastAt: Math.max(row?.lastAt ?? at, at) };
  if (row === null) await ctx.tx.insert(hugWeekMessages).values(fromDocument(hugWeekMessages, { ...ctx.newRow(), member, week, conversation, message, ...counted }) as typeof hugWeekMessages.$inferInsert);
  else await ctx.tx.update(hugWeekMessages).set(counted).where(eq(hugWeekMessages._id, row._id));
  return { conversation, message, ...counted };
}

async function countHugOnTheMessage(ctx: MutationContext, { workspace, conversation, message }: MessageRef): Promise<void> {
  const row = await hugCountRow(ctx, { workspace, conversation, message });
  if (row === null) await ctx.tx.insert(hugCounts).values(fromDocument(hugCounts, { ...ctx.newRow(), workspace, conversation, message, hugs: 1 }) as typeof hugCounts.$inferInsert);
  else await ctx.tx.update(hugCounts).set({ hugs: row.hugs + 1 }).where(eq(hugCounts._id, row._id));
}

export async function hugsOnTheMessage(ctx: QueryContext, message: MessageRef): Promise<number> {
  return (await hugCountRow(ctx, message))?.hugs ?? 0;
}

async function hugCountRow(ctx: QueryContext, { workspace, conversation, message }: MessageRef) {
  const rows = await ctx.tx
    .select({ _id: hugCounts._id, hugs: hugCounts.hugs })
    .from(hugCounts)
    .where(and(eq(hugCounts.workspace, workspace), eq(hugCounts.conversation, conversation), eq(hugCounts.message, message)))
    .orderBy(...countByMessage.orderBy())
    .limit(2);
  return unique("hugCounts", rows);
}
