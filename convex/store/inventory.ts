import { v } from "convex/values";
import { internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { laddersShownTo } from "../achievements/shown";
import type { ParseHook } from "../parser/parser";
import { openedAtOf, stateOf } from "../unlocks/unlocks";
import { chatUserOf, type MemberId } from "../workspace/directory";
import { settingsOf } from "../workspace/settings";
import { catalogue, isCustomItem, itemOf, kudosEmojiNameOf, starterItem, type CatalogueItem, type ItemId, type StoreItem, type TierItem } from "./catalogue";
import { customItemsShownAndExposedTo, customItemsShownTo, customKudosEmojiOnAndExposedFor, customKudosEmojiShownTo, type CustomItems } from "./customKudosEmoji";
import type { CollectedItem } from "./rows";
import { storeVisibleTo } from "./visibility";

export type { StoreItem } from "./catalogue";

export type OwnedItem = { item: ItemId; arrivedAt: number };

export type Inventory = {
  owned: OwnedItem[];
  catalogue: Array<CatalogueItem & { onSale: boolean }>;
};

export type InventoryHome = { owned: CatalogueItem[]; customShown: StoreItem[]; store: StoreItem[]; notYoursYet: TierItem[] };

export const ownedKudosEmojiHook: ParseHook = {
  name: "owned kudos emoji",
  kudosEmoji: async (ctx, { giver }) => (giver === undefined ? [] : (await kudosEmojiOwnedBy(ctx, giver)).map((name) => ({ name }))),
};

export const inventoryOf = internalQuery({
  args: { member: v.id("members") },
  handler: (ctx, { member }) => visibleInventoryOf(ctx, member),
});

export async function visibleInventoryOf(ctx: QueryCtx, member: MemberId): Promise<Inventory | null> {
  return (await storeVisibleTo(ctx, member)) ? inventoryFor(ctx, member) : null;
}

async function kudosEmojiOwnedBy(ctx: MutationCtx, member: MemberId): Promise<string[]> {
  const starter = (await openedAtOf(ctx, member, "coins")) === null ? [] : [starterItem];
  const collected = (await collectedBy(ctx, member)).map(({ item }) => item);
  const customCount = collected.some(isCustomItem) && (await customKudosEmojiOnAndExposedFor(ctx, member));
  const owned = [...starter, ...collected.filter((item) => customCount || !isCustomItem(item))];
  return owned.flatMap((item) => kudosEmojiNameOf(item) ?? []);
}

export async function inventoryHomeOf(ctx: MutationCtx, member: MemberId): Promise<InventoryHome> {
  const known = itemsKnownWith(await customItemsShownAndExposedTo(ctx, member));
  const owned = await ownedBy(ctx, member);
  const ownedItems = new Set(owned.map(({ item }) => item));
  const workspaceEmoji = await workspaceEmojiOf(ctx, member);
  const store = storeItemsIn(workspaceEmoji, known.custom).filter(({ item }) => !ownedItems.has(item));
  const notYoursYet = (await tierItemsListedFor(ctx, member, workspaceEmoji)).filter(({ item }) => !ownedItems.has(item));
  return { owned: owned.flatMap(({ item }) => known.itemOf(item) ?? []), customShown: known.custom.all, store, notYoursYet };
}

export async function grantItem(ctx: MutationCtx, granted: CollectedItem): Promise<boolean> {
  if ((await collectedRow(ctx, granted.member, granted.item)) !== null) return false;
  await ctx.db.insert("collection", granted);
  return true;
}

export async function storeItemFor(ctx: QueryCtx, member: MemberId, item: ItemId): Promise<StoreItem | null> {
  const custom = isCustomItem(item) ? await customItemsShownTo(ctx, member) : undefined;
  return storeItemsIn(await workspaceEmojiOf(ctx, member), custom).find((entry) => entry.item === item) ?? null;
}

export async function owns(ctx: QueryCtx, member: MemberId, item: ItemId): Promise<boolean> {
  return (await collectedRow(ctx, member, item)) !== null;
}

export async function ownedBy(ctx: QueryCtx, member: MemberId): Promise<OwnedItem[]> {
  const openedAt = await openedAtOf(ctx, member, "coins");
  const starter = openedAt === null ? [] : [{ item: starterItem, arrivedAt: openedAt }];
  const collected = await collectedBy(ctx, member);
  const customHidden = collected.some(({ item }) => isCustomItem(item)) && !(await customKudosEmojiShownTo(ctx, member));
  const shown = customHidden ? collected.filter(({ item }) => !isCustomItem(item)) : collected;
  const granted = shown.sort((a, b) => a.arrivedAt - b.arrivedAt).map(({ item, arrivedAt }) => ({ item, arrivedAt }));
  return [...starter, ...granted];
}

async function inventoryFor(ctx: QueryCtx, member: MemberId): Promise<Inventory> {
  const known = itemsKnownWith(await customItemsShownTo(ctx, member));
  const owned = await ownedBy(ctx, member);
  const ownedItems = new Set(owned.map(({ item }) => item));
  const workspaceEmoji = await workspaceEmojiOf(ctx, member);
  const sold = new Set(storeItemsIn(workspaceEmoji, known.custom).map(({ item }) => item));
  const tierItems = new Set((await tierItemsListedFor(ctx, member, workspaceEmoji)).map(({ item }) => item));
  const forSale = (entry: CatalogueItem) => sold.has(entry.item) && !ownedItems.has(entry.item);
  const shown = (entry: CatalogueItem) => ownedItems.has(entry.item) || forSale(entry) || tierItems.has(entry.item);
  return {
    owned,
    catalogue: known.items.filter(shown).map((entry) => ({ ...entry, onSale: forSale(entry) })),
  };
}

function itemsKnownWith(custom: CustomItems) {
  const items: CatalogueItem[] = [...catalogue.items, ...custom.all];
  return { custom, items, itemOf: (item: ItemId) => (isCustomItem(item) ? custom.all.find((entry) => entry.item === item) : itemOf(item)) };
}

async function tierItemsListedFor(ctx: QueryCtx, member: MemberId, workspaceEmoji: string): Promise<TierItem[]> {
  if ((await stateOf(ctx, member, "book")) !== "open") return [];
  const shown = await laddersShownTo(ctx, member);
  return catalogue.items.filter((entry: CatalogueItem): entry is TierItem => entry.source.kind === "tier" && shown.includes(entry.source.ladder) && entry.emoji !== workspaceEmoji);
}

function storeItemsIn(workspaceEmoji: string, custom?: CustomItems): StoreItem[] {
  return (custom?.picked ?? []).filter((entry) => entry.emoji !== workspaceEmoji);
}

async function workspaceEmojiOf(ctx: QueryCtx, member: MemberId) {
  return (await settingsOf(ctx, (await chatUserOf(ctx, member)).workspace)).kudosEmoji;
}

function collectedBy(ctx: QueryCtx, member: MemberId) {
  return ctx.db
    .query("collection")
    .withIndex("by_member_item", (q) => q.eq("member", member))
    .collect();
}

function collectedRow(ctx: QueryCtx, member: MemberId, item: ItemId) {
  return ctx.db
    .query("collection")
    .withIndex("by_member_item", (q) => q.eq("member", member).eq("item", item))
    .unique();
}
