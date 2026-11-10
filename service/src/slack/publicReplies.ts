// The module map's skeleton of convex/slack/publicReplies.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export const deliverPublicReplyArgs = z.strictObject({ reply: zv.id("publicReplies"), ...attemptArgs });
export async function deliverPublicReply(ctx: ActionContext, args: z.infer<typeof deliverPublicReplyArgs>): Promise<void> {
  throw notPorted("slack.publicReplies.deliverPublicReply");
}
export const deliverPublicReplyJob = actionJob("slack.publicReplies.deliverPublicReply", deliverPublicReplyArgs, deliverPublicReply);
