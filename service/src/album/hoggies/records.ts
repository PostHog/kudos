import { z } from "zod";
import { zv } from "../../values.ts";
import { appliedRewardValidator } from "../../progression/rewards.ts";
import { rarityValidator } from "./catalogue.ts";

export const dropValidator = z.strictObject({
  member: zv.id("members"),
  crate: z.string(),
  hoggie: z.string(),
  rarity: rarityValidator,
  n: zv.number(),
  copy: zv.number(),
  catalogueVersion: zv.number(),
  at: zv.number(),
  crest: z.optional(z.union([z.string(), z.null()])),
  pack: z.optional(appliedRewardValidator),
});

export const hoggieTallyValidator = z.strictObject({ member: zv.id("members"), hoggie: z.string(), count: zv.number(), firstAt: zv.number(), firstN: zv.number() });

export const trayDropValidator = z.strictObject({ member: zv.id("members"), crate: z.string(), putInAt: z.optional(zv.number()), crest: z.optional(z.union([z.string(), z.null()])) });

export const dropTallyValidator = z.strictObject({ member: zv.id("members"), drops: zv.number() });

export const hoggieAvatarValidator = z.strictObject({ member: zv.id("members"), hoggie: z.string() });

export const petHoggieValidator = z.strictObject({ workspace: z.string(), member: zv.id("members"), hoggie: z.string() });

export const boughtCrateValidator = z.strictObject({ member: zv.id("members"), crate: z.string(), n: zv.number(), boughtAt: zv.number(), openedAt: z.optional(zv.number()) });

const crateRefusalReasonValidator = z.union([z.literal("stale"), z.literal("coins-not-open"), z.literal("no-coins")]);

export const crateRefusalValidator = z.strictObject({ kind: z.literal("refused"), crate: z.string(), reason: crateRefusalReasonValidator });

export type DropRecord = z.infer<typeof dropValidator>;

export type CrateRefusal = z.infer<typeof crateRefusalValidator>;

export type CratePurchaseOutcome = { kind: "bought"; crate: string } | CrateRefusal;
