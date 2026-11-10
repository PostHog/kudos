// The album's people stickers: a member holds a sticker of each person they gave to, from a pack, the history or
// reactions, at most one each. Today's convex/album/stickers.ts over the service's transaction.
import { and, eq, gt } from "drizzle-orm";
import type { MemberId } from "../workspace/directory.ts";
import type { Id } from "../db/columns.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { albumStickers, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { allIn, firstIn, insertInto, uniqueIn } from "./rows.ts";

export type AlbumSticker = { person: MemberId; at: number };

type Sticker = Doc<"albumStickers">;

const byMemberPerson = indexOrder(albumStickers, ["member", "person"]);

export async function albumStickersOf(ctx: QueryContext, member: MemberId, atMost: number): Promise<{ stickers: AlbumSticker[]; more: boolean }> {
  const stickers = await allIn<Sticker>(ctx, albumStickers, byMemberPerson, eq(albumStickers.member, member), atMost + 1);
  return { stickers: stickers.slice(0, atMost).map(({ person, at }) => ({ person, at })), more: stickers.length > atMost };
}

export async function inTheAlbumOf(ctx: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  return (await stickerOf(ctx, member, person)) !== null;
}

export async function isPutInFrom(ctx: QueryContext, member: MemberId, person: MemberId, pack: Id<"thoughtfulPacks">): Promise<boolean> {
  const sticker = await stickerOf(ctx, member, person);
  return sticker?.from === "pack" && sticker.pack === pack;
}

export async function recordHistorySticker(ctx: MutationContext, member: MemberId, person: MemberId, at: number): Promise<void> {
  if (member === person || (await inTheAlbumOf(ctx, member, person))) return;
  await insertInto(ctx, albumStickers, { member, person, from: "history", at });
}

export async function recordReactionsSticker(ctx: MutationContext, member: MemberId, person: MemberId, at: number): Promise<void> {
  if (member === person || (await inTheAlbumOf(ctx, member, person))) return;
  await insertInto(ctx, albumStickers, { member, person, from: "reactions", at });
}

export async function recordPackSticker(ctx: MutationContext, member: MemberId, person: MemberId, pack: Id<"thoughtfulPacks">, at: number): Promise<boolean> {
  if (member === person || (await inTheAlbumOf(ctx, member, person))) return false;
  await insertInto(ctx, albumStickers, { member, person, from: "pack", pack, at });
  return true;
}

export async function peopleHeldBy(ctx: QueryContext, member: MemberId): Promise<Set<MemberId>> {
  const stickers = await allIn<Sticker>(ctx, albumStickers, byMemberPerson, eq(albumStickers.member, member));
  return new Set(stickers.map(({ person }) => person));
}

export async function nextStickerHolderAfter(ctx: QueryContext, after: MemberId | null): Promise<MemberId | null> {
  const next = await firstIn<Sticker>(ctx, albumStickers, byMemberPerson, after === null ? undefined : gt(albumStickers.member, after));
  return next?.member ?? null;
}

export async function holdsAnySticker(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await firstIn<Sticker>(ctx, albumStickers, byMemberPerson, eq(albumStickers.member, member))) !== null;
}

function stickerOf(ctx: QueryContext, member: MemberId, person: MemberId): Promise<Sticker | null> {
  return uniqueIn<Sticker>(ctx, albumStickers, byMemberPerson, and(eq(albumStickers.member, member), eq(albumStickers.person, person)));
}
