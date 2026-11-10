import { z } from "zod";
import { zv } from "../values.ts";

export const journeyStepValidator = z.union([z.literal("first-thanks"), z.literal("first-quest"), z.literal("someone-new"), z.literal("two-days"), z.literal("your-emoji"), z.literal("hugs-3"), z.literal("hugs-5"), z.literal("hugs-10")]);

export type JourneyStep = z.infer<typeof journeyStepValidator>;

export const journeyQuestValidator = z.strictObject({ kind: z.literal("journey"), step: journeyStepValidator });

export type JourneyQuest = z.infer<typeof journeyQuestValidator>;

export const weeklyQuestValidator = z.strictObject({ kind: z.literal("weekly"), week: z.string(), slot: zv.number() });

export type WeeklyQuest = z.infer<typeof weeklyQuestValidator>;

export const questValidator = z.union([journeyQuestValidator, weeklyQuestValidator]);

export type Quest = z.infer<typeof questValidator>;
