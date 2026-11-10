// Opening a thoughtful pack: its hoggie drops, and what the giver hadn't turned yet waits in their tray until they put
// it in. Today's convex/album/opening.ts over the service's transaction.
import { and, eq, isNull } from "drizzle-orm";
import type { Rarity } from "./hoggies/catalogue.ts";
import { dropFor, dropOf, packOf, type Drop } from "./hoggies/drops.ts";
import { hoggiesShownTo } from "./hoggies/flag.ts";
import { storedRangeOf } from "./hoggies/rarityCaps.ts";
import { earnedItemOf, earnItem, isTurned, markTurned } from "./items/ledger.ts";
import type { AppliedReward } from "../progression/rewards.ts";
import type { MemberId } from "../workspace/directory.ts";
import { crateKeyOf, thanksEarningOf, thoughtfulCratePrefix } from "./packs.ts";
import { dropRandomEmojiFrom } from "./randomEmojis.ts";
import { tallyPackOpened } from "./tallies.ts";
import type { Id } from "../db/columns.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { thoughtfulPacks, trayItems, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const mostTrayItemsShown = 100;

export type TrayItem = { item: Id<"trayItems">; kind: "sticker"; person: MemberId } | { item: Id<"trayItems">; kind: "hoggie"; hoggie: string; rarity: Rarity; isNew: boolean };

export type Opening = { items: TrayItem[]; applied: AppliedReward | null };

type PackId = Id<"thoughtfulPacks">;

type Pack = Doc<"thoughtfulPacks">;

type Stored = Doc<"trayItems">;

const byMemberPutIn = indexOrder(trayItems, ["member", "putInAt"]);

export async function openThoughtfulPack(ctx: MutationContext, member: MemberId, pack: PackId, at: number): Promise<Opening | null> {
  const waiting = await packNamed(ctx, pack);
  if (waiting?.giver !== member || waiting.openedAt !== undefined || !(await hoggiesShownTo(ctx, member))) return null;
  const crate = crateKeyOf(pack);
  const unseen = await unseenItemsOf(ctx, waiting);
  const item = await earnedItemOf(ctx, member, "hoggie", crate);
  await dropFor(ctx, member, crate, at, { surface: "website", waits: true, ...(item && storedRangeOf(item)) });
  const drop = await dropOf(ctx, member, crate);
  if (drop === null) return null;
  await markOpened(ctx, pack, at);
  await markTurned(ctx, member, "hoggie", crate, at);
  await tallyPackOpened(ctx, member, at);
  await dropRandomEmojiFrom(ctx, member, pack, crate, at);
  return { items: await intoTheTray(ctx, waiting, drop, unseen, at), applied: unseen.hoggie ? await packOf(ctx, member, crate) : null };
}

export async function openThePackOnceAllTurned(ctx: MutationContext, item: Doc<"items">, at: number): Promise<void> {
  const pack = packHolding(item);
  const waiting = pack === null ? null : await packNamed(ctx, pack);
  if (waiting === null || waiting.openedAt !== undefined) return;
  const unseen = await unseenItemsOf(ctx, waiting);
  if (!unseen.sticker && !unseen.hoggie) await markOpened(ctx, waiting._id, at);
}

// Today's `normalizeId` answered null for a string that was no ID of the table; a string that names no pack reads as
// none here, which every caller treats the same.
function packHolding({ source, key }: Doc<"items">): PackId | null {
  if (source === "sticker") return key as PackId;
  return key.startsWith(thoughtfulCratePrefix) ? (key.slice(thoughtfulCratePrefix.length) as PackId) : null;
}

async function packNamed(ctx: QueryContext, pack: PackId): Promise<Pack | null> {
  const [row] = await ctx.tx.select().from(thoughtfulPacks).where(eq(thoughtfulPacks._id, pack));
  return row ? toDocument<Pack>(thoughtfulPacks, row) : null;
}

async function markOpened(ctx: MutationContext, pack: PackId, at: number) {
  await ctx.tx.update(thoughtfulPacks).set({ openedAt: at }).where(eq(thoughtfulPacks._id, pack));
}

type Unseen = { sticker: boolean; hoggie: boolean };

async function unseenItemsOf(ctx: QueryContext, { _id, giver, holdsSticker }: Pack): Promise<Unseen> {
  return { sticker: holdsSticker && !(await isTurned(ctx, giver, "sticker", _id)), hoggie: !(await isTurned(ctx, giver, "hoggie", crateKeyOf(_id))) };
}

export async function trayOf(ctx: QueryContext, member: MemberId): Promise<{ tray: TrayItem[]; more: boolean }> {
  const inOpeningOrder = await ctx.tx
    .select()
    .from(trayItems)
    .where(and(eq(trayItems.member, member), isNull(trayItems.putInAt)))
    .orderBy(...byMemberPutIn.orderBy())
    .limit(mostTrayItemsShown + 1);
  return { tray: inOpeningOrder.slice(0, mostTrayItemsShown).map((row) => shownTrayItem(toDocument<Stored>(trayItems, row))), more: inOpeningOrder.length > mostTrayItemsShown };
}

type Placed = { member: MemberId; pack: PackId; at: number } & ({ kind: "sticker"; person: MemberId } | { kind: "hoggie"; hoggie: string; rarity: Rarity; isNew: boolean });

async function intoTheTray(ctx: MutationContext, pack: Pack, drop: Drop, unseen: Unseen, at: number): Promise<TrayItem[]> {
  const items: TrayItem[] = [];
  const placed = { member: pack.giver, pack: pack._id, at };
  if (unseen.sticker) items.push(await waitInTheTray(ctx, pack, { ...placed, kind: "sticker", person: pack.recipient }));
  if (unseen.hoggie) items.push(await waitInTheTray(ctx, pack, { ...placed, kind: "hoggie", hoggie: drop.hoggie, rarity: drop.rarity, isNew: drop.isNew }));
  return items;
}

async function waitInTheTray(ctx: MutationContext, pack: Pack, placed: Placed): Promise<TrayItem> {
  const stored = { ...ctx.newRow(), ...placed } as Stored;
  await ctx.tx.insert(trayItems).values(fromDocument(trayItems, stored) as typeof trayItems.$inferInsert);
  await earnTrayItem(ctx, stored, pack);
  return shownTrayItem(stored);
}

export async function earnTrayItem(ctx: MutationContext, item: Doc<"trayItems">, pack: Doc<"thoughtfulPacks">): Promise<void> {
  const earning = thanksEarningOf(pack);
  await earnItem(ctx, item.kind === "sticker" ? { ...earning, source: "sticker", key: pack._id } : { ...earning, source: "hoggie", key: trayKeyOf(item._id) });
}

const trayKeyPrefix = "tray:";

export function trayKeyOf(item: Id<"trayItems">): string {
  return `${trayKeyPrefix}${item}`;
}

export function isTrayKey(key: string): boolean {
  return key.startsWith(trayKeyPrefix);
}

export async function trayItemKeyed(ctx: QueryContext, key: string): Promise<Doc<"trayItems"> | null> {
  if (!isTrayKey(key)) return null;
  const [row] = await ctx.tx.select().from(trayItems).where(eq(trayItems._id, key.slice(trayKeyPrefix.length)));
  return row ? toDocument<Stored>(trayItems, row) : null;
}

export function shownTrayItem(stored: Doc<"trayItems">): TrayItem {
  if (stored.kind === "sticker") return { item: stored._id, kind: "sticker", person: stored.person };
  return { item: stored._id, kind: "hoggie", hoggie: stored.hoggie, rarity: stored.rarity, isNew: stored.isNew };
}
