// The module map's skeleton of convex/feedback/tierNotices.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { tierRefValidator, type TierRef } from "../achievements/ladders.ts";
import { unlockOpenedEventValidator } from "../bus/events.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { CompletedTeam } from "./notify.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const tierNoticeValidator = z.strictObject({
  member: zv.id("members"),
  workspace: z.string(),
  conversation: z.string(),
  message: z.string(),
  tiers: z.array(tierRefValidator),
});

export const tierSummaryValidator = z.strictObject({
  member: zv.id("members"),
  workspace: z.string(),
  tiers: z.array(tierRefValidator),
  batch: z.optional(zv.id("bookBatches")),
});

export type TiersEarned = { member: MemberId; message: MessageRef; at: number; earned: TierRef[]; completed?: CompletedTeam[] };

export async function tellTiersEarned(ctx: MutationContext, { member, message, at, earned, completed = [] }: TiersEarned): Promise<void> {
  throw notPorted("feedback.tierNotices.tellTiersEarned");
}

export const tellOpeningSummaryArgs = z.strictObject({ event: unlockOpenedEventValidator });
export async function tellOpeningSummary(ctx: MutationContext, args: z.infer<typeof tellOpeningSummaryArgs>): Promise<void> {
  throw notPorted("feedback.tierNotices.tellOpeningSummary");
}
export const tellOpeningSummaryJob = mutationJob("feedback.tierNotices.tellOpeningSummary", tellOpeningSummaryArgs, tellOpeningSummary);

export const tellBatchSummariesArgs = z.strictObject({ batch: zv.id("bookBatches"), cursor: z.union([z.string(), z.null()]) });
export async function tellBatchSummaries(ctx: MutationContext, args: z.infer<typeof tellBatchSummariesArgs>): Promise<void> {
  throw notPorted("feedback.tierNotices.tellBatchSummaries");
}
export const tellBatchSummariesJob = mutationJob("feedback.tierNotices.tellBatchSummaries", tellBatchSummariesArgs, tellBatchSummaries);
