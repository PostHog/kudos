// The album's reply to a thoughtful kudos, as today's convex/slack/albumReplies.ts sends it: beside the kudos where
// the giver can see an ephemeral there, else as a direct message, and without its hype pictures when Slack refuses the
// blocks for them. Only a rate limit sends it again, at most three tries: a failed or uncertain post is never repeated.
import { thoughtfulPacksGrantedEventValidator, type ThoughtfulPacksGrantedEvent } from "../bus/events.ts";
import { albumReply, type AlbumReply, type AlbumReplyButton, type AlbumReplyDestination, type AlbumReplyRecipient } from "../feedback/albumReplies.ts";
import { escaped, mrkdwn, urlButtonOf } from "./blocks.ts";
import { attemptArgs, attemptCall, enqueueAt, isRateLimited, isRefusedAsEphemeral, isRefusedForItsBlocks, retryAfter, slackTextOf, tryAtMostThreeTimes, type Attempt, type Retry } from "./delivery.ts";
import { z } from "zod";
import type { ActionContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";

export const deliverAlbumReplyArgs = z.strictObject({ event: thoughtfulPacksGrantedEventValidator, ...attemptArgs });
export async function deliverAlbumReply(ctx: ActionContext, { event, attempt = 1 }: z.infer<typeof deliverAlbumReplyArgs>): Promise<void> {
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    (attempt) => sendAlbumReply(ctx, event, attempt),
    (retry) => enqueueAt(ctx, deliverAlbumReplyJob, { event, attempt: retry.attempt }, retry.at),
  );
}
export const deliverAlbumReplyJob = actionJob("slack.albumReplies.deliverAlbumReply", deliverAlbumReplyArgs, deliverAlbumReply);

async function sendAlbumReply(ctx: ActionContext, event: ThoughtfulPacksGrantedEvent, attempt: number): Promise<Retry> {
  const reply = await ctx.run.query("feedback.albumReplies.albumReply", (q) => albumReply(q, { event }));
  if (reply === null) return null;
  const result = await postAlbumReply(ctx, reply);
  return isRateLimited(result) ? retryAfter(result, attempt, ctx.clock.now()) : null;
}

async function postAlbumReply(ctx: ActionContext, reply: AlbumReply): Promise<Attempt> {
  const result = await postBesideOrAsDirectMessage(ctx, reply);
  return isRefusedForItsBlocks(result) && hasPictures(reply) ? postBesideOrAsDirectMessage(ctx, withoutPictures(reply)) : result;
}

async function postBesideOrAsDirectMessage(ctx: ActionContext, reply: AlbumReply): Promise<Attempt> {
  const { destination } = reply;
  if (destination.kind === "dm") return postAsDirectMessage(ctx, reply, destination);
  const ephemeral = { channel: destination.conversation, user: destination.user, ...(destination.threadRoot !== undefined && { thread_ts: destination.threadRoot }), ...contentOf(reply) };
  const result = await attemptCall(ctx, reply.workspace, "chat.postEphemeral", ephemeral);
  return isRefusedAsEphemeral(result) ? postAsDirectMessage(ctx, reply, destination) : result;
}

function postAsDirectMessage(ctx: ActionContext, reply: AlbumReply, { user }: AlbumReplyDestination): Promise<Attempt> {
  return attemptCall(ctx, reply.workspace, "chat.postMessage", { channel: user, ...contentOf(reply), unfurl_links: false, unfurl_media: false });
}

function hasPictures({ recipients }: AlbumReply) {
  return recipients.some(({ hype }) => hype?.picture);
}

function withoutPictures(reply: AlbumReply): AlbumReply {
  return { ...reply, recipients: reply.recipients.map((recipient) => (recipient.hype === null ? recipient : { ...recipient, hype: { ...recipient.hype, picture: null } })) };
}

function contentOf(reply: AlbumReply) {
  return { text: fallbackTextOf(reply), blocks: blocksOf(reply) };
}

function fallbackTextOf({ recipients }: AlbumReply) {
  return recipients.map(({ headline }) => escaped(headline)).join(" · ");
}

function blocksOf({ recipients, more, waiting, buttons, gains }: AlbumReply) {
  return [
    ...recipients.flatMap(recipientBlocksOf),
    ...(more > 0 ? [{ type: "context", elements: [mrkdwn(`And ${more} more.`)] }] : []),
    ...(waiting === null ? [] : [{ type: "context", elements: [mrkdwn(escaped(waiting))] }]),
    ...(buttons.length > 0 ? [{ type: "actions", elements: buttons.map(buttonOf) }] : []),
    ...(gains === null ? [] : [{ type: "context", elements: [mrkdwn(slackTextOf([gains]))] }]),
  ];
}

function recipientBlocksOf({ headline, lines, hype }: AlbumReplyRecipient) {
  const words = { type: "section", text: mrkdwn([`*${escaped(headline)}*`, ...lines.map(escaped)].join("\n")) };
  if (hype === null) return [words];
  const picture = hype.picture === null ? [] : [{ type: "image", image_url: hype.picture.url, alt_text: hype.picture.label }];
  return [words, { type: "context", elements: [...picture, mrkdwn(escaped(hype.line))] }];
}

function buttonOf({ label, url, id }: AlbumReplyButton) {
  return urlButtonOf({ label, url, actionId: id });
}
