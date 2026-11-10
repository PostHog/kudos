// The module map's skeleton of convex/slack/mondayDm.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { attemptArgs } from "./delivery.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

export const sendMondayDmArgs = z.strictObject({ dm: zv.id("mondayDms"), attempt: zv.number() });
export async function sendMondayDm(ctx: ActionContext, args: z.infer<typeof sendMondayDmArgs>): Promise<void> {
  throw notPorted("slack.mondayDm.sendMondayDm");
}
export const sendMondayDmJob = actionJob("slack.mondayDm.sendMondayDm", sendMondayDmArgs, sendMondayDm);

export const showMondayDmArgs = z.strictObject({ dm: zv.id("mondayDms"), channel: z.string(), ts: z.string(), ...attemptArgs });
export async function showMondayDm(ctx: ActionContext, args: z.infer<typeof showMondayDmArgs>): Promise<void> {
  throw notPorted("slack.mondayDm.showMondayDm");
}
export const showMondayDmJob = actionJob("slack.mondayDm.showMondayDm", showMondayDmArgs, showMondayDm);
