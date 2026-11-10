// A kudos's shared find: the rarest epic or legendary hoggie its giver turned in the crates of the packs that kudos
// granted. Today's convex/album/items/finds.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import type { MessageRef } from "../../engine/messageEvent.ts";
import type { Rarity } from "../hoggies/catalogue.ts";
import { foundIn } from "../hoggies/drops.ts";
import { crateKeyOf } from "../packs.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { isTurned } from "./ledger.ts";
import { toDocument } from "../../db/documents.ts";
import { indexOrder } from "../../db/indexOrder.ts";
import { thoughtfulPacks, type Doc } from "../../db/schema/index.ts";
import type { QueryContext } from "../../operations.ts";

export const mostPacksOfAKudosRead = 50;

const sharedRaritiesRarestFirst = ["legendary", "epic"] as const satisfies Rarity[];

export type SharedRarity = (typeof sharedRaritiesRarestFirst)[number];

export type Find = { name: string; rarity: SharedRarity };

export type GrantedKudos = { giver: MemberId; message: MessageRef; at: number };

const byGiverAt = indexOrder(thoughtfulPacks, ["giver", "at"]);

export async function turnedFindOf(ctx: QueryContext, kudos: GrantedKudos): Promise<Find | null> {
  let rarest: Find | null = null;
  for (const crate of await cratesOf(ctx, kudos)) {
    const find = await turnedSharedFindIn(ctx, kudos.giver, crate);
    if (find !== null && (rarest === null || isRarer(find, rarest))) rarest = find;
  }
  return rarest;
}

async function cratesOf(ctx: QueryContext, { giver, message, at }: GrantedKudos) {
  const rows = await ctx.tx
    .select()
    .from(thoughtfulPacks)
    .where(and(eq(thoughtfulPacks.giver, giver), eq(thoughtfulPacks.at, at)))
    .orderBy(...byGiverAt.orderBy())
    .limit(mostPacksOfAKudosRead);
  const packs = rows.map((row) => toDocument<Doc<"thoughtfulPacks">>(thoughtfulPacks, row));
  return packs.filter((pack) => pack.message.conversation === message.conversation && pack.message.message === message.message).map(({ _id }) => crateKeyOf(_id));
}

async function turnedSharedFindIn(ctx: QueryContext, giver: MemberId, crate: ReturnType<typeof crateKeyOf>): Promise<Find | null> {
  if (!(await isTurned(ctx, giver, "hoggie", crate))) return null;
  const drop = await foundIn(ctx, giver, crate, { crests: false });
  return drop !== null && isShared(drop.rarity) ? { name: drop.name, rarity: drop.rarity } : null;
}

export function isShared(rarity: Rarity): rarity is SharedRarity {
  return (sharedRaritiesRarestFirst as readonly Rarity[]).includes(rarity);
}

function isRarer(one: Find, other: Find) {
  return sharedRaritiesRarestFirst.indexOf(one.rarity) < sharedRaritiesRarestFirst.indexOf(other.rarity);
}
