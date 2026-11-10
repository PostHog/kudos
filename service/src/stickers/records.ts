// The module map's skeleton of convex/stickers/records.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { awardIdValidator, type AwardId } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const stickerValidator = z.strictObject({
  member: zv.id("members"),
  person: zv.id("members"),
  firstAward: awardIdValidator,
  firstAt: zv.number(),
});

export const stickerBackfillValidator = z.strictObject({
  workspace: z.string(),
  cursor: z.union([z.string(), z.null()]),
  isDone: z.boolean(),
});

export type HeldSticker = { person: MemberId; firstAward: AwardId; firstAt: number };

export type Pair = { giver: MemberId; recipient: MemberId };

export type CollectedSticker = { collector: MemberId; person: MemberId; firstAward: AwardId; firstGiver: MemberId };

export async function recordStickersOf(ctx: MutationContext, { giver, recipient }: Pair): Promise<CollectedSticker[]> {
  throw notPorted("stickers.records.recordStickersOf");
}

export async function stickersNewestFirst(ctx: QueryContext, member: MemberId): Promise<HeldSticker[]> {
  throw notPorted("stickers.records.stickersNewestFirst");
}
