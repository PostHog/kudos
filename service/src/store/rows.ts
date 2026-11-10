import { z } from "zod";
import { zv } from "../values.ts";

export const collectedItemValidator = z.strictObject({
  member: zv.id("members"),
  item: z.string(),
  source: z.union([z.literal("store"), z.literal("tier")]),
  arrivedAt: zv.number(),
});

const refusalReasonValidator = z.union([z.literal("coins-not-open"), z.literal("not-for-sale"), z.literal("owned"), z.literal("no-coins")]);

export const itemRefusalValidator = z.strictObject({ kind: z.literal("refused"), item: z.string(), reason: refusalReasonValidator });

export const itemPurchaseOutcomeValidator = z.union([z.strictObject({ kind: z.literal("bought"), item: z.string() }), itemRefusalValidator]);

export const itemPurchaseValidator = z.strictObject({ member: zv.id("members"), key: z.string(), outcome: itemPurchaseOutcomeValidator });

export const customKudosEmojiValidator = z.strictObject({ workspace: z.string(), name: z.string(), url: z.string(), pickedAt: zv.number(), unpickedAt: z.optional(zv.number()) });

export type ItemPurchaseOutcome = z.infer<typeof itemPurchaseOutcomeValidator>;

export type ItemRefusal = z.infer<typeof itemRefusalValidator>;

export type CollectedItem = z.infer<typeof collectedItemValidator>;
