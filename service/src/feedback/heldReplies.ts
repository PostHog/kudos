// The module map's skeleton of convex/feedback/heldReplies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MessageRef } from "../engine/messageEvent.ts";
import type { Doc } from "../db/schema/index.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export function heldReplyOf(ctx: QueryContext, { workspace, conversation, message }: MessageRef): Promise<null | Doc<"privateReplies">> {
  throw notPorted("feedback.heldReplies.heldReplyOf");
}
