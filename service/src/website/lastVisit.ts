// The member's last visit, as today's convex/website/lastVisit.ts: the newest thing the album put in, or the member
// received, that they have seen. `arrive` is today's member mutation `website.lastVisit.arrive`, a plain command handler
// `(ctx, me, person, args)` with its argument shape.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { newestDecidedSince } from "../activity/activity.ts";
import { albumShownTo } from "../album/flag.ts";
import { albumStickersOf } from "../album/stickers.ts";
import { teamStickersOf } from "../album/teamPages.ts";
import { newestDecidedReceivedBy } from "../engine/awards.ts";
import { talliesOf } from "../album/hoggies/collection.ts";
import { hiddenItemsShownTo } from "../album/items/flag.ts";
import { newestTurnOf } from "../album/items/ledger.ts";
import { firstThanksAwaitsItsMoment } from "../progression/firstThanks.ts";
import { lastVisits } from "../db/schema/index.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { unique } from "../db/unique.ts";
import type { HomeMember } from "../feedback/homes.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { xpMomentsShownTo } from "./xpMomentsFlag.ts";

export type ArrivalAnswer = { kind: "arrived"; lastVisit: number | null } | { kind: "refused" };

const mostStickersRead = 500;

export async function lastVisitOf(ctx: QueryContext, member: MemberId): Promise<number | null> {
  return (await storedLastVisitOf(ctx, member))?.at ?? null;
}

export async function moveLastVisitTo(ctx: MutationContext, member: MemberId, at: number): Promise<void> {
  const stored = await storedLastVisitOf(ctx, member);
  if (stored === null) await ctx.tx.insert(lastVisits).values({ ...ctx.newRow(), member, at } as typeof lastVisits.$inferInsert);
  else if (at > stored.at) await ctx.tx.update(lastVisits).set({ at }).where(eq(lastVisits._id, stored._id));
}

export async function lastVisitKeptFor(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await albumShownTo(ctx, member)) && ((await hiddenItemsShownTo(ctx, member)) || (await xpMomentsShownTo(ctx, member)));
}

export const arriveArgs = { from: z.union([z.number(), z.null()]) };

export async function arrive(ctx: MutationContext, me: VerifiedMember, _person: HomeMember, { from }: { from: number | null }): Promise<ArrivalAnswer> {
  if (!(await lastVisitKeptFor(ctx, me.member))) return { kind: "refused" };
  if ((await lastVisitOf(ctx, me.member)) !== from) return arrivedAt(await lastVisitOf(ctx, me.member));
  if (!(await activityAwaitsTheMoment(ctx, me.member, from))) await moveToTheNewestOf(ctx, me.member);
  return arrivedPastWhatWasPutIn(ctx, me.member);
}

export function arrivedAt(lastVisit: number | null): ArrivalAnswer {
  return { kind: "arrived", lastVisit };
}

export async function arrivedPastWhatWasPutIn(ctx: QueryContext, member: MemberId): Promise<ArrivalAnswer> {
  return arrivedAt(newestOf([await lastVisitOf(ctx, member), await newestPutInBy(ctx, member)]));
}

async function activityAwaitsTheMoment(ctx: QueryContext, member: MemberId, lastVisit: number | null): Promise<boolean> {
  if (!(await xpMomentsShownTo(ctx, member))) return false;
  if (lastVisit === null) return firstThanksAwaitsItsMoment(ctx, member, ctx.now);
  return (await newestDecidedSince(ctx, member, { above: lastVisit })) !== null;
}

async function moveToTheNewestOf(ctx: MutationContext, member: MemberId) {
  const newest = await newestPutInOrReceivedBy(ctx, member);
  if (newest !== null) await moveLastVisitTo(ctx, member, newest);
}

async function newestPutInOrReceivedBy(ctx: QueryContext, member: MemberId): Promise<number | null> {
  return newestOf([await newestPutInBy(ctx, member), await newestDecidedReceivedBy(ctx, member), await newestDecidedForTheMoment(ctx, member)]);
}

async function newestPutInBy(ctx: QueryContext, member: MemberId): Promise<number | null> {
  return newestOf([
    await newestTurnOf(ctx, member),
    ...(await albumStickersOf(ctx, member, mostStickersRead)).stickers.map(({ at }) => at),
    ...[...(await teamStickersOf(ctx, member)).values()].map(({ at }) => at),
    ...[...(await talliesOf(ctx, member)).values()].map(({ firstAt }) => firstAt),
  ]);
}

function newestOf(instants: (number | null)[]): number | null {
  const known = instants.filter((at) => at !== null);
  return known.length === 0 ? null : Math.max(...known);
}

async function newestDecidedForTheMoment(ctx: QueryContext, member: MemberId): Promise<number | null> {
  return (await xpMomentsShownTo(ctx, member)) ? newestDecidedSince(ctx, member, {}) : null;
}

const byMember = indexOrder(lastVisits, ["member"]);

/** The member's `lastVisits` row, or `null`; two fail, as `.unique()` did. */
async function storedLastVisitOf(ctx: QueryContext, member: MemberId) {
  const rows = await ctx.tx.select().from(lastVisits).where(eq(lastVisits.member, member)).orderBy(...byMember.orderBy()).limit(2);
  return unique("lastVisits", rows);
}
