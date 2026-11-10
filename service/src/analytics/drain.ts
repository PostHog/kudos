// The module map's skeleton of convex/analytics/drain.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob, actionJob } from "../jobs/define.ts";

type OutboxRow = Doc<"analyticsOutbox">;
type Claim = { token: string; rows: OutboxRow[] };

const answerValidator = z.union([z.literal("delivered"), z.literal("rejected"), z.literal("failed")]);
const sentPersonEventValidator = z.strictObject({ row: zv.id("analyticsOutbox"), distinctId: z.string() });

export const drainArgs = z.strictObject({ generation: z.string() });
export async function drain(ctx: ActionContext, args: z.infer<typeof drainArgs>): Promise<void> {
  throw notPorted("analytics.drain.drain");
}
export const drainJob = actionJob("analytics.drain.drain", drainArgs, drain);

export const claimArgs = z.strictObject({ generation: z.string() });
export async function claim(ctx: MutationContext, args: z.infer<typeof claimArgs>): Promise<null | Claim> {
  throw notPorted("analytics.drain.claim");
}

export const settleArgs = z.strictObject({ token: z.string(), rows: z.array(zv.id("analyticsOutbox")), people: z.array(sentPersonEventValidator), answer: answerValidator });
export async function settle(ctx: MutationContext, args: z.infer<typeof settleArgs>): Promise<void> {
  throw notPorted("analytics.drain.settle");
}

export const recoverArgs = z.strictObject({});
export async function recover(ctx: MutationContext, args: z.infer<typeof recoverArgs>): Promise<void> {
  throw notPorted("analytics.drain.recover");
}
export const recoverJob = mutationJob("analytics.drain.recover", recoverArgs, recover);

export const cleanUpArgs = z.strictObject({});
export async function cleanUp(ctx: MutationContext, args: z.infer<typeof cleanUpArgs>): Promise<void> {
  throw notPorted("analytics.drain.cleanUp");
}
export const cleanUpJob = mutationJob("analytics.drain.cleanUp", cleanUpArgs, cleanUp);

export function wakeDrain(ctx: MutationContext): Promise<void> {
  throw notPorted("analytics.drain.wakeDrain");
}
