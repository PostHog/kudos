// What a member's profile shows from their album: the newest kind note they received that still reads, and the people
// whose stickers they put in last. Today's convex/album/profile.ts.
import { newestReceivedBy, type NewestReceived } from "../engine/awards.ts";
import { wordsOf } from "../engine/kudosText.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { albumStickersOf, type AlbumSticker } from "./stickers.ts";
import type { QueryContext } from "../operations.ts";

export const kudosSearchedForAKindNote = 50;

export const newestPeopleShown = 4;

export type KindNote = NewestReceived;

export async function lastKindNoteTo(ctx: QueryContext, member: MemberId): Promise<KindNote | null> {
  for (const award of await newestReceivedBy(ctx, member, kudosSearchedForAKindNote)) {
    if (await isReadable(ctx, award.message)) return award;
  }
  return null;
}

async function isReadable(ctx: QueryContext, message: MessageRef) {
  return (await wordsOf(ctx, message)).kind === "text";
}

export async function newestStickersOf(ctx: QueryContext, member: MemberId, searched: number): Promise<AlbumSticker[]> {
  const { stickers } = await albumStickersOf(ctx, member, searched);
  return stickers.toSorted((one, other) => other.at - one.at).slice(0, newestPeopleShown);
}
