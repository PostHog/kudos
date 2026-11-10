// The module map's skeleton of convex/slack/thankYouNudge.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MessageDeleted, type MessageEvent } from "../engine/messageEvent.ts";
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export async function nudgeIfThankYou(ctx: ActionContext, event: MessageEvent | MessageDeleted | null): Promise<void> {
  throw notPorted("slack.thankYouNudge.nudgeIfThankYou");
}

export const deliverThankYouNudgeArgs = z.strictObject({ workspace: z.string(), user: z.string(), conversation: z.string(), threadRoot: z.optional(z.string()), ...attemptArgs });
export async function deliverThankYouNudge(ctx: ActionContext, args: z.infer<typeof deliverThankYouNudgeArgs>): Promise<void> {
  throw notPorted("slack.thankYouNudge.deliverThankYouNudge");
}
export const deliverThankYouNudgeJob = actionJob("slack.thankYouNudge.deliverThankYouNudge", deliverThankYouNudgeArgs, deliverThankYouNudge);
