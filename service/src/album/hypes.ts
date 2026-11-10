// The module map's skeleton of convex/album/hypes.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type HypeEmoji = { owner: MemberId; held: boolean };

export async function hypeEmojiFor(ctx: QueryContext, workspace: string, giver: MemberId | null, name: string): Promise<HypeEmoji | null> {
  throw notPorted("album.hypes.hypeEmojiFor");
}
