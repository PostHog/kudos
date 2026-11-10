// The module map's skeleton of convex/achievements/replay.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { awardLadderValidator, tierValidator, type AwardLadderId } from "./ladders.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const bookReplayValidator = z.strictObject({
  workspace: z.string(),
  batch: zv.id("bookBatches"),
  ladder: awardLadderValidator,
  tiers: z.array(tierValidator),
  countsLadder: z.boolean(),
  cursor: z.optional(z.union([z.string(), z.null()])),
  isDone: z.boolean(),
});

export const bookReplayCursorValidator = z.strictObject({ replay: zv.id("bookReplays"), cursor: z.string() });

export type BatchId = Id<"bookBatches">;

export async function replayWhatIsNew(ctx: MutationContext, workspace: string): Promise<void> {
  throw notPorted("achievements.replay.replayWhatIsNew");
}

export async function laddersCountedLiveIn(ctx: QueryContext, workspace: string): Promise<AwardLadderId[]> {
  throw notPorted("achievements.replay.laddersCountedLiveIn");
}

export const replayPageArgs = z.strictObject({ replay: zv.id("bookReplays") });
export async function replayPage(ctx: MutationContext, args: z.infer<typeof replayPageArgs>): Promise<void> {
  throw notPorted("achievements.replay.replayPage");
}
export const replayPageJob = mutationJob("achievements.replay.replayPage", replayPageArgs, replayPage);
