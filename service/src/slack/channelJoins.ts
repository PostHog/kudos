// The module map's skeleton of convex/slack/channelJoins.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { textOf } from "./directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

type ChannelCreated = { type: "channel_created"; channel?: { id?: unknown } };

export const joinPublicChannelsArgs = z.strictObject({ cursor: z.optional(z.string()), queue: z.optional(z.array(z.string())), joined: z.optional(zv.number()), missed: z.optional(zv.number()) });
export async function joinPublicChannels(ctx: ActionContext, args: z.infer<typeof joinPublicChannelsArgs>): Promise<void> {
  throw notPorted("slack.channelJoins.joinPublicChannels");
}
export const joinPublicChannelsJob = actionJob("slack.channelJoins.joinPublicChannels", joinPublicChannelsArgs, joinPublicChannels);

export const joinCreatedChannelArgs = z.strictObject({ channel: z.string(), attempt: z.optional(zv.number()) });
export async function joinCreatedChannel(ctx: ActionContext, args: z.infer<typeof joinCreatedChannelArgs>): Promise<void> {
  throw notPorted("slack.channelJoins.joinCreatedChannel");
}
export const joinCreatedChannelJob = actionJob("slack.channelJoins.joinCreatedChannel", joinCreatedChannelArgs, joinCreatedChannel);

export function isChannelCreated(event: { type: string }): event is ChannelCreated {
  return event.type === "channel_created";
}

export function channelCreationOf(workspace: unknown, eventId: unknown, event: ChannelCreated) {
  const [team, receipt, channel] = [textOf(workspace), textOf(eventId), textOf(event.channel?.id)];
  return team === undefined || receipt === undefined || channel === undefined ? null : { workspace: team, eventId: receipt, channel };
}
