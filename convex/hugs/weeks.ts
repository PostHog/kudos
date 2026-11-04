import type { PaginationOptions } from "convex/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { allowanceDay, weekOf, type DayKey } from "../engine/allowance";
import type { MessageRef } from "../engine/messageEvent";
import { timeZoneOf, type MemberId } from "../workspace/directory";
import type { Hug } from "./records";
import { hugXp } from "./xp";

export type HugWeek = Doc<"hugWeeks">;

export type MostHugged = NonNullable<HugWeek["mostHugged"]>;

type CountedHug = MessageRef & { giver: MemberId; day: DayKey };

export async function countHugGiven(ctx: MutationCtx, hug: CountedHug) {
  const week = await weekRowOf(ctx, hug.workspace, hug.giver, weekOf(hug.day).monday);
  await ctx.db.patch(week._id, { given: week.given + 1, givenXp: week.givenXp + hugXp });
  await countHugOnTheMessage(ctx, hug);
}

export type HugWeeksPage = { weeks: HugWeek[]; next: string | null };

export async function hugWeeksSince(ctx: QueryCtx, since: DayKey, page: PaginationOptions): Promise<HugWeeksPage> {
  const { page: weeks, isDone, continueCursor } = await ctx.db
    .query("hugWeeks")
    .withIndex("by_week", (q) => q.gte("week", since))
    .paginate(page);
  return { weeks, next: isDone ? null : continueCursor };
}

export async function weekOfPersonAt(ctx: QueryCtx, person: MemberId, at: number): Promise<DayKey> {
  const timeZone = (await timeZoneOf(ctx, person)) ?? undefined;
  return weekOf(allowanceDay(at, timeZone)).monday;
}

export async function countHugReceived(ctx: MutationCtx, hug: Hug, person: MemberId) {
  const week = await weekRowOf(ctx, hug.workspace, person, await weekOfPersonAt(ctx, person, hug.at));
  const onTheMessage = await countHugOnTheMessageFor(ctx, person, week.week, hug);
  await ctx.db.patch(week._id, { received: week.received + 1, receivedXp: week.receivedXp + hugXp, mostHugged: mostHuggedOf(week.mostHugged, onTheMessage) });
}

function mostHuggedOf(current: MostHugged | undefined, candidate: MostHugged): MostHugged {
  if (current === undefined || candidate.hugs > current.hugs) return candidate;
  return candidate.hugs === current.hugs && candidate.lastAt >= current.lastAt ? candidate : current;
}

async function weekRowOf(ctx: MutationCtx, workspace: string, member: MemberId, week: DayKey): Promise<HugWeek> {
  const existing = await ctx.db
    .query("hugWeeks")
    .withIndex("by_member_week", (q) => q.eq("member", member).eq("week", week))
    .unique();
  if (existing !== null) return existing;
  const id = await ctx.db.insert("hugWeeks", { workspace, member, week, given: 0, givenXp: 0, received: 0, receivedXp: 0 });
  return (await ctx.db.get(id))!;
}

async function countHugOnTheMessageFor(ctx: MutationCtx, member: MemberId, week: DayKey, { conversation, message, at }: Hug): Promise<MostHugged> {
  const row = await ctx.db
    .query("hugWeekMessages")
    .withIndex("by_member_week_message", (q) => q.eq("member", member).eq("week", week).eq("conversation", conversation).eq("message", message))
    .unique();
  const counted = { hugs: (row?.hugs ?? 0) + 1, lastAt: Math.max(row?.lastAt ?? at, at) };
  if (row === null) await ctx.db.insert("hugWeekMessages", { member, week, conversation, message, ...counted });
  else await ctx.db.patch(row._id, counted);
  return { conversation, message, ...counted };
}

async function countHugOnTheMessage(ctx: MutationCtx, { workspace, conversation, message }: MessageRef) {
  const row = await hugCountRow(ctx, { workspace, conversation, message });
  if (row === null) await ctx.db.insert("hugCounts", { workspace, conversation, message, hugs: 1 });
  else await ctx.db.patch(row._id, { hugs: row.hugs + 1 });
}

export async function hugsOnTheMessage(ctx: QueryCtx, message: MessageRef): Promise<number> {
  return (await hugCountRow(ctx, message))?.hugs ?? 0;
}

function hugCountRow(ctx: QueryCtx, { workspace, conversation, message }: MessageRef) {
  return ctx.db
    .query("hugCounts")
    .withIndex("by_message", (q) => q.eq("workspace", workspace).eq("conversation", conversation).eq("message", message))
    .unique();
}
