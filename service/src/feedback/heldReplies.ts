// The held reply, as today's convex/feedback/heldReplies.ts: the private reply to a kudos message that still waits to
// be released, as when its quests or its item have not come yet.
import { and, asc, eq } from "drizzle-orm";
import type { MessageRef } from "../engine/messageEvent.ts";
import { toDocument } from "../db/documents.ts";
import { privateReplies } from "../db/schema/feedback.ts";
import type { Doc } from "../db/schema/index.ts";
import type { QueryContext } from "../operations.ts";

/** The message's first held reply, in the order Convex's `by_held_message` index gave it. */
export async function heldReplyOf({ tx }: QueryContext, { workspace, conversation, message }: MessageRef): Promise<null | Doc<"privateReplies">> {
  const [row] = await tx
    .select()
    .from(privateReplies)
    .where(and(eq(privateReplies.workspace, workspace), eq(privateReplies.conversation, conversation), eq(privateReplies.message, message), eq(privateReplies.held, true)))
    .orderBy(asc(privateReplies._creationTime), asc(privateReplies._id))
    .limit(1);
  return row === undefined ? null : toDocument<Doc<"privateReplies">>(privateReplies, row);
}
