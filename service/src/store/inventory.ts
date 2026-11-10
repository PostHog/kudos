// The module map's skeleton of convex/store/inventory.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ParseHook } from "../parser/parser.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { CatalogueItem, ItemId, StoreItem, TierItem } from "./catalogue.ts";
import type { CollectedItem } from "./rows.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted, notPortedValue } from "../notPorted.ts";

export type { StoreItem } from "./catalogue.ts";

export type OwnedItem = { item: ItemId; arrivedAt: number };

export type Inventory = {
  owned: OwnedItem[];
  catalogue: Array<CatalogueItem & { onSale: boolean }>;
};

export type InventoryHome = { owned: CatalogueItem[]; customShown: StoreItem[]; store: StoreItem[]; notYoursYet: TierItem[] };

export const ownedKudosEmojiHook: ParseHook = notPortedValue("store.inventory.ownedKudosEmojiHook");

export async function visibleInventoryOf(ctx: QueryContext, member: MemberId): Promise<Inventory | null> {
  throw notPorted("store.inventory.visibleInventoryOf");
}

export async function inventoryHomeOf(ctx: MutationContext, member: MemberId): Promise<InventoryHome> {
  throw notPorted("store.inventory.inventoryHomeOf");
}

export async function grantItem(ctx: MutationContext, granted: CollectedItem): Promise<boolean> {
  throw notPorted("store.inventory.grantItem");
}

export async function storeItemFor(ctx: QueryContext, member: MemberId, item: ItemId): Promise<StoreItem | null> {
  throw notPorted("store.inventory.storeItemFor");
}

export async function owns(ctx: QueryContext, member: MemberId, item: ItemId): Promise<boolean> {
  throw notPorted("store.inventory.owns");
}

export async function ownedBy(ctx: QueryContext, member: MemberId): Promise<OwnedItem[]> {
  throw notPorted("store.inventory.ownedBy");
}
