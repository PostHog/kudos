// A member's hoggie collection, as today's convex/album/hoggies/collection.ts: the catalogue with the member's tallies,
// the share of each rarity found, and the crests whose whole roster they hold.
import { eq } from "drizzle-orm";
import { toDocument } from "../../db/documents.ts";
import { indexOrder } from "../../db/indexOrder.ts";
import { hoggieTallies, type Doc } from "../../db/schema/index.ts";
import type { QueryContext } from "../../operations.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { catalogue, rarities, type CatalogueCrest, type CatalogueHoggie, type Rarity } from "./catalogue.ts";
import { lastFoundBy, type CrestArt, type CrestsShown, type Drop, type HoggieArt } from "./drops.ts";

export type HeldHoggie = CatalogueHoggie & { art: HoggieArt; count: number; firstAt: number | null };

export type RarityShare = { rarity: Rarity; chance: number; owned: number; total: number };

export type HeldCrest = { crest: string; name: string; art: CrestArt; roster: string[]; held: number; collectedAt: number | null };

export type Collection = { rarities: RarityShare[]; hoggies: HeldHoggie[]; owned: number; total: number; crests?: HeldCrest[] };

export type HoggiesHome = { owned: number; total: number; lastFound: Drop | null; crests: number | null };

type Tallies = Map<string, Doc<"hoggieTallies">>;

export async function collectionOf(ctx: QueryContext, member: MemberId, shown: CrestsShown): Promise<Collection> {
  const tallies = await talliesOf(ctx, member);
  const hoggies = catalogue.hoggies.map((entry) => heldOf(entry, tallies.get(entry.hoggie)));
  const held = hoggies.filter(({ count }) => count > 0);
  const shares = rarities.map(({ rarity, weight }) => ({ rarity, chance: weight, owned: countOf(held, rarity), total: countOf(hoggies, rarity) }));
  const collection = { rarities: shares, hoggies, owned: held.length, total: hoggies.length };
  return shown.crests ? { ...collection, crests: crestsHeldIn(tallies) } : collection;
}

export type CollectedCrest = { crest: string; collectedAt: number };

export async function hoggiesOf(ctx: QueryContext, member: MemberId, shown: CrestsShown, alsoHeld: string[] = []): Promise<HoggiesHome> {
  const tallies = await talliesOf(ctx, member);
  const owned = ownedIn(tallies);
  const crests = shown.crests ? new Set([...crestsCollectedIn(tallies).map(({ crest }) => crest), ...alsoHeld]).size : null;
  return { owned, total: catalogue.hoggies.length, lastFound: await lastFoundBy(ctx, member), crests };
}

export async function hoggiesOwnedBy(ctx: QueryContext, member: MemberId): Promise<number> {
  return ownedIn(await talliesOf(ctx, member));
}

function ownedIn(tallies: Tallies): number {
  return catalogue.hoggies.filter(({ hoggie }) => tallies.has(hoggie)).length;
}

export async function crestsCollectedBy(ctx: QueryContext, member: MemberId): Promise<CollectedCrest[]> {
  return crestsCollectedIn(await talliesOf(ctx, member));
}

function crestsCollectedIn(tallies: Tallies): CollectedCrest[] {
  return crestsHeldIn(tallies).flatMap(({ crest, collectedAt }) => (collectedAt === null ? [] : [{ crest, collectedAt }]));
}

function crestsHeldIn(tallies: Tallies): HeldCrest[] {
  return catalogue.crests.map((entry) => crestHeldIn(entry, tallies));
}

function crestHeldIn({ crest, name, roster }: CatalogueCrest, tallies: Tallies): HeldCrest {
  const held = roster.flatMap((hoggie) => tallies.get(hoggie) ?? []);
  const completing = held.length === roster.length ? held.reduce((latest, tally) => (tally.firstN > latest.firstN ? tally : latest)) : null;
  return { crest, name, art: { kind: "crest", slug: crest }, roster: [...roster], held: held.length, collectedAt: completing?.firstAt ?? null };
}

// The member's tallies by hoggie, at most one per catalogue entry, in `by_member_hoggie` order as Convex took them.
export async function talliesOf({ tx }: QueryContext, member: MemberId): Promise<Tallies> {
  const rows = await tx
    .select()
    .from(hoggieTallies)
    .where(eq(hoggieTallies.member, member))
    .orderBy(...indexOrder(hoggieTallies, ["member", "hoggie"]).orderBy())
    .limit(catalogue.hoggies.length);
  return new Map(rows.map((row) => toDocument<Doc<"hoggieTallies">>(hoggieTallies, row)).map((tally) => [tally.hoggie, tally]));
}

function heldOf({ hoggie, name, rarity }: CatalogueHoggie, tally: Doc<"hoggieTallies"> | undefined): HeldHoggie {
  return { hoggie, name, rarity, art: { kind: "hoggie", slug: hoggie }, count: tally?.count ?? 0, firstAt: tally?.firstAt ?? null };
}

function countOf(hoggies: HeldHoggie[], rarity: Rarity) {
  return hoggies.filter((entry) => entry.rarity === rarity).length;
}
