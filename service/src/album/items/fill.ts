// The module map's skeleton of convex/album/items/fill.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import { zv } from "../../values.ts";
import type { MutationContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";
import { mutationJob } from "../../jobs/define.ts";

export const mostFilledOfAKind = 100;

const fillStepValidator = z.strictObject({ member: zv.id("members"), kind: z.union([z.literal("packs"), z.literal("tray"), z.literal("levels")]), cursor: z.optional(z.string()) });

export const fillItemsArgs = z.strictObject({ step: z.optional(fillStepValidator) });
export async function fillItems(ctx: MutationContext, args: z.infer<typeof fillItemsArgs>): Promise<null> {
  throw notPorted("album.items.fill.fillItems");
}
export const fillItemsJob = mutationJob("album.items.fill.fillItems", fillItemsArgs, fillItems);
