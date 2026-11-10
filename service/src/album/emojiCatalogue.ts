import { catalogue as hoggieCatalogue } from "./hoggies/catalogue.ts";
import { milestoneCatalogue, type MilestoneId } from "./milestoneCatalogue.ts";
import type { MilestoneTier } from "./records.ts";

export const emojiLevels = [5, 10, 15, 20, 25] as const;

export const levelTwoEmoji = { level: 2, name: "raised_hands" } as const;

export const everyEmojiLevel: readonly number[] = [levelTwoEmoji.level, ...emojiLevels];

export const firstThankYouEmoji = "milestone:thoughtful:bronze";

export const mostKudosEmojiPicks = 5;

export type MilestoneTierEmoji = { milestone: MilestoneId; tier: MilestoneTier; name: string };

export const milestoneTierEmojis: readonly MilestoneTierEmoji[] = milestoneCatalogue.milestones.flatMap(({ id, steps }) => steps.map(({ tier, name }) => ({ milestone: id, tier, name })));

export function milestoneTierArtOf(milestone: MilestoneId, tier: MilestoneTier): string {
  return `${milestone}-${tier}`;
}

export function milestoneTierEmojiOf(cause: string): MilestoneTierEmoji | null {
  return milestoneTierEmojis.find(({ milestone, tier }) => `${milestone}:${tier}` === cause) ?? null;
}

export type EmojiArtKind = "team" | "milestone" | "level";

export const emojiArt = {
  team: hoggieCatalogue.crests.map(({ crest }) => crest),
  milestone: milestoneTierEmojis.map(({ milestone, tier }) => milestoneTierArtOf(milestone, tier)),
  level: emojiLevels.map(String),
} as const satisfies Record<EmojiArtKind, readonly string[]>;

export const teamEmblemPicture = "/emoji/team.png";

export const hypeEmblemPicture = "/emoji/hype.png";

export const reactionsToCollect = 10;

export function emojiArtPictureOf(kind: EmojiArtKind, catalogueId: string | number): string {
  return `/emoji/${kind}-${catalogueId}.png`;
}

const longestSlug = 80;

export function slugOf(source: string): string {
  return source
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, longestSlug)
    .replace(/-+$/, "");
}
