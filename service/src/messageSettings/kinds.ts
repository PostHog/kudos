import { z } from "zod";

export const messageKindValidator = z.union([
  z.literal("kudos-reply"),
  z.literal("tips"),
  z.literal("level-ups"),
  z.literal("new-features"),
  z.literal("quests"),
  z.literal("achievements"),
  z.literal("celebrations"),
  z.literal("hugs-recap"),]
);

export type MessageKind = z.infer<typeof messageKindValidator>;

export const messagePlaceValidator = z.union([z.literal("channel"), z.literal("dm"), z.literal("none")]);

export type MessagePlace = z.infer<typeof messagePlaceValidator>;

export type MessageKindEntry = { kind: MessageKind; label: string; description: string };

export const messageKinds: readonly MessageKindEntry[] = [
  { kind: "kudos-reply", label: "After-kudos reply", description: "What a kudos you gave earned you, right after you send it." },
  { kind: "level-ups", label: "Level ups", description: "When you reach a level, with what it opens for you." },
  { kind: "new-features", label: "New features", description: "When a new feature is ready for you to open." },
  { kind: "quests", label: "Quests and Journey", description: "When you finish a quest or a Journey step." },
  { kind: "achievements", label: "Book tiers", description: "When you earn an achievement tier." },
  { kind: "celebrations", label: "Public celebrations", description: "Your level ups and tiers in the announcement channel." },
  { kind: "hugs-recap", label: "Weekly hugs recap", description: "Last week's hugs, the {kudos emoji} you and your teammates reacted, with their XP, on Monday morning." },
];

export const directMessageKinds: readonly MessageKind[] = ["level-ups", "new-features", "quests", "achievements"];

export const placesChosenFrom: Record<MessageKind, readonly MessagePlace[]> = {
  "kudos-reply": ["channel", "dm", "none"],
  tips: ["none"],
  "level-ups": ["dm", "channel", "none"],
  "new-features": ["dm", "none"],
  quests: ["dm", "channel", "none"],
  achievements: ["dm", "channel", "none"],
  celebrations: ["channel", "none"],
  "hugs-recap": ["dm", "none"],
};
