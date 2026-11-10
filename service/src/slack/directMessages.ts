// The module map's skeleton of convex/slack/directMessages.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { messageRefValidator } from "../engine/messageEvent.ts";
import { notificationValidator } from "../feedback/notify.ts";
import { purchaseOutcomeValidator } from "../progression/purchases.ts";
import { attemptArgs, besideValidator } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

const directMessageArgs = { member: zv.id("members"), workspace: z.string(), user: z.string(), notification: notificationValidator, kudos: z.optional(messageRefValidator) };

export const deliverDirectMessageArgs = z.strictObject({ ...directMessageArgs, ...attemptArgs });
export async function deliverDirectMessage(ctx: ActionContext, args: z.infer<typeof deliverDirectMessageArgs>): Promise<void> {
  throw notPorted("slack.directMessages.deliverDirectMessage");
}
export const deliverDirectMessageJob = actionJob("slack.directMessages.deliverDirectMessage", deliverDirectMessageArgs, deliverDirectMessage);

export const deliverPurchaseReplyArgs = z.strictObject({ member: zv.id("members"), workspace: z.string(), conversation: z.string(), beside: z.optional(besideValidator), outcome: purchaseOutcomeValidator, ...attemptArgs });
export async function deliverPurchaseReply(ctx: ActionContext, args: z.infer<typeof deliverPurchaseReplyArgs>): Promise<void> {
  throw notPorted("slack.directMessages.deliverPurchaseReply");
}
export const deliverPurchaseReplyJob = actionJob("slack.directMessages.deliverPurchaseReply", deliverPurchaseReplyArgs, deliverPurchaseReply);
