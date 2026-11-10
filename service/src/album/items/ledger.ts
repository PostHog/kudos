// The module map's skeleton of convex/album/items/ledger.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { DmLinks } from "../../feedback/dmLinks.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { Earning, ItemReason, ItemSource } from "./records.ts";
import type { Id } from "../../db/columns.ts";
import type { Page } from "../../db/page.ts";
import type { Doc } from "../../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export const mostItemsShown = 100;

export const mostWaitingCounted = 50;

export type FaceDown = { item: Id<"items">; earnedAt: number; reason: ItemReason };

export type WaitingCount = number | `${typeof mostWaitingCounted}+`;

export async function earnItem(ctx: MutationContext, earning: Earning): Promise<Id<"items">> {
  throw notPorted("album.items.ledger.earnItem");
}

export async function markTurned(ctx: MutationContext, member: MemberId, source: ItemSource, key: string, at: number): Promise<void> {
  throw notPorted("album.items.ledger.markTurned");
}

export async function boardOf(ctx: QueryContext, member: MemberId): Promise<{ items: FaceDown[]; more: boolean }> {
  throw notPorted("album.items.ledger.boardOf");
}

export async function waitingCountOf(ctx: QueryContext, member: MemberId): Promise<WaitingCount> {
  throw notPorted("album.items.ledger.waitingCountOf");
}

export async function shownWaitingHoggiesOf(ctx: QueryContext, member: MemberId, links: DmLinks | null, { notYetEarned = 0 } = {}): Promise<WaitingCount> {
  throw notPorted("album.items.ledger.shownWaitingHoggiesOf");
}

export async function stickerWaitsFor(ctx: QueryContext, member: MemberId, person: MemberId): Promise<boolean> {
  throw notPorted("album.items.ledger.stickerWaitsFor");
}

export function waitingPageOf(ctx: QueryContext, member: MemberId, cursor: string | null, numItems: number): Promise<Page<Doc<"items">>> {
  throw notPorted("album.items.ledger.waitingPageOf");
}

export async function newestTurnOf(ctx: QueryContext, member: MemberId): Promise<number | null> {
  throw notPorted("album.items.ledger.newestTurnOf");
}

export async function isWaiting(ctx: QueryContext, member: MemberId, source: ItemSource, key: string): Promise<boolean> {
  throw notPorted("album.items.ledger.isWaiting");
}

export async function isTurned(ctx: QueryContext, member: MemberId, source: ItemSource, key: string): Promise<boolean> {
  throw notPorted("album.items.ledger.isTurned");
}

export function earnedItemOf(ctx: QueryContext, member: MemberId, source: ItemSource, key: string): Promise<Doc<"items"> | null> {
  throw notPorted("album.items.ledger.earnedItemOf");
}
