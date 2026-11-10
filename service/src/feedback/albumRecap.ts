// The module map's skeleton of convex/feedback/albumRecap.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Instants } from "../album/packs.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type RecapEmojiPicture = { url: string; name: string };

export type RecapEmojiLine = { text: string; pictures: RecapEmojiPicture[] };

export const namesInTheLine = 25;

export async function emojiLineOf(ctx: QueryContext, owner: { workspace: string; member: MemberId }, week: Instants): Promise<RecapEmojiLine | null> {
  throw notPorted("feedback.albumRecap.emojiLineOf");
}
