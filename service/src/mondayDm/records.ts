import { z } from "zod";
import { zv } from "../values.ts";

export const mondayDmStateValidator = z.union([z.literal("scheduled"), z.literal("sent"), z.literal("skipped"), z.literal("failed")]);

const sectionOfTheRetiredCatchUp = z.literal("catch-up");

export const mondayDmSectionValidator = z.union([z.literal("hugs"), z.literal("quests"), sectionOfTheRetiredCatchUp]);

export const sentMondayDmSectionValidator = z.union([mondayDmSectionValidator, z.literal("nudge")]);

const recapLineValidator = z.union([z.string(), z.strictObject({ text: z.string(), link: z.strictObject({ url: z.string(), label: z.string() }) })]);

const hugsSectionValidator = z.strictObject({
  lines: z.array(recapLineValidator),
  closing: z.array(recapLineValidator),
  emojiLine: z.union([z.strictObject({ text: z.string(), pictures: z.array(z.strictObject({ url: z.string(), name: z.string() })) }), z.null()]),
});

const checklistItemValidator = z.strictObject({
  goal: z.string(),
  mark: z.union([z.literal("done"), z.literal("next"), z.literal("open")]),
  progress: z.union([z.string(), z.null()]),
  howTo: z.optional(z.string()),
  reward: z.optional(z.string()),
});

const mondayQuestsValidator = z.strictObject({
  heading: z.string(),
  checklist: z.array(checklistItemValidator),
  waiting: z.boolean(),
  links: z.union([z.strictObject({ book: z.string(), quests: z.string() }), z.null()]),
});

export const mondayDmContentValidator = z.strictObject({
  hugs: z.union([hugsSectionValidator, z.null()]),
  quests: z.union([mondayQuestsValidator, z.null()]),
  footer: z.union([z.strictObject({ appHome: z.string(), rest: z.string() }), z.null()]),
});

export const mondayDmValidator = z.strictObject({
  member: zv.id("members"),
  monday: z.string(),
  state: mondayDmStateValidator,
  dueAt: zv.number(),
  tries: zv.number(),
  sections: z.optional(z.array(mondayDmSectionValidator)),
  content: z.optional(mondayDmContentValidator),
});

export const mondayDmNudgeValidator = z.strictObject({ dm: zv.id("mondayDms"), line: z.string() });

export type MondayDmSection = z.infer<typeof mondayDmSectionValidator>;

export type SentMondayDmSection = z.infer<typeof sentMondayDmSectionValidator>;

export type MondayDmContent = z.infer<typeof mondayDmContentValidator>;
