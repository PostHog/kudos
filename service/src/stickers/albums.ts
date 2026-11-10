// The module map's skeleton of convex/stickers/albums.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { GroupRef } from "../groups/groups.ts";
import type { MemberId, People } from "../workspace/directory.ts";
import type { HeldSticker } from "./records.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type PersonInAlbum = { person: MemberId; held: boolean };

export type Album = GroupRef & { mine: boolean; held: number; total: number; people: PersonInAlbum[] };

export type AlbumOwner = { member: MemberId; workspace: string };

export async function albumsOf(ctx: QueryContext, owner: AlbumOwner, people: People, stickers: HeldSticker[]): Promise<Album[]> {
  throw notPorted("stickers.albums.albumsOf");
}
