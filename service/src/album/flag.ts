// The album's flags, as today's convex/album/flag.ts decides them: each one per member, read without writing a decision
// where the album only shows something, and decided (and, for hype-by-reactions, exposed) where a mutation acts on it.
import { exposed, memberDecision, memberDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export const albumFlag = { key: "album", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function albumShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, albumFlag, member);
}

export const randomEmojisFlag = { key: "random-emojis", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function randomEmojisShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, randomEmojisFlag, member);
}

export const emojiWizardFlag = { key: "emoji-wizard", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function emojiWizardShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, emojiWizardFlag, member);
}

export const emojiMappingInPlaceFlag = { key: "emoji-mapping-in-place", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function emojiMappingInPlaceShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, emojiMappingInPlaceFlag, member);
}

export const shareableUrlsFlag = { key: "shareable-urls", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function shareableUrlsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, shareableUrlsFlag, member);
}

export const ownHypePickFlag = { key: "own-hype-pick", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function ownHypePickShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, ownHypePickFlag, member);
}

export const adminHypeEmojisFlag = { key: "admin-hype-emojis", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function adminHypeEmojisShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, adminHypeEmojisFlag, member);
}

export const kudosEmojiPicksFlag = { key: "kudos-emoji-picks", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function kudosEmojiPicksShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, kudosEmojiPicksFlag, member);
}

export function kudosEmojiPicksCountFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  return memberDecision(ctx, kudosEmojiPicksFlag, member);
}

export type AlbumShown = { album?: true };

export async function albumOnProfileOf(ctx: QueryContext, member: MemberId): Promise<AlbumShown> {
  return (await albumShownTo(ctx, member)) ? { album: true } : {};
}

export const personPageDFlag = { key: "person-page-d", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function personPageDShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, personPageDFlag, member);
}

export const bookNextFlag = { key: "book-next", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function bookNextShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, bookNextFlag, member);
}

export const hypeByReactionsFlag = { key: "hype-by-reactions", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function hypeByReactionsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, hypeByReactionsFlag, member);
}

export async function hypeByReactionsCollectFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const collects = await memberDecision(ctx, hypeByReactionsFlag, member);
  await exposed(ctx, hypeByReactionsFlag, member, collects);
  return collects;
}
