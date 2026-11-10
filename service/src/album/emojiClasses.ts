// The module map's skeleton of convex/album/emojiClasses.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type EmojiClass = "random" | "unmapped";

export const mostRandomEmojis = 100;

export async function emojiClassesIn(ctx: QueryContext, workspace: string): Promise<Map<string, EmojiClass>> {
  throw notPorted("album.emojiClasses.emojiClassesIn");
}

export async function randomEmojiNamesIn(ctx: QueryContext, workspace: string): Promise<string[]> {
  throw notPorted("album.emojiClasses.randomEmojiNamesIn");
}

export async function isClassed(ctx: QueryContext, workspace: string, name: string): Promise<boolean> {
  throw notPorted("album.emojiClasses.isClassed");
}

export async function classOf(ctx: QueryContext, workspace: string, name: string): Promise<EmojiClass | null> {
  throw notPorted("album.emojiClasses.classOf");
}

export async function classEmoji(ctx: MutationContext, workspace: string, name: string, emojiClass: EmojiClass): Promise<boolean> {
  throw notPorted("album.emojiClasses.classEmoji");
}

export async function unclassEmoji(ctx: MutationContext, workspace: string, name: string): Promise<void> {
  throw notPorted("album.emojiClasses.unclassEmoji");
}
