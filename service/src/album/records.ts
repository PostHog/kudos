import { z } from "zod";
import { zv } from "../values.ts";
import { awardIdValidator } from "../engine/awards.ts";
import { messageRefValidator } from "../engine/messageEvent.ts";
import { rarityValidator } from "./hoggies/catalogue.ts";

export const grantOutcomeValidator = z.union([z.literal("new"), z.literal("held"), z.literal("waiting"), z.literal("nextWeek")]);

export type GrantOutcome = z.infer<typeof grantOutcomeValidator>;

export const thoughtfulPackValidator = z.strictObject({
  workspace: z.string(),
  giver: zv.id("members"),
  recipient: zv.id("members"),
  week: z.string(),
  message: messageRefValidator,
  holdsSticker: z.boolean(),
  at: zv.number(),
  openedAt: z.optional(zv.number()),
});

export const grantRecordValidator = z.strictObject({
  giver: zv.id("members"),
  message: messageRefValidator,
  recipient: zv.id("members"),
  outcome: grantOutcomeValidator,
});

export const thoughtfulTallyValidator = z.strictObject({ workspace: z.string(), week: z.string(), giver: zv.id("members"), awards: zv.number() });

export const thoughtfulBoardTallyValidator = z.strictObject({ workspace: z.string(), period: z.string(), giver: zv.id("members"), awards: zv.number() });

export const grantToldValidator = z.strictObject({ message: messageRefValidator, at: z.optional(zv.number()), recipients: z.optional(zv.number()) });

export const albumStickerValidator = z.strictObject({
  member: zv.id("members"),
  person: zv.id("members"),
  from: z.union([z.literal("pack"), z.literal("history"), z.literal("reactions")]),
  pack: z.optional(zv.id("thoughtfulPacks")),
  at: zv.number(),
});

const trayItemFields = { member: zv.id("members"), pack: zv.id("thoughtfulPacks"), at: zv.number(), putInAt: z.optional(zv.number()) };

export const trayItemValidator = z.union([
  z.strictObject({ ...trayItemFields, kind: z.literal("sticker"), person: zv.id("members") }),
  z.strictObject({ ...trayItemFields, kind: z.literal("hoggie"), hoggie: z.string(), rarity: rarityValidator, isNew: z.boolean() }),]
);

export const teamArtValidator = z.union([z.strictObject({ kind: z.literal("crest"), slug: z.string() }), z.strictObject({ kind: z.literal("image"), url: z.string() }), z.null()]);

export const teamStickerValidator = z.strictObject({ member: zv.id("members"), workspace: z.optional(z.string()), team: z.string(), at: zv.number(), name: z.string(), art: teamArtValidator, emoji: z.string() });

export type TeamSticker = Omit<z.infer<typeof teamStickerValidator>, "member" | "workspace">;

export const milestoneTierValidator = z.union([z.literal("bronze"), z.literal("silver"), z.literal("gold"), z.literal("diamond")]);

export type MilestoneTier = z.infer<typeof milestoneTierValidator>;

export const milestoneIdValidator = z.union([z.literal("people"), z.literal("teams"), z.literal("reach"), z.literal("hoggies"), z.literal("thoughtful")]);

export type MilestoneId = z.infer<typeof milestoneIdValidator>;

export const milestoneTierRecordValidator = z.strictObject({ member: zv.id("members"), milestone: milestoneIdValidator, tier: milestoneTierValidator, at: zv.number(), catalogue: zv.number() });

export const emojiMapperValidator = z.strictObject({ member: zv.id("members"), as: z.union([z.literal("member"), z.literal("maintainer")]) });

export type EmojiMapper = z.infer<typeof emojiMapperValidator>;

export const emojiNameValidator = z.strictObject({ workspace: z.string(), emoji: z.string(), person: z.optional(zv.id("members")), name: z.string(), mappedBy: z.optional(emojiMapperValidator) });

export const secondEmojiNameValidator = z.strictObject({ workspace: z.string(), emoji: z.string(), name: z.string() });

export const seenEmojiValidator = z.strictObject({ member: zv.id("members"), emoji: z.string(), at: zv.number() });

export const kudosEmojiPickValidator = z.strictObject({ member: zv.id("members"), emoji: z.string() });

export const emojiNameNumberValidator = z.strictObject({ workspace: z.string(), stem: z.string(), last: zv.number() });

export const emojiClassValidator = z.strictObject({ workspace: z.string(), name: z.string(), class: z.union([z.literal("random"), z.literal("unmapped")]) });

export const randomEmojiDropValidator = z.strictObject({ member: zv.id("members"), name: z.string(), pack: zv.id("thoughtfulPacks"), at: zv.number() });

export const albumHistoryValidator = z.strictObject({
  workspace: z.string(),
  startedAt: zv.number(),
  phase: z.union([z.literal("kudos"), z.literal("hugs")]),
  cursor: z.union([z.string(), z.null()]),
  hug: z.optional(zv.id("hugs")),
  hugPeopleAfter: z.optional(zv.id("members")),
  done: z.boolean(),
});

const kudosPickValidator = z.strictObject({ message: messageRefValidator, words: zv.number(), at: zv.number() });

export type KudosPick = z.infer<typeof kudosPickValidator>;

export const pairTallyValidator = z.strictObject({
  member: zv.id("members"),
  person: zv.id("members"),
  firstThankedAt: z.union([zv.number(), z.null()]),
  kudosGiven: zv.number(),
  kudosReceived: zv.number(),
  hugsGiven: zv.number(),
  hugsReceived: zv.number(),
  best: z.union([kudosPickValidator, z.null()]),
});

const peopleListValidator = z.strictObject({ people: z.array(zv.id("members")), more: zv.number() });

export const weekListValidator = z.union([z.literal("thanked"), z.literal("thankedBy"), z.literal("hugged"), z.literal("huggedBy")]);

export type WeekList = z.infer<typeof weekListValidator>;

const hugPickValidator = z.strictObject({ message: messageRefValidator, hugs: zv.number(), words: zv.number(), at: zv.number() });

export type HugPick = z.infer<typeof hugPickValidator>;

const hoggieFoundValidator = z.strictObject({ hoggie: z.string(), rarity: rarityValidator });

export type HoggieFound = z.infer<typeof hoggieFoundValidator>;

const hoggiesListValidator = z.strictObject({ hoggies: z.array(hoggieFoundValidator), more: zv.number() });

export const weekTallyValidator = z.strictObject({
  member: zv.id("members"),
  week: z.string(),
  kudosGiven: zv.number(),
  kudosReceived: zv.number(),
  thoughtfulGiven: zv.number(),
  thoughtfulReceived: zv.number(),
  hugsGiven: zv.number(),
  hugsReceived: zv.number(),
  thanked: peopleListValidator,
  thankedBy: peopleListValidator,
  hugged: peopleListValidator,
  huggedBy: peopleListValidator,
  kudosOfWeek: z.union([hugPickValidator, z.null()]),
  days: z.array(zv.number()),
  packsOpened: z.optional(zv.number()),
  newFaces: z.optional(peopleListValidator),
  hoggiesFound: z.optional(hoggiesListValidator),
});

export const weekPersonValidator = z.strictObject({ member: zv.id("members"), week: z.string(), list: weekListValidator, person: zv.id("members") });

export const talliedAwardValidator = z.strictObject({ award: awardIdValidator, everyKudos: z.optional(z.literal(true)) });

export const boardCountedAwardValidator = z.strictObject({ award: awardIdValidator });

export const talliedHugValidator = z.strictObject({ hug: zv.id("hugs"), person: zv.id("members") });

export const hypeReactionValidator = z.strictObject({
  workspace: z.string(),
  giver: zv.id("members"),
  owner: zv.id("members"),
  author: zv.id("members"),
  emoji: z.string(),
  conversation: z.string(),
  message: z.string(),
  at: zv.number(),
});

export const hypeCollectedValidator = z.strictObject({
  workspace: z.string(),
  member: zv.id("members"),
  person: zv.id("members"),
  at: zv.number(),
});
