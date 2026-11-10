// The module map's skeleton of convex/album/items/hypes.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../../workspace/directory.ts";
import type { FaceDown } from "./ledger.ts";
import type { QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export type HypesHeld = { people: ReadonlySet<MemberId>; every: boolean };

export function hypesHeldFor({ items, more }: { items: FaceDown[]; more: boolean }): HypesHeld {
  return { people: new Set(items.flatMap(({ reason }) => (reason.kind === "thanks" ? [reason.person] : []))), every: more };
}

export function holdsTheHypeOf(held: HypesHeld, person: MemberId): boolean {
  return held.every || held.people.has(person);
}

export async function hypeWaitsForItsItem(ctx: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  throw notPorted("album.items.hypes.hypeWaitsForItsItem");
}
