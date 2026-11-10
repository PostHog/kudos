// The sticker backfill, as today's convex/stickers/backfill.ts: once per workspace, every award since the first records
// the stickers it gives, 50 awards a job, each job enqueuing the next until the awards end.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { stickerBackfills } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import { awardsInWorkspace } from "../engine/awards.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { recordStickersOf } from "./records.ts";

export const awardsPerBackfillPage = 50;

export const backfillStickersArgs = z.strictObject({ workspace: z.string() });

export async function backfillStickers(ctx: MutationContext, { workspace }: z.infer<typeof backfillStickersArgs>): Promise<void> {
  const backfill = await backfillOf(ctx, workspace);
  if (backfill === null || backfill.isDone) return;
  const { page, continueCursor, isDone } = await awardsInWorkspace(ctx, workspace, { cursor: backfill.cursor, numItems: awardsPerBackfillPage });
  for (const award of page) await recordStickersOf(ctx, award);
  await ctx.tx.update(stickerBackfills).set({ cursor: continueCursor, isDone }).where(eq(stickerBackfills._id, backfill._id));
  if (!isDone) await ctx.jobs.enqueue(backfillStickersJob, { workspace });
}

export const backfillStickersJob = mutationJob("stickers.backfill.backfillStickers", backfillStickersArgs, backfillStickers);

export async function startBackfillUnlessStarted(ctx: MutationContext, workspace: string): Promise<void> {
  if ((await backfillOf(ctx, workspace)) === null) await startBackfillIn(ctx, workspace);
}

async function startBackfillIn(ctx: MutationContext, workspace: string) {
  const backfill = await backfillOf(ctx, workspace);
  if (backfill !== null && !backfill.isDone) return;
  const fromTheFirstAward = { cursor: null, isDone: false };
  if (backfill === null) await ctx.tx.insert(stickerBackfills).values({ ...ctx.newRow(), workspace, ...fromTheFirstAward });
  else await ctx.tx.update(stickerBackfills).set(fromTheFirstAward).where(eq(stickerBackfills._id, backfill._id));
  await ctx.jobs.enqueue(backfillStickersJob, { workspace });
}

// The workspace's backfill; its cursor is null until a page has been read, as Convex stored it.
async function backfillOf({ tx }: QueryContext, workspace: string) {
  const rows = await tx
    .select({ _id: stickerBackfills._id, cursor: stickerBackfills.cursor, isDone: stickerBackfills.isDone })
    .from(stickerBackfills)
    .where(eq(stickerBackfills.workspace, workspace))
    .limit(2);
  return unique("stickerBackfills", rows);
}
