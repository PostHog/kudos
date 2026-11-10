// The album's stickers of people, as today's convex/album/stickers.ts: one per member and person, never of oneself, put
// in from history, reactions or a thoughtful pack, and read in `by_member_person` order.
import { and, eq, gt, type SQL } from "drizzle-orm";
import type { Id } from "../db/columns.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { albumStickers } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";

export type AlbumSticker = { person: MemberId; at: number };

const byMemberPerson = indexOrder(albumStickers, ["member", "person"]);

export async function albumStickersOf({ tx }: QueryContext, member: MemberId, atMost: number): Promise<{ stickers: AlbumSticker[]; more: boolean }> {
  const stickers = await stickersIn(tx, eq(albumStickers.member, member), atMost + 1);
  return { stickers: stickers.slice(0, atMost).map(({ person, at }) => ({ person, at })), more: stickers.length > atMost };
}

export async function inTheAlbumOf({ tx }: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  return (await stickerOf(tx, member, person)) !== null;
}

export async function isPutInFrom({ tx }: QueryContext, member: MemberId, person: MemberId, pack: Id<"thoughtfulPacks">): Promise<boolean> {
  const sticker = await stickerOf(tx, member, person);
  return sticker?.from === "pack" && sticker.pack === pack;
}

export async function recordHistorySticker(ctx: MutationContext, member: MemberId, person: MemberId, at: number): Promise<void> {
  if (member === person || (await inTheAlbumOf(ctx, member, person))) return;
  await ctx.tx.insert(albumStickers).values({ ...ctx.newRow(), member, person, from: "history", at });
}

export async function recordReactionsSticker(ctx: MutationContext, member: MemberId, person: MemberId, at: number): Promise<void> {
  if (member === person || (await inTheAlbumOf(ctx, member, person))) return;
  await ctx.tx.insert(albumStickers).values({ ...ctx.newRow(), member, person, from: "reactions", at });
}

export async function recordPackSticker(ctx: MutationContext, member: MemberId, person: MemberId, pack: Id<"thoughtfulPacks">, at: number): Promise<boolean> {
  if (member === person || (await inTheAlbumOf(ctx, member, person))) return false;
  await ctx.tx.insert(albumStickers).values({ ...ctx.newRow(), member, person, from: "pack", pack, at });
  return true;
}

export async function peopleHeldBy({ tx }: QueryContext, member: MemberId): Promise<Set<MemberId>> {
  const stickers = await stickersIn(tx, eq(albumStickers.member, member));
  return new Set(stickers.map(({ person }) => person));
}

export async function nextStickerHolderAfter({ tx }: QueryContext, after: MemberId | null): Promise<MemberId | null> {
  const [next] = await stickersIn(tx, after === null ? undefined : gt(albumStickers.member, after), 1);
  return next?.member ?? null;
}

export async function holdsAnySticker({ tx }: QueryContext, member: MemberId): Promise<boolean> {
  return (await stickersIn(tx, eq(albumStickers.member, member), 1)).length > 0;
}

function stickersIn(tx: Transaction, where: SQL | undefined, limit?: number) {
  const stickers = tx
    .select({ member: albumStickers.member, person: albumStickers.person, at: albumStickers.at })
    .from(albumStickers)
    .where(where)
    .orderBy(...byMemberPerson.orderBy());
  return limit === undefined ? stickers : stickers.limit(limit);
}

async function stickerOf(tx: Transaction, member: MemberId, person: MemberId) {
  const rows = await tx
    .select({ from: albumStickers.from, pack: albumStickers.pack })
    .from(albumStickers)
    .where(and(eq(albumStickers.member, member), eq(albumStickers.person, person)))
    .limit(2);
  return unique("albumStickers", rows);
}
