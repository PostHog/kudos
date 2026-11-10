// The module map's skeleton of convex/slack/channelLeaves.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { textOf } from "./directory.ts";
import type { EventCallback } from "./normalize.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

type ChannelEvent =
  | { type: "channel_shared"; channel?: unknown }
  | { type: "channel_rename" | "group_rename"; channel?: { id?: unknown } }
  | { type: "member_joined_channel"; channel?: unknown; user?: unknown };
type ChannelEventEnvelope = EventCallback & { event: ChannelEvent; authorizations?: Array<{ user_id?: string; is_bot?: boolean }> };
const channelEventTypes: ReadonlySet<string> = new Set(["channel_shared", "channel_rename", "group_rename", "member_joined_channel"]);

export const leaveOffLimitsChannelsArgs = z.strictObject({ cursor: z.optional(z.string()), queue: z.optional(z.array(z.string())), left: z.optional(zv.number()), missed: z.optional(zv.number()) });
export async function leaveOffLimitsChannels(ctx: ActionContext, args: z.infer<typeof leaveOffLimitsChannelsArgs>): Promise<void> {
  throw notPorted("slack.channelLeaves.leaveOffLimitsChannels");
}
export const leaveOffLimitsChannelsJob = actionJob("slack.channelLeaves.leaveOffLimitsChannels", leaveOffLimitsChannelsArgs, leaveOffLimitsChannels);

export const leaveIfOffLimitsArgs = z.strictObject({ channel: z.string(), attempt: z.optional(zv.number()) });
export async function leaveIfOffLimits(ctx: ActionContext, args: z.infer<typeof leaveIfOffLimitsArgs>): Promise<void> {
  throw notPorted("slack.channelLeaves.leaveIfOffLimits");
}
export const leaveIfOffLimitsJob = actionJob("slack.channelLeaves.leaveIfOffLimits", leaveIfOffLimitsArgs, leaveIfOffLimits);

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
