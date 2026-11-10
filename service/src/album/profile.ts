// The module map's skeleton of convex/album/profile.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type NewestReceived } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import { type AlbumSticker } from "./stickers.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const kudosSearchedForAKindNote = 50;

export const newestPeopleShown = 4;

export type KindNote = NewestReceived;

export async function lastKindNoteTo(ctx: QueryContext, member: MemberId): Promise<KindNote | null> {
  throw notPorted("album.profile.lastKindNoteTo");
}

export async function newestStickersOf(ctx: QueryContext, member: MemberId, searched: number): Promise<AlbumSticker[]> {
  throw notPorted("album.profile.newestStickersOf");
}
