// The module map's skeleton of convex/slack/verifyMember.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import { zv } from "../values.ts";
import type { Doc } from "../db/schema/index.ts";
import type { ActionContext, MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob, actionJob } from "../jobs/define.ts";

export const verificationTries = 3;

const personArgs = { workspace: z.string(), user: z.string() };

export async function verifyLater(ctx: MutationContext, workspace: string, user: string, { firstSignIn }: { firstSignIn: boolean }): Promise<void> {
  throw notPorted("slack.verifyMember.verifyLater");
}

export function verificationOf(ctx: QueryContext, workspace: string, user: string): Promise<null | Doc<"memberVerifications">> {
  throw notPorted("slack.verifyMember.verificationOf");
}

export const verifyMemberArgs = z.strictObject(personArgs);
export async function verifyMember(ctx: ActionContext, args: z.infer<typeof verifyMemberArgs>): Promise<void> {
  throw notPorted("slack.verifyMember.verifyMember");
}
export const verifyMemberJob = actionJob("slack.verifyMember.verifyMember", verifyMemberArgs, verifyMember);

export const recordAttemptArgs = z.strictObject({ ...personArgs, found: z.boolean(), retryAfterMs: z.optional(zv.number()) });
export async function recordAttempt(ctx: MutationContext, args: z.infer<typeof recordAttemptArgs>): Promise<void> {
  throw notPorted("slack.verifyMember.recordAttempt");
}

export const retryStrandedArgs = z.strictObject({});
export async function retryStranded(ctx: MutationContext, args: z.infer<typeof retryStrandedArgs>): Promise<void> {
  throw notPorted("slack.verifyMember.retryStranded");
}
export const retryStrandedJob = mutationJob("slack.verifyMember.retryStranded", retryStrandedArgs, retryStranded);
