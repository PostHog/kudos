// The level emojis a member is offered: the catalogue's levels, and level 2's :raised_hands: while onboarding shows to
// them. Today's convex/album/levelEmojis.ts.
import { onboardingShownTo } from "./items/onboardingFlag.ts";
import type { MemberId } from "../workspace/directory.ts";
import { standardEmojiNamed } from "../workspace/standardEmoji.ts";
import { emojiArtPictureOf, emojiLevels, everyEmojiLevel, levelTwoEmoji } from "./emojiCatalogue.ts";
import type { QueryContext } from "../operations.ts";

export async function emojiLevelsOf(ctx: QueryContext, member: MemberId): Promise<readonly number[]> {
  return (await onboardingShownTo(ctx, member)) ? everyEmojiLevel : emojiLevels;
}

export async function isEmojiLevelOf(ctx: QueryContext, member: MemberId, level: number): Promise<boolean> {
  if (emojiLevels.some((reward) => reward === level)) return true;
  return level === levelTwoEmoji.level && (await onboardingShownTo(ctx, member));
}

export function levelEmojiPictureOf(level: number): string {
  const standard = level === levelTwoEmoji.level ? standardEmojiNamed(levelTwoEmoji.name) : null;
  return standard?.image ?? emojiArtPictureOf("level", level);
}
