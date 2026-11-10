import type { LadderId } from "../achievements/ladders.ts";

export type ItemId = string;

export type Art = { kind: "unicode"; glyph: string } | { kind: "custom"; url: string };

export type Source = { kind: "starter" } | { kind: "store"; price: number } | { kind: "tier"; ladder: LadderId; tier: "silver" };

export type CatalogueItem = { item: ItemId; kind: "kudosEmoji"; name: string; emoji: string; art: Art; source: Source };

const storePrice = 100;

const customItemPrefix = "custom:";

const starter = kudosEmoji("hedgehog", "hedgehog", "🦔", "Hedgehog", { kind: "starter" });

export const catalogue = {
  version: "1",
  items: [
    starter,
    kudosEmoji("sunflower", "sunflower", "🌻", "Sunflower", sold()),
    kudosEmoji("rocket", "rocket", "🚀", "Rocket", sold()),
    kudosEmoji("glowing-star", "star2", "🌟", "Glowing Star", sold()),
    kudosEmoji("gem", "gem", "💎", "Gem", sold()),
    kudosEmoji("rainbow", "rainbow", "🌈", "Rainbow", sold()),
    kudosEmoji("clover", "four_leaf_clover", "🍀", "Clover", sold()),
    kudosEmoji("doughnut", "doughnut", "🍩", "Doughnut", sold()),
    kudosEmoji("cookie", "cookie", "🍪", "Cookie", sold()),
    kudosEmoji("crown", "crown", "👑", "Crown", sold()),
    kudosEmoji("balloon", "balloon", "🎈", "Balloon", sold()),
    kudosEmoji("cactus", "cactus", "🌵", "Cactus", sold()),
    kudosEmoji("trophy", "trophy", "🏆", "Trophy", sold()),
    kudosEmoji("ribbon", "ribbon", "🎀", "Ribbon", silverIn("generosity")),
    kudosEmoji("sparkling-heart", "sparkling_heart", "💖", "Sparkling Heart", silverIn("recognition")),
    kudosEmoji("jigsaw", "jigsaw", "🧩", "Jigsaw", silverIn("connections")),
    kudosEmoji("anchor", "anchor", "⚓", "Anchor", silverIn("dependability")),
    kudosEmoji("confetti", "confetti_ball", "🎊", "Confetti", silverIn("applause")),
    kudosEmoji("maple-leaf", "maple_leaf", "🍁", "Maple Leaf", silverIn("seasons")),
    kudosEmoji("teddy-bear", "teddy_bear", "🧸", "Teddy Bear", silverIn("old-friends")),
    kudosEmoji("handshake", "handshake", "🤝", "Handshake", silverIn("team-spirit")),
  ],
} as const satisfies { version: string; items: readonly CatalogueItem[] };

const catalogueEmoji: ReadonlySet<string> = new Set(catalogue.items.map(({ emoji }) => emoji));

export const starterItem: ItemId = starter.item;

export const starterEmoji: string = starter.emoji;

export type TierItem = CatalogueItem & { source: { kind: "tier"; ladder: LadderId; tier: "silver" } };

export type StoreItem = CatalogueItem & { source: { kind: "store"; price: number } };

export function itemOf(item: ItemId): CatalogueItem | undefined {
  return catalogue.items.find((entry) => entry.item === item);
}

export function isCatalogueEmoji(name: string): boolean {
  return catalogueEmoji.has(name);
}

export function customItemOf(name: string, url: string): StoreItem {
  return { item: `${customItemPrefix}${name}`, kind: "kudosEmoji", name: `:${name}:`, emoji: name, art: { kind: "custom", url }, source: { kind: "store", price: storePrice } };
}

export function isCustomItem(item: ItemId | null): item is ItemId {
  return item?.startsWith(customItemPrefix) ?? false;
}

export function kudosEmojiNameOf(item: ItemId): string | undefined {
  return isCustomItem(item) ? item.slice(customItemPrefix.length) : itemOf(item)?.emoji;
}

export function priceOf(item: ItemId): number | undefined {
  if (isCustomItem(item)) return storePrice;
  const source = itemOf(item)?.source;
  return source?.kind === "store" ? source.price : undefined;
}

export function tierItemOf(ladder: LadderId): TierItem {
  return catalogue.items.find((entry: CatalogueItem): entry is TierItem => entry.source.kind === "tier" && entry.source.ladder === ladder)!;
}

function kudosEmoji(id: string, emoji: string, glyph: string, name: string, source: Source): CatalogueItem {
  return { item: `kudos-emoji-${id}`, kind: "kudosEmoji", name, emoji, art: { kind: "unicode", glyph }, source };
}

function sold(): Source {
  return { kind: "store", price: storePrice };
}

function silverIn(ladder: LadderId): Source {
  return { kind: "tier", ladder, tier: "silver" };
}
