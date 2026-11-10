// The module map's skeleton of convex/slack/commands.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { periodValidator } from "../leaderboard/periods.ts";
import { attemptArgs } from "./delivery.ts";
import { cardViewedValidator } from "./profileCardCommand.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

const commandArgs = { workspace: z.string(), user: z.string(), alias: z.boolean(), arrivedAt: zv.number() };

const kudosCommandResultValidator = z.union([z.literal("joined"), z.literal("already-in"), z.literal("off-limits"), z.literal("private-channel"), z.literal("direct-message")]);

const commandUsedArgs = { ...commandArgs, result: kudosCommandResultValidator };

const viewedValidator = z.strictObject({ period: periodValidator, arrivedAt: zv.number(), groups: z.optional(z.boolean()), myGroup: z.optional(z.boolean()) });

const leaderboardViewedArgs = { workspace: z.string(), user: z.string(), ...viewedValidator.shape };

export const addToChannelArgs = z.strictObject({ ...commandArgs, channel: z.string(), inDirectMessage: z.boolean(), responseUrl: z.string() });
export async function addToChannel(ctx: ActionContext, args: z.infer<typeof addToChannelArgs>): Promise<void> {
  throw notPorted("slack.commands.addToChannel");
}
export const addToChannelJob = actionJob("slack.commands.addToChannel", addToChannelArgs, addToChannel);

export const reportCommandUsedArgs = z.strictObject({ ...commandUsedArgs, ...attemptArgs });
export async function reportCommandUsed(ctx: ActionContext, args: z.infer<typeof reportCommandUsedArgs>): Promise<void> {
  throw notPorted("slack.commands.reportCommandUsed");
}
export const reportCommandUsedJob = actionJob("slack.commands.reportCommandUsed", reportCommandUsedArgs, reportCommandUsed);

export const recordCommandUsedArgs = z.strictObject(commandUsedArgs);
export async function recordCommandUsed(ctx: MutationContext, args: z.infer<typeof recordCommandUsedArgs>): Promise<void> {
  throw notPorted("slack.commands.recordCommandUsed");
}

export const recordLeaderboardViewedArgs = z.strictObject(leaderboardViewedArgs);
export async function recordLeaderboardViewed(ctx: MutationContext, args: z.infer<typeof recordLeaderboardViewedArgs>): Promise<void> {
  throw notPorted("slack.commands.recordLeaderboardViewed");
}

export const exposeOnceKnownArgs = z.strictObject({
    workspace: z.string(),
    user: z.string(),
    flag: z.union([z.literal("everyone-board"), z.literal("unlocks"), z.literal("profile-card")]),
    shown: z.boolean(),
    viewed: z.optional(viewedValidator),
    cardViewed: z.optional(cardViewedValidator),
    ...attemptArgs,
  });
export async function exposeOnceKnown(ctx: ActionContext, args: z.infer<typeof exposeOnceKnownArgs>): Promise<void> {
  throw notPorted("slack.commands.exposeOnceKnown");
}
export const exposeOnceKnownJob = actionJob("slack.commands.exposeOnceKnown", exposeOnceKnownArgs, exposeOnceKnown);
