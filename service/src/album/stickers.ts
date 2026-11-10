// The module map's skeleton of convex/album/stickers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type AlbumSticker = { person: MemberId; at: number };

export async function albumStickersOf(ctx: QueryContext, member: MemberId, atMost: number): Promise<{ stickers: AlbumSticker[]; more: boolean }> {
  throw notPorted("album.stickers.albumStickersOf");
}

export async function inTheAlbumOf(ctx: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  throw notPorted("album.stickers.inTheAlbumOf");
}

export async function isPutInFrom(ctx: QueryContext, member: MemberId, person: MemberId, pack: Id<"thoughtfulPacks">): Promise<boolean> {
  throw notPorted("album.stickers.isPutInFrom");
}

export async function recordHistorySticker(ctx: MutationContext, member: MemberId, person: MemberId, at: number): Promise<void> {
  throw notPorted("album.stickers.recordHistorySticker");
}

export async function recordReactionsSticker(ctx: MutationContext, member: MemberId, person: MemberId, at: number): Promise<void> {
  throw notPorted("album.stickers.recordReactionsSticker");
}

export async function recordPackSticker(ctx: MutationContext, member: MemberId, person: MemberId, pack: Id<"thoughtfulPacks">, at: number): Promise<boolean> {
  throw notPorted("album.stickers.recordPackSticker");
}

export async function peopleHeldBy(ctx: QueryContext, member: MemberId): Promise<Set<MemberId>> {
  throw notPorted("album.stickers.peopleHeldBy");
}

export async function nextStickerHolderAfter(ctx: QueryContext, after: MemberId | null): Promise<MemberId | null> {
  throw notPorted("album.stickers.nextStickerHolderAfter");
}

export async function holdsAnySticker(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.stickers.holdsAnySticker");
}
