// The sticker book's group albums, as today's convex/stickers/albums.ts: each counting group with the stickers held of
// its people, the owner's own groups first.
import { countingGroupsWithPeopleIn, type CountingGroup, type GroupRef } from "../groups/groups.ts";
import type { MemberId, People } from "../workspace/directory.ts";
import type { HeldSticker } from "./records.ts";
import type { QueryContext } from "../operations.ts";

export type PersonInAlbum = { person: MemberId; held: boolean };

export type Album = GroupRef & { mine: boolean; held: number; total: number; people: PersonInAlbum[] };

export type AlbumOwner = { member: MemberId; workspace: string };

export async function albumsOf(ctx: QueryContext, owner: AlbumOwner, people: People, stickers: HeldSticker[]): Promise<Album[]> {
  const held = new Set(stickers.map(({ person }) => person));
  const groups = await countingGroupsWithPeopleIn(ctx, owner.workspace, people);
  return groups.map((group) => albumOf(owner.member, group, held)).toSorted(ownFirstThenByName);
}

function albumOf(owner: MemberId, { group, name, people }: CountingGroup, held: Set<MemberId>): Album {
  const others = people.filter((person) => person !== owner).map((person) => ({ person, held: held.has(person) }));
  return { group, name, mine: others.length < people.length, held: others.filter((person) => person.held).length, total: others.length, people: others };
}

function ownFirstThenByName(first: Album, second: Album) {
  return Number(second.mine) - Number(first.mine) || first.name.localeCompare(second.name);
}
