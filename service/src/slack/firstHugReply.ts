// The module map's skeleton of convex/slack/firstHugReply.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

const huggedValidator = z.union([z.strictObject({ kind: z.literal("author"), name: z.optional(z.string()) }), z.strictObject({ kind: z.literal("peopleThanked") })]);

export const deliverFirstHugReplyArgs = z.strictObject({ workspace: z.string(), user: z.string(), conversation: z.string(), hugged: huggedValidator, ...attemptArgs });
export async function deliverFirstHugReply(ctx: ActionContext, args: z.infer<typeof deliverFirstHugReplyArgs>): Promise<void> {
  throw notPorted("slack.firstHugReply.deliverFirstHugReply");
}
export const deliverFirstHugReplyJob = actionJob("slack.firstHugReply.deliverFirstHugReply", deliverFirstHugReplyArgs, deliverFirstHugReply);
