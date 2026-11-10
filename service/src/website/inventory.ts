// The module map's skeleton of convex/website/inventory.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { CatalogueItem, Source } from "../store/catalogue.ts";
import { type Inventory } from "../store/inventory.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

type TierSource = Extract<Source, { kind: "tier" }>;

export type ItemSource = Exclude<Source, TierSource> | (TierSource & { ladderName: string });

export type InventoryItem = Omit<CatalogueItem, "source"> & { source: ItemSource; onSale: boolean };

export type MemberInventory = Omit<Inventory, "catalogue"> & { catalogue: InventoryItem[]; slots?: [] };

export async function inventoryShownTo(ctx: QueryContext, member: MemberId): Promise<MemberInventory | null> {
  throw notPorted("website.inventory.inventoryShownTo");
}
