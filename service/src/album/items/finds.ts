// The module map's skeleton of convex/album/items/finds.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MessageRef } from "../../engine/messageEvent.ts";
import type { Rarity } from "../hoggies/catalogue.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export const mostPacksOfAKudosRead = 50;

const sharedRaritiesRarestFirst = ["legendary", "epic"] as const satisfies Rarity[];

export type SharedRarity = (typeof sharedRaritiesRarestFirst)[number];

export type Find = { name: string; rarity: SharedRarity };

export type GrantedKudos = { giver: MemberId; message: MessageRef; at: number };

export async function turnedFindOf(ctx: QueryContext, kudos: GrantedKudos): Promise<Find | null> {
  throw notPorted("album.items.finds.turnedFindOf");
}

export function isShared(rarity: Rarity): rarity is SharedRarity {
  return (sharedRaritiesRarestFirst as readonly Rarity[]).includes(rarity);
}
