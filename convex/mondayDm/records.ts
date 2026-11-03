import { v, type Infer } from "convex/values";

export const mondayDmStateValidator = v.union(v.literal("scheduled"), v.literal("sent"), v.literal("skipped"), v.literal("failed"));

const sectionOfTheRetiredCatchUp = v.literal("catch-up");

export const mondayDmSectionValidator = v.union(v.literal("hugs"), v.literal("quests"), sectionOfTheRetiredCatchUp);

export const sentMondayDmSectionValidator = v.union(mondayDmSectionValidator, v.literal("nudge"));

const recapLineValidator = v.union(v.string(), v.object({ text: v.string(), link: v.object({ url: v.string(), label: v.string() }) }));

const hugsSectionValidator = v.object({
  lines: v.array(recapLineValidator),
  closing: v.array(recapLineValidator),
  emojiLine: v.union(v.object({ text: v.string(), pictures: v.array(v.object({ url: v.string(), name: v.string() })) }), v.null()),
});

const checklistItemValidator = v.object({
  goal: v.string(),
  mark: v.union(v.literal("done"), v.literal("next"), v.literal("open")),
  progress: v.union(v.string(), v.null()),
  howTo: v.optional(v.string()),
  reward: v.optional(v.string()),
});

const mondayQuestsValidator = v.object({
  heading: v.string(),
  checklist: v.array(checklistItemValidator),
  waiting: v.boolean(),
  links: v.union(v.object({ book: v.string(), quests: v.string() }), v.null()),
});

export const mondayDmContentValidator = v.object({
  hugs: v.union(hugsSectionValidator, v.null()),
  quests: v.union(mondayQuestsValidator, v.null()),
  footer: v.union(v.object({ appHome: v.string(), rest: v.string() }), v.null()),
});

export const mondayDmValidator = v.object({
  member: v.id("members"),
  monday: v.string(),
  state: mondayDmStateValidator,
  dueAt: v.number(),
  tries: v.number(),
  sections: v.optional(v.array(mondayDmSectionValidator)),
  content: v.optional(mondayDmContentValidator),
});

export const mondayDmNudgeValidator = v.object({ dm: v.id("mondayDms"), line: v.string() });

export type MondayDmSection = Infer<typeof mondayDmSectionValidator>;

export type SentMondayDmSection = Infer<typeof sentMondayDmSectionValidator>;

export type MondayDmContent = Infer<typeof mondayDmContentValidator>;
