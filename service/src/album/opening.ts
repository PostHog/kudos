// The module map's skeleton of convex/album/opening.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Rarity } from "./hoggies/catalogue.ts";
import type { AppliedReward } from "../progression/rewards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const mostTrayItemsShown = 100;

export type TrayItem = { item: Id<"trayItems">; kind: "sticker"; person: MemberId } | { item: Id<"trayItems">; kind: "hoggie"; hoggie: string; rarity: Rarity; isNew: boolean };

export type Opening = { items: TrayItem[]; applied: AppliedReward | null };

type PackId = Id<"thoughtfulPacks">;

export async function openThoughtfulPack(ctx: MutationContext, member: MemberId, pack: PackId, at: number): Promise<Opening | null> {
  throw notPorted("album.opening.openThoughtfulPack");
}

export async function openThePackOnceAllTurned(ctx: MutationContext, item: Doc<"items">, at: number): Promise<void> {
  throw notPorted("album.opening.openThePackOnceAllTurned");
}

export async function trayOf(ctx: QueryContext, member: MemberId): Promise<{ tray: TrayItem[]; more: boolean }> {
  throw notPorted("album.opening.trayOf");
}

export async function earnTrayItem(ctx: MutationContext, item: Doc<"trayItems">, pack: Doc<"thoughtfulPacks">): Promise<void> {
  throw notPorted("album.opening.earnTrayItem");
}

const trayKeyPrefix = "tray:";

export function trayKeyOf(item: Id<"trayItems">): string {
  return `${trayKeyPrefix}${item}`;
}

export function isTrayKey(key: string): boolean {
  return key.startsWith(trayKeyPrefix);
}

export async function trayItemKeyed(ctx: QueryContext, key: string): Promise<Doc<"trayItems"> | null> {
  throw notPorted("album.opening.trayItemKeyed");
}

export function shownTrayItem(stored: Doc<"trayItems">): TrayItem {
  if (stored.kind === "sticker") return { item: stored._id, kind: "sticker", person: stored.person };
  return { item: stored._id, kind: "hoggie", hoggie: stored.hoggie, rarity: stored.rarity, isNew: stored.isNew };
}
