// Stickers of people, as today's convex/stickers/records.ts: a giver and a recipient each hold the other's sticker from
// the first award between them, recorded once, and a member's stickers read newest first.
import { and, eq } from "drizzle-orm";
import { indexOrder } from "../db/indexOrder.ts";
import { stickers } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { awardIdValidator, earliestAwardFrom, type AwardId, type EarliestAward } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const stickerValidator = z.strictObject({
  member: zv.id("members"),
  person: zv.id("members"),
  firstAward: awardIdValidator,
  firstAt: zv.number(),
});

export const stickerBackfillValidator = z.strictObject({
  workspace: z.string(),
  cursor: z.union([z.string(), z.null()]),
  isDone: z.boolean(),
});

export type HeldSticker = { person: MemberId; firstAward: AwardId; firstAt: number };

export type Pair = { giver: MemberId; recipient: MemberId };

export type CollectedSticker = { collector: MemberId; person: MemberId; firstAward: AwardId; firstGiver: MemberId };

type FirstAward = EarliestAward & { giver: MemberId };

export async function recordStickersOf(ctx: MutationContext, { giver, recipient }: Pair): Promise<CollectedSticker[]> {
  if (giver === recipient) return [];
  const missing = await stickersMissingOf(ctx, [
    { member: giver, person: recipient },
    { member: recipient, person: giver },
  ]);
  if (missing.length === 0) return [];
  const first = await earliestAwardBetween(ctx, giver, recipient);
  if (first === null) return [];
  for (const owner of missing) await ctx.tx.insert(stickers).values({ ...ctx.newRow(), ...owner, firstAward: first.award, firstAt: first.at });
  return missing.map(({ member, person }) => ({ collector: member, person, firstAward: first.award, firstGiver: first.giver }));
}

// `by_member_firstAt` walked descending: the newest first sticker first, as Convex collected it.
export async function stickersNewestFirst({ tx }: QueryContext, member: MemberId): Promise<HeldSticker[]> {
  return tx
    .select({ person: stickers.person, firstAward: stickers.firstAward, firstAt: stickers.firstAt })
    .from(stickers)
    .where(eq(stickers.member, member))
    .orderBy(...indexOrder(stickers, ["member", "firstAt"]).orderBy("desc"));
}

type Owner = { member: MemberId; person: MemberId };

async function stickersMissingOf(ctx: QueryContext, owners: Owner[]): Promise<Owner[]> {
  const missing: Owner[] = [];
  for (const owner of owners) if (!(await holds(ctx, owner))) missing.push(owner);
  return missing;
}

async function holds({ tx }: QueryContext, { member, person }: Owner) {
  const rows = await tx.select({ _id: stickers._id }).from(stickers).where(and(eq(stickers.member, member), eq(stickers.person, person))).limit(2);
  return unique("stickers", rows) !== null;
}

async function earliestAwardBetween(ctx: QueryContext, one: MemberId, other: MemberId): Promise<FirstAward | null> {
  const [given, received] = await Promise.all([firstAwardFrom(ctx, one, other), firstAwardFrom(ctx, other, one)]);
  if (given === null || received === null) return given ?? received;
  return given.created <= received.created ? given : received;
}

async function firstAwardFrom(ctx: QueryContext, giver: MemberId, recipient: MemberId): Promise<FirstAward | null> {
  const earliest = await earliestAwardFrom(ctx, giver, recipient);
  return earliest === null ? null : { ...earliest, giver };
}
