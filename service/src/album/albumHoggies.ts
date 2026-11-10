// The module map's skeleton of convex/album/albumHoggies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { rarities, type Rarity } from "./hoggies/catalogue.ts";
import { type HeldHoggie } from "./hoggies/collection.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const rarestFindsShown = 5;

export type AlbumHoggie = HeldHoggie & { found: boolean; spares: number };

export type AlbumRarity = { rarity: Rarity; chance: number; found: number; total: number };

export type AlbumHoggies = { hoggies: AlbumHoggie[]; rarities: AlbumRarity[]; found: number; total: number; rarest: AlbumHoggie[] };

const rarestFirst = rarities.map(({ rarity }) => rarity).toReversed();

export async function albumHoggiesOf(ctx: QueryContext, member: MemberId): Promise<AlbumHoggies> {
  throw notPorted("album.albumHoggies.albumHoggiesOf");
}

export function rarestFindsIn<Found extends Pick<AlbumHoggie, "found" | "firstAt" | "rarity">>(hoggies: Found[], most: number): Array<Found & { firstAt: number }> {
  return hoggies
    .filter((hoggie): hoggie is Found & { firstAt: number } => hoggie.found && hoggie.firstAt !== null)
    .toSorted((one, other) => rarestFirst.indexOf(one.rarity) - rarestFirst.indexOf(other.rarity) || other.firstAt - one.firstAt)
    .slice(0, most);
}
