import { v, type Infer } from "convex/values";

export const journeyStepValidator = v.union(v.literal("first-thanks"), v.literal("first-quest"), v.literal("someone-new"), v.literal("two-days"), v.literal("your-emoji"), v.literal("hugs-3"), v.literal("hugs-5"), v.literal("hugs-10"));

export type JourneyStep = Infer<typeof journeyStepValidator>;

export const journeyQuestValidator = v.object({ kind: v.literal("journey"), step: journeyStepValidator });

export type JourneyQuest = Infer<typeof journeyQuestValidator>;

export const weeklyQuestValidator = v.object({ kind: v.literal("weekly"), week: v.string(), slot: v.number() });

export type WeeklyQuest = Infer<typeof weeklyQuestValidator>;

export const questValidator = v.union(journeyQuestValidator, weeklyQuestValidator);

export type Quest = Infer<typeof questValidator>;
