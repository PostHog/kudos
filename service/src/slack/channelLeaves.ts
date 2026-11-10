// The app leaves shared and customer channels, as today's convex/slack/channelLeaves.ts: an operator's one-off leaves
// every off-limits channel it is in, public or private, a Tier 3 slot at a time, and Slack's channel events (a share, a
// rename, the app's own bot added) check that one channel and leave it when it is off limits, three tries at most.
import { ReportableError, typeOf } from "../analytics/exceptions.ts";
import { textOf } from "./directory.ts";
import { offLimitsReasonOf, type ChannelTraits } from "./offLimitsChannels.ts";
import { callSlack, readSlack, retryDelayOf, slackErrorCodeOf, type SlackAnswer } from "./webApi.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";
import type { EventCallback, Handled } from "./frontDoor.ts";

type JoinedChannel = ChannelTraits & { id: string };
type JoinedChannelsPage = { channels: JoinedChannel[]; response_metadata?: { next_cursor?: string } };
type ChannelInfo = { channel: ChannelTraits };
type Leave = { kind: "left" } | { kind: "kept" } | { kind: "missed" } | { kind: "held"; forMs: number };
type LeaveAnswer = SlackAnswer & { not_in_channel?: boolean };
type ChannelEvent =
  | { type: "channel_shared"; channel?: unknown }
  | { type: "channel_rename" | "group_rename"; channel?: { id?: unknown } }
  | { type: "member_joined_channel"; channel?: unknown; user?: unknown };
type ChannelEventEnvelope = EventCallback & { event: ChannelEvent; authorizations?: Array<{ user_id?: string; is_bot?: boolean }> };

const channelsPerPage = "200";
const tier3CallsPerMinute = 50;
const callSpacingMs = Math.ceil(60_000 / tier3CallsPerMinute) + 300;
const lastPage = "";
const checkTries = 3;
const channelEventTypes: ReadonlySet<string> = new Set(["channel_shared", "channel_rename", "group_rename", "member_joined_channel"]);
const alreadyOut: ReadonlySet<string> = new Set(["not_in_channel", "channel_not_found"]);

export const leaveOffLimitsChannelsArgs = z.strictObject({ cursor: z.optional(z.string()), queue: z.optional(z.array(z.string())), left: z.optional(zv.number()), missed: z.optional(zv.number()) });
export async function leaveOffLimitsChannels(ctx: ActionContext, { cursor, queue = [], left = 0, missed = 0 }: z.infer<typeof leaveOffLimitsChannelsArgs>): Promise<void> {
  const tally = { left, missed };
  if (cursor !== lastPage) {
    const page = await readSlack<JoinedChannelsPage>("users.conversations", { types: "public_channel,private_channel", exclude_archived: "true", limit: channelsPerPage, ...(cursor && { cursor }) });
    if (!page.ok && page.error === "ratelimited") {
      await leaveOffLimitsChannelsLater(ctx, retryDelayOf(page), { cursor, queue, ...tally });
      return;
    }
    if (!page.ok) throw new ReportableError(`Slack users.conversations failed: ${slackErrorCodeOf(page.error)}`);
    const offLimits = page.channels.filter((channel) => offLimitsReasonOf(channel) !== null).map(({ id }) => id);
    await leaveOffLimitsChannelsLater(ctx, callSpacingMs, { cursor: page.response_metadata?.next_cursor ?? lastPage, queue: [...queue, ...offLimits], ...tally });
    return;
  }
  const [channel, ...rest] = queue;
  if (channel === undefined) {
    console.log(`channel leaves finished: left ${left}, missed ${missed}`);
    return;
  }
  const leave = await leaveIfStillOffLimits(channel);
  if (leave.kind === "held") await leaveOffLimitsChannelsLater(ctx, leave.forMs, { cursor, queue, ...tally });
  else await leaveOffLimitsChannelsLater(ctx, callSpacingMs, { cursor, queue: rest, ...tallied(tally, leave) });
}
export const leaveOffLimitsChannelsJob = actionJob("slack.channelLeaves.leaveOffLimitsChannels", leaveOffLimitsChannelsArgs, leaveOffLimitsChannels);

function leaveOffLimitsChannelsLater(ctx: ActionContext, after: number, args: z.infer<typeof leaveOffLimitsChannelsArgs>) {
  return ctx.run.mutation("slack.channelLeaves.leaveOffLimitsChannelsLater", (mutation) => mutation.jobs.enqueue(leaveOffLimitsChannelsJob, args, { after }));
}

export const leaveIfOffLimitsArgs = z.strictObject({ channel: z.string(), attempt: z.optional(zv.number()) });
export async function leaveIfOffLimits(ctx: ActionContext, { channel, attempt = 1 }: z.infer<typeof leaveIfOffLimitsArgs>): Promise<void> {
  const leave = await leaveIfStillOffLimits(channel);
  if (leave.kind !== "held") return;
  if (attempt >= checkTries) throw new ReportableError(`a channel is still unchecked after ${checkTries} tries`);
  const next = { channel, attempt: attempt + 1 };
  await ctx.run.mutation("slack.channelLeaves.leaveIfOffLimitsAgain", (mutation) => mutation.jobs.enqueue(leaveIfOffLimitsJob, next, { after: leave.forMs }));
}
export const leaveIfOffLimitsJob = actionJob("slack.channelLeaves.leaveIfOffLimits", leaveIfOffLimitsArgs, leaveIfOffLimits);

/**
 * The front door's `channelEvent` handler, in the mutation that keeps the event's receipt: a share, a rename, or the
 * app's own bot joining checks that channel at once, as today's receipt scheduled it. Another member joining, or an
 * event without a team, event or channel ID, is acknowledged and taken in by nothing, so Slack's redelivery is
 * handled again.
 */
export async function receiveChannelEvent(ctx: MutationContext, envelope: EventCallback): Promise<Handled> {
  if (!isChannelEvent(envelope)) return "ignored";
  const check = channelCheckOf(envelope);
  if (check === null) return "ignored";
  await ctx.jobs.enqueue(leaveIfOffLimitsJob, { channel: check.channel });
}

export function isChannelEvent(envelope: EventCallback): envelope is ChannelEventEnvelope {
  return channelEventTypes.has(envelope.event.type);
}

export function channelCheckOf(envelope: ChannelEventEnvelope) {
  const [workspace, eventId, channel] = [textOf(envelope.team_id), textOf(envelope.event_id), channelOf(envelope)];
  return workspace === undefined || eventId === undefined || channel === undefined ? null : { workspace, eventId, channel };
}

function channelOf({ event, authorizations }: ChannelEventEnvelope) {
  if (event.type === "channel_rename" || event.type === "group_rename") return textOf(event.channel?.id);
  if (event.type === "member_joined_channel" && event.user !== appBotUserOf(authorizations)) return undefined;
  return textOf(event.channel);
}

function appBotUserOf(authorizations: ChannelEventEnvelope["authorizations"]) {
  return authorizations?.find((authorization) => authorization.is_bot === true)?.user_id;
}

async function leaveIfStillOffLimits(channel: string): Promise<Leave> {
  const info = await channelInfoOrNothing(channel);
  if (info === null) return { kind: "missed" };
  if (!info.ok && info.error === "ratelimited") return { kind: "held", forMs: retryDelayOf(info) };
  if (!info.ok) return missedAfter("conversations.info", info.error);
  return offLimitsReasonOf(info.channel) === null ? { kind: "kept" } : leaveOf(channel);
}

async function channelInfoOrNothing(channel: string) {
  try {
    return await readSlack<ChannelInfo>("conversations.info", { channel });
  } catch (error) {
    console.warn(`channel leaves: conversations.info has no answer: ${typeOf(error)}`);
    return null;
  }
}

async function leaveOf(channel: string): Promise<Leave> {
  try {
    const answer: LeaveAnswer = await callSlack("conversations.leave", { channel });
    if (answer.ok || answer.not_in_channel === true || alreadyOut.has(answer.error)) return { kind: "left" };
    if (answer.error === "ratelimited") return { kind: "held", forMs: retryDelayOf(answer) };
    return missedAfter("conversations.leave", answer.error);
  } catch (error) {
    console.warn(`channel leaves: conversations.leave has no answer: ${typeOf(error)}`);
    return { kind: "missed" };
  }
}

function missedAfter(method: string, error: string): Leave {
  console.warn(`channel leaves: ${method} failed: ${slackErrorCodeOf(error)}`);
  return { kind: "missed" };
}

function tallied({ left, missed }: { left: number; missed: number }, leave: Leave) {
  if (leave.kind === "left") return { left: left + 1, missed };
  return leave.kind === "kept" ? { left, missed } : { left, missed: missed + 1 };
}
