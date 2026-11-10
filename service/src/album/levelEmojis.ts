// The module map's skeleton of convex/album/levelEmojis.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import { standardEmojiNamed } from "../workspace/standardEmoji.ts";
import { emojiArtPictureOf, levelTwoEmoji } from "./emojiCatalogue.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function emojiLevelsOf(ctx: QueryContext, member: MemberId): Promise<readonly number[]> {
  throw notPorted("album.levelEmojis.emojiLevelsOf");
}

export async function isEmojiLevelOf(ctx: QueryContext, member: MemberId, level: number): Promise<boolean> {
  throw notPorted("album.levelEmojis.isEmojiLevelOf");
}

export function levelEmojiPictureOf(level: number): string {
  const standard = level === levelTwoEmoji.level ? standardEmojiNamed(levelTwoEmoji.name) : null;
  return standard?.image ?? emojiArtPictureOf("level", level);
}
