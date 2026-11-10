// The module map's skeleton of convex/slack/welcomeNudge.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { welcomeNudgeCauseValidator } from "../feedback/welcomeNudge.ts";
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export const deliverWelcomeNudgeArgs = z.strictObject({ workspace: z.string(), user: z.string(), member: zv.id("members"), cause: welcomeNudgeCauseValidator, ...attemptArgs });
export async function deliverWelcomeNudge(ctx: ActionContext, args: z.infer<typeof deliverWelcomeNudgeArgs>): Promise<void> {
  throw notPorted("slack.welcomeNudge.deliverWelcomeNudge");
}
export const deliverWelcomeNudgeJob = actionJob("slack.welcomeNudge.deliverWelcomeNudge", deliverWelcomeNudgeArgs, deliverWelcomeNudge);
