// The module map's skeleton of convex/stickers/stickers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { kudosGivenEventValidator } from "../bus/events.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const awardsPerMutation = 50;

export const recordStickersArgs = z.strictObject({ event: kudosGivenEventValidator, from: z.optional(zv.number()) });
export async function recordStickers(ctx: MutationContext, args: z.infer<typeof recordStickersArgs>): Promise<void> {
  throw notPorted("stickers.stickers.recordStickers");
}
export const recordStickersJob = mutationJob("stickers.stickers.recordStickers", recordStickersArgs, recordStickers);
