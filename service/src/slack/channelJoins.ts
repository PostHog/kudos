// The app joins public channels, as today's convex/slack/channelJoins.ts: an operator's one-off joins every public
// channel it isn't in yet, a page of conversations.list and a Tier 3 slot at a time, and Slack's channel_created puts
// it in each new one, three tries at most. It never joins a shared or customer channel (./offLimitsChannels.ts).
import { ReportableError, typeOf } from "../analytics/exceptions.ts";
import { textOf } from "./directory.ts";
import { isOffLimits, joinRefusalOf, joinUnlessOffLimits, type ChannelTraits, type OffLimits } from "./offLimitsChannels.ts";
import { readSlack, retryDelayOf, slackErrorCodeOf, type SlackAnswer } from "./webApi.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";
import type { EventCallback, Handled } from "./frontDoor.ts";

type ListedChannel = ChannelTraits & { id: string; is_member?: boolean; is_archived?: boolean };
type ChannelsPage = { channels: ListedChannel[]; response_metadata?: { next_cursor?: string } };
type ChannelCreated = { type: "channel_created"; channel?: { id?: unknown } };
type Join = { kind: "joined" } | { kind: "already-in" } | { kind: "off-limits" } | { kind: "refused" } | { kind: "unanswered" } | { kind: "held"; forMs: number };

const channelsPerPage = "200";
const tier3JoinsPerMinute = 50;
const joinSpacingMs = Math.ceil(60_000 / tier3JoinsPerMinute) + 300;
const tier2ListsPerMinute = 20;
const listSpacingMs = Math.ceil(60_000 / tier2ListsPerMinute) + 300;
const lastPage = "";
const createdChannelTries = 3;
const unansweredRetryMs = 1_000;

export const joinPublicChannelsArgs = z.strictObject({ cursor: z.optional(z.string()), queue: z.optional(z.array(z.string())), joined: z.optional(zv.number()), missed: z.optional(zv.number()) });
export async function joinPublicChannels(ctx: ActionContext, { cursor, queue = [], joined = 0, missed = 0 }: z.infer<typeof joinPublicChannelsArgs>): Promise<void> {
  const tally = { joined, missed };
  if (queue.length > 0) {
    const [channel, ...rest] = queue;
    const join = await joinOf(channel!);
    if (join.kind === "held") await joinPublicChannelsLater(ctx, join.forMs, { cursor, queue, ...tally });
    else await joinPublicChannelsLater(ctx, joinSpacingMs, { cursor, queue: rest, ...tallied(tally, join) });
    return;
  }
  if (cursor === lastPage) {
    console.log(`channel joins finished: joined ${joined}, missed ${missed}`);
    return;
  }
  const page = await readSlack<ChannelsPage>("conversations.list", { types: "public_channel", exclude_archived: "true", limit: channelsPerPage, ...(cursor && { cursor }) });
  if (!page.ok && page.error === "ratelimited") {
    await joinPublicChannelsLater(ctx, retryDelayOf(page), { cursor, ...tally });
    return;
  }
  if (!page.ok) throw new ReportableError(`Slack conversations.list failed: ${slackErrorCodeOf(page.error)}`);
  const nextCursor = page.response_metadata?.next_cursor ?? lastPage;
  await joinPublicChannelsLater(ctx, listSpacingMs, { cursor: nextCursor, queue: page.channels.filter(isJoinable).map(({ id }) => id), ...tally });
}
export const joinPublicChannelsJob = actionJob("slack.channelJoins.joinPublicChannels", joinPublicChannelsArgs, joinPublicChannels);

function joinPublicChannelsLater(ctx: ActionContext, after: number, args: z.infer<typeof joinPublicChannelsArgs>) {
  return ctx.run.mutation("slack.channelJoins.joinPublicChannelsLater", (mutation) => mutation.jobs.enqueue(joinPublicChannelsJob, args, { after }));
}

export const joinCreatedChannelArgs = z.strictObject({ channel: z.string(), attempt: z.optional(zv.number()) });
export async function joinCreatedChannel(ctx: ActionContext, { channel, attempt = 1 }: z.infer<typeof joinCreatedChannelArgs>): Promise<void> {
  const retryInMs = retryDelayOfJoin(await joinOf(channel));
  if (retryInMs === null) return;
  if (attempt >= createdChannelTries) throw new ReportableError(`a new channel is still not joined after ${createdChannelTries} tries`);
  const next = { channel, attempt: attempt + 1 };
  await ctx.run.mutation("slack.channelJoins.joinCreatedChannelAgain", (mutation) => mutation.jobs.enqueue(joinCreatedChannelJob, next, { after: retryInMs }));
}
export const joinCreatedChannelJob = actionJob("slack.channelJoins.joinCreatedChannel", joinCreatedChannelArgs, joinCreatedChannel);

/**
 * The front door's `channelCreated` handler, in the mutation that keeps the event's receipt: the new channel is joined
 * at once, as today's receipt scheduled it. One without a team, event or channel ID is acknowledged and taken in by
 * nothing, so Slack's redelivery is handled again.
 */
export async function receiveChannelCreated(ctx: MutationContext, envelope: EventCallback): Promise<Handled> {
  const created = channelCreationOf(envelope.team_id, envelope.event_id, envelope.event as ChannelCreated);
  if (created === null) return "ignored";
  await ctx.jobs.enqueue(joinCreatedChannelJob, { channel: created.channel });
}

export function isChannelCreated(event: { type: string }): event is ChannelCreated {
  return event.type === "channel_created";
}

export function channelCreationOf(workspace: unknown, eventId: unknown, event: ChannelCreated) {
  const [team, receipt, channel] = [textOf(workspace), textOf(eventId), textOf(event.channel?.id)];
  return team === undefined || receipt === undefined || channel === undefined ? null : { workspace: team, eventId: receipt, channel };
}

function isJoinable(channel: ListedChannel) {
  return channel.is_member !== true && channel.is_archived !== true && joinRefusalOf(channel) === null;
}

async function joinOf(channel: string): Promise<Join> {
  const answer = await answerOrNothing(channel);
  if (answer === null) return { kind: "unanswered" };
  if (isOffLimits(answer)) return { kind: "off-limits" };
  if (answer.ok) return answer.warning === "already_in_channel" ? { kind: "already-in" } : { kind: "joined" };
  if (answer.error === "ratelimited") return { kind: "held", forMs: retryDelayOf(answer) };
  console.warn(`channel joins: conversations.join failed: ${slackErrorCodeOf(answer.error)}`);
  return { kind: "refused" };
}

function retryDelayOfJoin(join: Join) {
  if (join.kind === "held") return join.forMs;
  return join.kind === "unanswered" ? unansweredRetryMs : null;
}

async function answerOrNothing(channel: string): Promise<SlackAnswer | OffLimits | null> {
  try {
    return await joinUnlessOffLimits(channel);
  } catch (error) {
    console.warn(`channel joins: conversations.join has no answer: ${typeOf(error)}`);
    return null;
  }
}

function tallied({ joined, missed }: { joined: number; missed: number }, join: Join) {
  if (join.kind === "joined") return { joined: joined + 1, missed };
  return join.kind === "already-in" || join.kind === "off-limits" ? { joined, missed } : { joined, missed: missed + 1 };
}
