// The module map's skeleton of convex/album/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const albumFlag = { key: "album", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function albumShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.albumShownTo");
}

export const randomEmojisFlag = { key: "random-emojis", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function randomEmojisShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.randomEmojisShownTo");
}

export const emojiWizardFlag = { key: "emoji-wizard", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function emojiWizardShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.emojiWizardShownTo");
}

export const emojiMappingInPlaceFlag = { key: "emoji-mapping-in-place", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function emojiMappingInPlaceShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.emojiMappingInPlaceShownTo");
}

export const shareableUrlsFlag = { key: "shareable-urls", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function shareableUrlsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.shareableUrlsShownTo");
}

export const ownHypePickFlag = { key: "own-hype-pick", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function ownHypePickShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.ownHypePickShownTo");
}

export const adminHypeEmojisFlag = { key: "admin-hype-emojis", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function adminHypeEmojisShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.adminHypeEmojisShownTo");
}

export const kudosEmojiPicksFlag = { key: "kudos-emoji-picks", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function kudosEmojiPicksShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.kudosEmojiPicksShownTo");
}

export function kudosEmojiPicksCountFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.kudosEmojiPicksCountFor");
}

export type AlbumShown = { album?: true };

export async function albumOnProfileOf(ctx: QueryContext, member: MemberId): Promise<AlbumShown> {
  throw notPorted("album.flag.albumOnProfileOf");
}

export const personPageDFlag = { key: "person-page-d", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function personPageDShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.personPageDShownTo");
}

export const bookNextFlag = { key: "book-next", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function bookNextShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.bookNextShownTo");
}

export const hypeByReactionsFlag = { key: "hype-by-reactions", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function hypeByReactionsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.hypeByReactionsShownTo");
}

export async function hypeByReactionsCollectFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.flag.hypeByReactionsCollectFor");
}
