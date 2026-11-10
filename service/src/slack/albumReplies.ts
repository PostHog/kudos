// The module map's skeleton of convex/slack/albumReplies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { thoughtfulPacksGrantedEventValidator } from "../bus/events.ts";
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export const deliverAlbumReplyArgs = z.strictObject({ event: thoughtfulPacksGrantedEventValidator, ...attemptArgs });
export async function deliverAlbumReply(ctx: ActionContext, args: z.infer<typeof deliverAlbumReplyArgs>): Promise<void> {
  throw notPorted("slack.albumReplies.deliverAlbumReply");
}
export const deliverAlbumReplyJob = actionJob("slack.albumReplies.deliverAlbumReply", deliverAlbumReplyArgs, deliverAlbumReply);
