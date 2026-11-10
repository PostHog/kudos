// A hype held for its item: while hidden items show, a person's hype waits until the first pack their giver was
// granted for them is turned. Today's convex/album/items/hypes.ts over the service's transaction.
import { crateKeyOf, firstPackGrantedFor } from "../packs.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { hiddenItemsShownTo } from "./flag.ts";
import { isWaiting, type FaceDown } from "./ledger.ts";
import type { QueryContext } from "../../operations.ts";

export type HypesHeld = { people: ReadonlySet<MemberId>; every: boolean };

export function hypesHeldFor({ items, more }: { items: FaceDown[]; more: boolean }): HypesHeld {
  return { people: new Set(items.flatMap(({ reason }) => (reason.kind === "thanks" ? [reason.person] : []))), every: more };
}

export function holdsTheHypeOf(held: HypesHeld, person: MemberId): boolean {
  return held.every || held.people.has(person);
}

export async function hypeWaitsForItsItem(ctx: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  return (await hiddenItemsShownTo(ctx, member)) && (await firstPackWaitsFaceDown(ctx, member, person));
}

async function firstPackWaitsFaceDown(ctx: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  const first = await firstPackGrantedFor(ctx, member, person);
  if (first === null) return false;
  return (await isWaiting(ctx, member, "sticker", first._id)) || (await isWaiting(ctx, member, "hoggie", crateKeyOf(first._id)));
}
