import { z } from "zod";
import { zv } from "../../values.ts";
import { milestoneIdValidator, milestoneTierValidator } from "../records.ts";
import { messageRefValidator } from "../../engine/messageEvent.ts";
import { rarityValidator, weightsNameValidator } from "../hoggies/catalogue.ts";
import { questValidator } from "../../quests/step.ts";

export const itemSourceValidator = z.union([z.literal("sticker"), z.literal("hoggie")]);

export const itemReasonValidator = z.union([
  z.strictObject({ kind: z.literal("thanks"), person: zv.id("members"), message: messageRefValidator }),
  z.strictObject({ kind: z.literal("levelUp"), level: zv.number() }),
  z.strictObject({ kind: z.literal("welcome") }),
  z.strictObject({ kind: z.literal("team"), team: z.string(), name: z.string() }),
  z.strictObject({ kind: z.literal("milestone"), milestone: milestoneIdValidator, tier: milestoneTierValidator }),
  z.strictObject({ kind: z.literal("forge"), hoggie: z.string() }),
  z.strictObject({ kind: z.literal("quest"), quest: questValidator }),
  z.strictObject({ kind: z.literal("hug") }),]
);

export const itemValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  source: itemSourceValidator,
  key: z.string(),
  floor: z.optional(rarityValidator),
  cap: z.optional(rarityValidator),
  weights: z.optional(weightsNameValidator),
  reason: itemReasonValidator,
  earnedAt: zv.number(),
  turnedAt: z.optional(zv.number()),
});

export type ItemSource = z.infer<typeof itemSourceValidator>;

export type ItemReason = z.infer<typeof itemReasonValidator>;

export type Earning = Omit<z.infer<typeof itemValidator>, "turnedAt">;
