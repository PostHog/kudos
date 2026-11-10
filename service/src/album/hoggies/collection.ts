// The module map's skeleton of convex/album/hoggies/collection.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../../workspace/directory.ts";
import { type CatalogueHoggie, type Rarity } from "./catalogue.ts";
import { type CrestArt, type CrestsShown, type Drop, type HoggieArt } from "./drops.ts";
import type { Doc } from "../../db/schema/index.ts";
import type { QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export type HeldHoggie = CatalogueHoggie & { art: HoggieArt; count: number; firstAt: number | null };

export type RarityShare = { rarity: Rarity; chance: number; owned: number; total: number };

export type HeldCrest = { crest: string; name: string; art: CrestArt; roster: string[]; held: number; collectedAt: number | null };

export type Collection = { rarities: RarityShare[]; hoggies: HeldHoggie[]; owned: number; total: number; crests?: HeldCrest[] };

export type HoggiesHome = { owned: number; total: number; lastFound: Drop | null; crests: number | null };

type Tallies = Map<string, Doc<"hoggieTallies">>;

export async function collectionOf(ctx: QueryContext, member: MemberId, shown: CrestsShown): Promise<Collection> {
  throw notPorted("album.hoggies.collection.collectionOf");
}

export type CollectedCrest = { crest: string; collectedAt: number };

export async function hoggiesOf(ctx: QueryContext, member: MemberId, shown: CrestsShown, alsoHeld: string[] = []): Promise<HoggiesHome> {
  throw notPorted("album.hoggies.collection.hoggiesOf");
}

export async function hoggiesOwnedBy(ctx: QueryContext, member: MemberId): Promise<number> {
  throw notPorted("album.hoggies.collection.hoggiesOwnedBy");
}

export async function crestsCollectedBy(ctx: QueryContext, member: MemberId): Promise<CollectedCrest[]> {
  throw notPorted("album.hoggies.collection.crestsCollectedBy");
}

export async function talliesOf(ctx: QueryContext, member: MemberId): Promise<Tallies> {
  throw notPorted("album.hoggies.collection.talliesOf");
}
