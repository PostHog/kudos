// The module map's skeleton of convex/slack/mondayPost.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Words } from "../feedback/mondayPost.ts";
import { escaped } from "./blocks.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export const checkPickedChannelArgs = z.strictObject({ workspace: z.string(), channel: z.string(), pick: zv.number() });
export async function checkPickedChannel(ctx: ActionContext, args: z.infer<typeof checkPickedChannelArgs>): Promise<void> {
  throw notPorted("slack.mondayPost.checkPickedChannel");
}
export const checkPickedChannelJob = actionJob("slack.mondayPost.checkPickedChannel", checkPickedChannelArgs, checkPickedChannel);

export const postMondayPostArgs = z.strictObject({ workspace: z.string(), generation: zv.number(), attempt: z.optional(zv.number()) });
export async function postMondayPost(ctx: ActionContext, args: z.infer<typeof postMondayPostArgs>): Promise<void> {
  throw notPorted("slack.mondayPost.postMondayPost");
}
export const postMondayPostJob = actionJob("slack.mondayPost.postMondayPost", postMondayPostArgs, postMondayPost);

export function mrkdwnOf(words: Words[]) {
  return words.map(({ text, strong, link }) => {
    const shown = link === undefined ? escaped(text) : `<${link}|${escaped(text)}>`;
    return strong ? `*${shown}*` : shown;
  }).join("");
}

export function plainOf(words: Words[]) {
  return words.map(({ text }) => text).join("");
}
