// Putting what waits in the tray into the album: a hoggie joins the collection, a sticker its person's page, and the
// album's milestones are recorded after. Today's convex/album/putIn.ts over the service's transaction.
import { and, eq, isNull } from "drizzle-orm";
import { putDropIn } from "./hoggies/drops.ts";
import { markTurned } from "./items/ledger.ts";
import type { MemberId } from "../workspace/directory.ts";
import { recordMilestonesOf } from "./milestones.ts";
import { shownTrayItem, trayKeyOf, type TrayItem } from "./opening.ts";
import { crateKeyOf } from "./packs.ts";
import { recordPackSticker } from "./stickers.ts";
import { tallyHoggieFound, tallyNewFace } from "./tallies.ts";
import { teamPagesOf, type PageOwner, type TeamPage } from "./teamPages.ts";
import type { StickerPutInEvent } from "../bus/events.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { trayItems, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const mostPutInACall = 25;

export type PutIn = { items: TrayItem[]; more: boolean };

type Stored = Doc<"trayItems">;

type StoredSticker = Extract<Stored, { kind: "sticker" }>;

const byMemberPutInKind = indexOrder(trayItems, ["member", "putInAt", "kind"]);
const byPackKind = indexOrder(trayItems, ["pack", "kind"]);

const asStored = (row: Record<string, unknown>) => toDocument<Stored>(trayItems, row);

export async function putItemIn(ctx: MutationContext, owner: PageOwner, item: Id<"trayItems">, at: number): Promise<TrayItem | null> {
  const [row] = await ctx.tx.select().from(trayItems).where(eq(trayItems._id, item));
  const stored = row ? asStored(row) : null;
  if (stored?.member !== owner.member || stored.putInAt !== undefined) return null;
  await placeFromTheTray(ctx, owner.workspace, stored, at);
  await recordMilestonesOf(ctx, owner, at);
  return shownTrayItem(stored);
}

export async function putEveryItemIn(ctx: MutationContext, owner: PageOwner, at: number): Promise<PutIn> {
  const inPutInOrder = await putInOrderOf(ctx, owner);
  const placing = inPutInOrder.slice(0, mostPutInACall);
  for (const item of placing) await placeFromTheTray(ctx, owner.workspace, item, at);
  if (placing.length > 0) await recordMilestonesOf(ctx, owner, at);
  return { items: placing.map(shownTrayItem), more: inPutInOrder.length > placing.length };
}

async function putInOrderOf(ctx: MutationContext, owner: PageOwner): Promise<Stored[]> {
  const hoggies = await waitingInTheTray(ctx, owner.member, "hoggie", mostPutInACall + 1);
  if (hoggies.length > mostPutInACall) return hoggies;
  const stickers = (await waitingInTheTray(ctx, owner.member, "sticker")) as StoredSticker[];
  return [...hoggies, ...byTeamPage(stickers, await teamPagesOf(ctx, owner))];
}

/** The member's waiting tray items of the kind in index order; every one of them without `most`, as `.collect()` read. */
async function waitingInTheTray(ctx: QueryContext, member: MemberId, kind: Stored["kind"], most?: number): Promise<Stored[]> {
  const query = ctx.tx
    .select()
    .from(trayItems)
    .where(and(eq(trayItems.member, member), isNull(trayItems.putInAt), eq(trayItems.kind, kind)))
    .orderBy(...byMemberPutInKind.orderBy());
  return (await (most === undefined ? query : query.limit(most))).map(asStored);
}

function byTeamPage(stickers: StoredSticker[], pages: TeamPage[]): StoredSticker[] {
  const pageOf = (person: MemberId) => {
    const page = pages.findIndex(({ people }) => people.includes(person));
    return page === -1 ? pages.length : page;
  };
  return stickers
    .map((sticker, opened) => ({ sticker, opened, page: pageOf(sticker.person) }))
    .sort((one, other) => one.page - other.page || one.opened - other.opened)
    .map(({ sticker }) => sticker);
}

export async function placeFromTheTray(ctx: MutationContext, workspace: string, item: Stored, at: number): Promise<void> {
  await markPutIn(ctx, item._id, at);
  if (item.kind === "hoggie") return putHoggieIn(ctx, item, at);
  await markTurned(ctx, item.member, "sticker", item.pack, at);
  await putStickerIn(ctx, { workspace, member: item.member }, item.person, item.pack, at);
}

export async function putStickerIn(ctx: MutationContext, { workspace, member }: PageOwner, person: MemberId, pack: Id<"thoughtfulPacks">, at: number): Promise<boolean> {
  if (!(await recordPackSticker(ctx, member, person, pack, at))) return false;
  await tallyNewFace(ctx, member, person, at);
  const putIn: StickerPutInEvent = { type: "stickerPutIn", workspace, member, person, at };
  await ctx.publish(putIn);
  return true;
}

export async function markTrayStickerPutIn(ctx: MutationContext, pack: Id<"thoughtfulPacks">, at: number): Promise<void> {
  const [row] = await ctx.tx
    .select()
    .from(trayItems)
    .where(and(eq(trayItems.pack, pack), eq(trayItems.kind, "sticker")))
    .orderBy(...byPackKind.orderBy())
    .limit(1);
  const waiting = row ? asStored(row) : null;
  if (waiting !== null && waiting.putInAt === undefined) await markPutIn(ctx, waiting._id, at);
}

async function markPutIn(ctx: MutationContext, item: Id<"trayItems">, at: number) {
  await ctx.tx.update(trayItems).set({ putInAt: at }).where(eq(trayItems._id, item));
}

async function putHoggieIn(ctx: MutationContext, { _id, member, pack, hoggie, rarity }: Extract<Stored, { kind: "hoggie" }>, at: number) {
  await markTurned(ctx, member, "hoggie", trayKeyOf(_id), at);
  await putDropIn(ctx, member, crateKeyOf(pack), at);
  await tallyHoggieFound(ctx, member, { hoggie, rarity }, at);
}
