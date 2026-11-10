// The module map's skeleton of convex/store/buying.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { ItemId } from "./catalogue.ts";
import type { ItemPurchaseOutcome } from "./rows.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function buyItem(ctx: MutationContext, member: MemberId, item: ItemId, idempotencyKey: string): Promise<ItemPurchaseOutcome | null> {
  throw notPorted("store.buying.buyItem");
}
