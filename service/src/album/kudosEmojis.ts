// The module map's skeleton of convex/album/kudosEmojis.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ParseHook } from "../parser/parser.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted, notPortedValue } from "../notPorted.ts";

export type KudosEmojiPick = { kind: "picked"; picks: string[] } | { kind: "full" } | { kind: "refused" };

export const earnedEmojiHook: ParseHook = notPortedValue("album.kudosEmojis.earnedEmojiHook");

export async function kudosEmojiPicksOf(ctx: QueryContext, member: MemberId): Promise<string[]> {
  throw notPorted("album.kudosEmojis.kudosEmojiPicksOf");
}

export async function pickKudosEmoji(ctx: MutationContext, member: MemberId, emoji: string, picked: boolean): Promise<KudosEmojiPick> {
  throw notPorted("album.kudosEmojis.pickKudosEmoji");
}
