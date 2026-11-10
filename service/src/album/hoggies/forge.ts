// The hoggie forge, as today's convex/album/hoggies/forge.ts: spares of a held hoggie forged into a face-down item once
// per request, and the item's drop, a hoggie of the next rarity up the member doesn't hold yet where one is left.
import { eq } from "drizzle-orm";
import { hoggieTallies } from "../../db/schema/index.ts";
import type { Id } from "../../db/columns.ts";
import type { MutationContext } from "../../operations.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { earnedItemOf, earnItem } from "../items/ledger.ts";
import type { PageOwner } from "../teamPages.ts";
import { catalogue, forgedRarityOf, hoggieNamed, hoggiesOfRarity, sparesForged, type CatalogueHoggie, type Rarity } from "./catalogue.ts";
import { talliesOf } from "./collection.ts";
import type { CrateKey } from "./crateKey.ts";
import { pickOf } from "./draw.ts";
import { drawSecret, droppedIn, recordFind, tallyOf } from "./drops.ts";
import { highestForgedFor } from "./rarityCaps.ts";

const requestShape = /^[\w-]{1,64}$/;

export async function forge(ctx: MutationContext, owner: PageOwner, hoggie: string, request: string, at: number): Promise<Id<"items"> | null> {
  if (!requestShape.test(request)) return null;
  const key: CrateKey = `forge:${request}`;
  return (await earnedItemOf(ctx, owner.member, "hoggie", key))?._id ?? (await forgeAnew(ctx, owner, hoggie, key, at));
}

async function forgeAnew(ctx: MutationContext, { workspace, member }: PageOwner, hoggie: string, key: CrateKey, at: number): Promise<Id<"items"> | null> {
  const spent = await tallyOf(ctx, member, hoggie);
  if (spent === null || spent.count - 1 < sparesForged || forgedFrom(hoggie, await highestForgedFor(ctx, member)) === null) return null;
  await ctx.tx.update(hoggieTallies).set({ count: spent.count - sparesForged }).where(eq(hoggieTallies._id, spent._id));
  return earnItem(ctx, { workspace, member, source: "hoggie", key, reason: { kind: "forge", hoggie }, earnedAt: at });
}

export async function dropForged(ctx: MutationContext, member: MemberId, crate: CrateKey, from: string, at: number): Promise<void> {
  const rarity = forgedFrom(from, "legendary");
  if (rarity === null || (await droppedIn(ctx, member, crate))) return;
  const forged = await pickOf({ secret: drawSecret(), member, crate, version: catalogue.version, among: await forgeableAmong(ctx, member, hoggiesOfRarity(rarity)) });
  await recordFind(ctx, member, crate, forged, at, { surface: "website" });
}

async function forgeableAmong(ctx: MutationContext, member: MemberId, ofTheRarity: CatalogueHoggie[]): Promise<CatalogueHoggie[]> {
  const tallies = await talliesOf(ctx, member);
  const unheld = ofTheRarity.filter((entry) => !tallies.has(entry.hoggie));
  return unheld.length > 0 ? unheld : ofTheRarity;
}

function forgedFrom(hoggie: string, upTo: Rarity) {
  const rarity = hoggieNamed(hoggie)?.rarity;
  return rarity === undefined ? null : forgedRarityOf(rarity, upTo);
}
