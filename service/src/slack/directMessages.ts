// Direct messages and purchase replies, as today's convex/slack/directMessages.ts: a notice goes to the member's DM, or
// beside the kudos that caused it, as the member's message settings place it, and only while it is still wanted. A
// notice that more notices follow waits for them a moment, so they go out together.
import { messageRefValidator } from "../engine/messageEvent.ts";
import { placeBesideTheKudos } from "../feedback/beside.ts";
import { followersAwaitedUntil, linesStillWanted, notificationValidator, purchaseReplyStillWanted, type NotificationLine } from "../feedback/notify.ts";
import { purchaseOutcomeValidator } from "../progression/purchases.ts";
import { settingsFooterText } from "./appHomeLinks.ts";
import { buttonOf, mrkdwn } from "./blocks.ts";
import { attemptArgs, besideValidator, enqueueAt, sendBesideOrAsDirectMessage, sendOnce, slackLink, tryAtMostThreeTimes } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";

const directMessageArgs = { member: zv.id("members"), workspace: z.string(), user: z.string(), notification: notificationValidator, kudos: z.optional(messageRefValidator) };
const followerWaitMs = 1000;

export const deliverDirectMessageArgs = z.strictObject({ ...directMessageArgs, ...attemptArgs });
/** Sends a notice the member still wants where their settings place it, tried at most three times. */
export async function deliverDirectMessage(ctx: ActionContext, { attempt = 1, ...message }: z.infer<typeof deliverDirectMessageArgs>): Promise<void> {
  const { member, notification } = message;
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    async (attempt) => {
      const awaitedUntil = await ctx.run.query("feedback.notify.followersAwaitedUntil", (q) => followersAwaitedUntil(q, { member, notification }));
      if (awaitedUntil !== null && ctx.clock.now() < awaitedUntil) {
        await enqueueAt(ctx, deliverDirectMessageJob, { ...message, attempt }, ctx.clock.now() + followerWaitMs);
        return null;
      }
      const lines = await ctx.run.query("feedback.notify.linesStillWanted", (q) => linesStillWanted(q, { member, notification }));
      if (lines === null) return null;
      const content = messageOf(lines, message.workspace);
      const kudos = message.kudos;
      const destination = kudos === undefined ? "dm" : await ctx.run.query("feedback.beside.placeBesideTheKudos", (q) => placeBesideTheKudos(q, { member, notification, kudos }));
      if (destination === "none") return null;
      if (destination === "dm") return sendOnce(ctx, message.workspace, "chat.postMessage", { channel: message.user, ...content }, attempt);
      return sendBesideOrAsDirectMessage(ctx, message.workspace, message.user, destination, content, attempt);
    },
    (retry) => enqueueAt(ctx, deliverDirectMessageJob, { ...message, attempt: retry.attempt }, retry.at),
  );
}
export const deliverDirectMessageJob = actionJob("slack.directMessages.deliverDirectMessage", deliverDirectMessageArgs, deliverDirectMessage);

export const deliverPurchaseReplyArgs = z.strictObject({ member: zv.id("members"), workspace: z.string(), conversation: z.string(), beside: z.optional(besideValidator), outcome: purchaseOutcomeValidator, ...attemptArgs });
/** Tells a member what their purchase did, beside the command or in the conversation they bought in, while still wanted. */
export async function deliverPurchaseReply(ctx: ActionContext, { attempt = 1, ...reply }: z.infer<typeof deliverPurchaseReplyArgs>): Promise<void> {
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    async (attempt) => {
      const text = await ctx.run.query("feedback.notify.purchaseReplyStillWanted", (q) => purchaseReplyStillWanted(q, { member: reply.member, outcome: reply.outcome }));
      if (text === null) return null;
      if (reply.beside !== undefined) return sendBesideOrAsDirectMessage(ctx, reply.workspace, reply.conversation, reply.beside, { text }, attempt);
      return sendOnce(ctx, reply.workspace, "chat.postMessage", { channel: reply.conversation, text }, attempt);
    },
    (retry) => enqueueAt(ctx, deliverPurchaseReplyJob, { ...reply, attempt: retry.attempt }, retry.at),
  );
}
export const deliverPurchaseReplyJob = actionJob("slack.directMessages.deliverPurchaseReply", deliverPurchaseReplyArgs, deliverPurchaseReply);

function messageOf(lines: NotificationLine[], workspace: string) {
  const text = lines.map((line) => textOf(line, workspace)).join("\n");
  return lines.some(hasButton) ? { text, blocks: lines.map((line) => blockOf(line, workspace)) } : { text };
}

function hasButton(line: NotificationLine) {
  return typeof line !== "string" && "action" in line;
}

function blockOf(line: NotificationLine, workspace: string) {
  if (typeof line !== "string" && "action" in line) return { type: "section", text: mrkdwn(line.text), accessory: buttonOf(line.action) };
  return { type: "section", text: mrkdwn(textOf(line, workspace)) };
}

function textOf(line: NotificationLine, workspace: string) {
  if (typeof line === "string") return line;
  if ("link" in line) return slackLink(line.link);
  if ("footer" in line) return settingsFooterText(workspace, line.footer);
  return line.text;
}
