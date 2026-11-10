// The module map's skeleton of convex/stickers/backfill.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const awardsPerBackfillPage = 50;

export const backfillStickersArgs = z.strictObject({ workspace: z.string() });
export async function backfillStickers(ctx: MutationContext, args: z.infer<typeof backfillStickersArgs>): Promise<void> {
  throw notPorted("stickers.backfill.backfillStickers");
}
export const backfillStickersJob = mutationJob("stickers.backfill.backfillStickers", backfillStickersArgs, backfillStickers);

export async function startBackfillUnlessStarted(ctx: MutationContext, workspace: string): Promise<void> {
  throw notPorted("stickers.backfill.startBackfillUnlessStarted");
}
