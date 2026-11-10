// Stickers from kudos, as today's convex/stickers/stickers.ts: on `kudosGiven`, each award gives the giver and the
// recipient each other's sticker where they lack it, 50 awards a job; the first job starts the workspace's backfill,
// and the stickers collected publish `stickersCollected` and check the collectors' team pages.
import { z } from "zod";
import { kudosGivenEventValidator, type StickersCollectedEvent } from "../bus/events.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext } from "../operations.ts";
import { zv } from "../values.ts";
import { startBackfillUnlessStarted } from "./backfill.ts";
import { checkTeamPagesAfter, type NewSticker } from "./completions.ts";
import { recordStickersOf, type CollectedSticker } from "./records.ts";

export const awardsPerMutation = 50;

export const recordStickersArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });

export async function recordStickers(ctx: MutationContext, { event, from = 0 }: z.infer<typeof recordStickersArgs>): Promise<void> {
  if (from === 0) await startBackfillUnlessStarted(ctx, event.workspace);
  const next = from + awardsPerMutation;
  const newStickers: NewSticker[] = [];
  const collected: CollectedSticker[] = [];
  for (const award of event.awards.slice(from, next)) {
    const stickers = await recordStickersOf(ctx, award);
    collected.push(...stickers);
    for (const { collector } of stickers) newStickers.push({ member: collector, award: award.award });
  }
  if (collected.length > 0) {
    const stickersCollected: StickersCollectedEvent = { type: "stickersCollected", workspace: event.workspace, stickers: collected, at: event.at };
    await ctx.publish(stickersCollected);
  }
  await checkTeamPagesAfter(ctx, event, newStickers);
  if (next < event.awards.length) await ctx.jobs.enqueue(recordStickersJob, { event, from: next });
}

export const recordStickersJob = mutationJob("stickers.stickers.recordStickers", recordStickersArgs, recordStickers);
