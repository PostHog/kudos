import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { observedHttpAction } from "../analytics/boundary";
import { isHomeTabOpened } from "./appHome";
import { channelCreationOf, isChannelCreated } from "./channelJoins";
import { channelCheckOf, isChannelEvent } from "./channelLeaves";
import { emojiChangeOf, isEmojiChanged } from "./customEmoji";
import { directoryRecordOfEvent, isMemberChanged } from "./directory";
import { isUserGroupChanged, userGroupChangeOf } from "./userGroups";
import { isMessage, mayAffectKudos, messageEventOf, type EventCallback } from "./normalize";
import { isReactionAdded, hugReactionOf } from "./reactions";
import { isLinkShared, linkSharingOf } from "./linkPreviews";
import { readSignedBody } from "./signature";
import { nudgeIfThankYou } from "./thankYouNudge";

type Envelope = { type: "url_verification"; challenge: string } | EventCallback | { type: "app_rate_limited" };

export const slackEvents = observedHttpAction(receiveSlackEvent, { carriesWords: true });

async function receiveSlackEvent(ctx: ActionCtx, request: Request) {
  const body = await readSignedBody(request);
  if (body === null) return new Response(null, { status: 401 });

  const envelope = envelopeOf(body);
  if (envelope.type === "url_verification") return Response.json({ challenge: envelope.challenge });
  if (envelope.type === "event_callback" && isHomeTabOpened(envelope.event)) {
    await ctx.runMutation(internal.slack.receipts.receiveHomeOpened, {
      workspace: envelope.team_id,
      eventId: envelope.event_id,
      user: envelope.event.user,
      at: envelope.event_time * 1000,
    });
  } else if (envelope.type === "event_callback" && isMemberChanged(envelope.event)) {
    const memberChanged = directoryRecordOfEvent(envelope.team_id, envelope.event_id, envelope.event);
    if (memberChanged !== null) await ctx.runMutation(internal.slack.receipts.receiveMemberChanged, memberChanged);
  } else if (envelope.type === "event_callback" && isUserGroupChanged(envelope.event)) {
    const userGroupChanged = userGroupChangeOf(envelope.team_id, envelope.event_id, envelope.event);
    if (userGroupChanged !== null) await ctx.runMutation(internal.slack.receipts.receiveUserGroupChanged, userGroupChanged);
  } else if (envelope.type === "event_callback" && isEmojiChanged(envelope.event)) {
    const emojiChanged = emojiChangeOf(envelope.team_id, envelope.event_id);
    if (emojiChanged !== null) await ctx.runMutation(internal.slack.receipts.receiveEmojiChanged, emojiChanged);
  } else if (envelope.type === "event_callback" && isChannelCreated(envelope.event)) {
    const channelCreated = channelCreationOf(envelope.team_id, envelope.event_id, envelope.event);
    if (channelCreated !== null) await ctx.runMutation(internal.slack.receipts.receiveChannelCreated, channelCreated);
  } else if (envelope.type === "event_callback" && isChannelEvent(envelope)) {
    const channelCheck = channelCheckOf(envelope);
    if (channelCheck !== null) await ctx.runMutation(internal.slack.receipts.receiveChannelToCheck, channelCheck);
  } else if (envelope.type === "event_callback" && isLinkShared(envelope.event)) {
    const linkSharing = linkSharingOf({ ...envelope, event: envelope.event });
    if (linkSharing !== null) await ctx.runMutation(internal.slack.receipts.receiveLinkShared, linkSharing);
  } else if (envelope.type === "event_callback" && isReactionAdded(envelope)) {
    const reaction = hugReactionOf(envelope);
    if (reaction !== null && (await ctx.runQuery(internal.slack.reactions.mayReactWith, { workspace: reaction.workspace, giver: reaction.giver, emoji: reaction.emoji }))) await ctx.runMutation(internal.slack.receipts.receiveReaction, { eventId: envelope.event_id, reaction });
  } else if (envelope.type === "event_callback") {
    const event = messageEventOf(envelope);
    if (!isMessage(envelope.event) || mayAffectKudos(event)) await ctx.runMutation(internal.slack.receipts.receive, { workspace: envelope.team_id, eventId: envelope.event_id, event });
    await nudgeIfThankYou(ctx, event);
  }
  return new Response(null, { status: 200 });
}

function envelopeOf(body: Uint8Array): Envelope {
  try {
    return JSON.parse(new TextDecoder().decode(body)) as Envelope;
  } catch {
    throw new SyntaxError("Slack sent a signed body that isn't JSON");
  }
}
