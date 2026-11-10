// The item ledger: one row per item a member earns, face down until they turn it. Today's
// convex/album/items/ledger.ts over the service's transaction; a missing `turnedAt` is SQL NULL, which the index
// orders first, as Convex ordered a missing field.
import { and, eq, isNull } from "drizzle-orm";
import type { DmLinks } from "../../feedback/dmLinks.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { achievementHoggiesShownTo, isAnAchievement } from "./achievementFlag.ts";
import { hiddenItemsShownTo } from "./flag.ts";
import type { Earning, ItemReason, ItemSource } from "./records.ts";
import type { Id } from "../../db/columns.ts";
import { fromDocument, toDocument } from "../../db/documents.ts";
import { indexOrder } from "../../db/indexOrder.ts";
import type { Page } from "../../db/page.ts";
import { items, type Doc } from "../../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export const mostItemsShown = 100;

export const mostWaitingCounted = 50;

export type FaceDown = { item: Id<"items">; earnedAt: number; reason: ItemReason };

export type WaitingCount = number | `${typeof mostWaitingCounted}+`;

type Item = Doc<"items">;

const byMemberTurned = indexOrder(items, ["member", "turnedAt", "earnedAt"]);
const byMemberSourceKey = indexOrder(items, ["member", "source", "key"]);

const asItem = (row: Record<string, unknown>) => toDocument<Item>(items, row);

export async function earnItem(ctx: MutationContext, earning: Earning): Promise<Id<"items">> {
  const earned = await itemOf(ctx, earning.member, earning.source, earning.key);
  if (earned !== null) return earned._id;
  const row = { ...ctx.newRow(), ...earning };
  await ctx.tx.insert(items).values(fromDocument(items, row) as typeof items.$inferInsert);
  return row._id as Id<"items">;
}

export async function markTurned(ctx: MutationContext, member: MemberId, source: ItemSource, key: string, at: number): Promise<void> {
  const earned = await itemOf(ctx, member, source, key);
  if (earned !== null && earned.turnedAt === undefined) await ctx.tx.update(items).set({ turnedAt: at }).where(eq(items._id, earned._id));
}

export async function boardOf(ctx: QueryContext, member: MemberId): Promise<{ items: FaceDown[]; more: boolean }> {
  const oldestFirst = await waitingOf(ctx, member, mostItemsShown + 1);
  return { items: oldestFirst.slice(0, mostItemsShown).map(faceDown), more: oldestFirst.length > mostItemsShown };
}

export async function waitingCountOf(ctx: QueryContext, member: MemberId): Promise<WaitingCount> {
  const { length } = await waitingOf(ctx, member, mostWaitingCounted + 1);
  return length > mostWaitingCounted ? `${mostWaitingCounted}+` : length;
}

export async function shownWaitingHoggiesOf(ctx: QueryContext, member: MemberId, links: DmLinks | null, { notYetEarned = 0 } = {}): Promise<WaitingCount> {
  if (links === null || !(await hiddenItemsShownTo(ctx, member))) return 0;
  return waitingHoggieCountOf(ctx, member, notYetEarned);
}

async function waitingHoggieCountOf(ctx: QueryContext, member: MemberId, notYetEarned: number): Promise<WaitingCount> {
  const hoggies = (await waitingOf(ctx, member, mostItemsShown + 1)).filter(({ source }) => source === "hoggie").length + notYetEarned;
  return hoggies > mostWaitingCounted ? `${mostWaitingCounted}+` : hoggies;
}

export async function stickerWaitsFor(ctx: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  const waiting = await waitingOf(ctx, member, mostItemsShown + 1);
  return waiting.some(({ source, reason }) => source === "sticker" && reason.kind === "thanks" && reason.person === person);
}

/**
 * The member's first `most` face-down items, oldest earned first, leaving out achievements while they aren't shown.
 * Today's `for await` streamed the index; this reads it a page of `most` at a time and stops once it has them.
 */
async function waitingOf(ctx: QueryContext, member: MemberId, most: number): Promise<Item[]> {
  const achievementsShown = await achievementHoggiesShownTo(ctx, member);
  const waiting: Item[] = [];
  let after: Item | undefined;
  for (;;) {
    const rows = await ctx.tx
      .select()
      .from(items)
      .where(and(eq(items.member, member), isNull(items.turnedAt), after && byMemberTurned.after(after)))
      .orderBy(...byMemberTurned.orderBy())
      .limit(most);
    for (const row of rows) {
      const item = (after = asItem(row));
      if (achievementsShown || !isAnAchievement(item.reason)) waiting.push(item);
      if (waiting.length === most) return waiting;
    }
    if (rows.length < most) return waiting;
  }
}

export function waitingPageOf(ctx: QueryContext, member: MemberId, cursor: string | null, numItems: number): Promise<Page<Doc<"items">>> {
  throw notPorted("album.items.ledger.waitingPageOf");
}

function faceDown({ _id, earnedAt, reason }: Item): FaceDown {
  return { item: _id, earnedAt, reason };
}

/** When the member last turned an item: the index's last row, where a face-down item's NULL sorts before every time. */
export async function newestTurnOf(ctx: QueryContext, member: MemberId): Promise<number | null> {
  const [newest] = await ctx.tx
    .select({ turnedAt: items.turnedAt })
    .from(items)
    .where(eq(items.member, member))
    .orderBy(...byMemberTurned.orderBy("desc"))
    .limit(1);
  return newest?.turnedAt ?? null;
}

export async function isWaiting(ctx: QueryContext, member: MemberId, source: ItemSource, key: string): Promise<boolean> {
  const item = await itemOf(ctx, member, source, key);
  return item !== null && item.turnedAt === undefined;
}

export async function isTurned(ctx: QueryContext, member: MemberId, source: ItemSource, key: string): Promise<boolean> {
  return (await itemOf(ctx, member, source, key))?.turnedAt !== undefined;
}

export function earnedItemOf(ctx: QueryContext, member: MemberId, source: ItemSource, key: string): Promise<Doc<"items"> | null> {
  return itemOf(ctx, member, source, key);
}

/** The member's one item of the source under the key, or `null`; two fail, as `.unique()` did. */
async function itemOf(ctx: QueryContext, member: MemberId, source: ItemSource, key: string): Promise<Item | null> {
  const rows = await ctx.tx
    .select()
    .from(items)
    .where(and(eq(items.member, member), eq(items.source, source), eq(items.key, key)))
    .orderBy(...byMemberSourceKey.orderBy())
    .limit(2);
  if (rows.length > 1) throw new Error(`The member holds more than one ${source} item under ${key}`);
  return rows[0] ? asItem(rows[0]) : null;
}
