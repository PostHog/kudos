// The module map's skeleton of convex/album/randomEmojis.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import { mostRandomEmojis } from "./emojiClasses.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export { mostRandomEmojis };

export const randomEmojiChance = 0.1;

export const mostRandomEmojisShown = 200;

export type RandomEmojiId = `random:${string}`;

export type HeldRandomEmoji = { id: RandomEmojiId; name: string; image: string; from: MemberId; at: number };

export async function dropRandomEmojiFrom(ctx: MutationContext, member: MemberId, pack: Id<"thoughtfulPacks">, crate: string, at: number): Promise<void> {
  throw notPorted("album.randomEmojis.dropRandomEmojiFrom");
}

export async function randomEmojisHeldBy(ctx: QueryContext, workspace: string, member: MemberId, picked: string[] = []): Promise<HeldRandomEmoji[]> {
  throw notPorted("album.randomEmojis.randomEmojisHeldBy");
}

export async function holdsRandomEmoji(ctx: QueryContext, member: MemberId, name: string): Promise<boolean> {
  throw notPorted("album.randomEmojis.holdsRandomEmoji");
}

export async function randomEmojiNamesHeldBy(ctx: QueryContext, member: MemberId): Promise<string[]> {
  throw notPorted("album.randomEmojis.randomEmojiNamesHeldBy");
}
