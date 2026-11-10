import { z } from "zod";
import { zv } from "../values.ts";
import { ladderValidator, tierValidator } from "../achievements/ladders.ts";
import { awardIdValidator } from "../engine/awards.ts";
import { attributedAwardValidator, groupOrNoneValidator } from "../groups/attributedAward.ts";
import { primaryGroupCauseValidator } from "../groups/cause.ts";
import { annotationsValidator, messageRefValidator } from "../engine/messageEvent.ts";
import { perkValidator } from "../progression/tree.ts";
import { questIdValidator } from "../quests/pool.ts";
import { questValidator } from "../quests/step.ts";
import { featureValidator } from "../unlocks/feature.ts";
import { rarityValidator } from "../album/hoggies/catalogue.ts";
import { itemSourceValidator } from "../album/items/records.ts";
import { surfaceValidator } from "../commands/surface.ts";
import type { MemberId } from "../workspace/directory.ts";
import { grantOutcomeValidator, milestoneIdValidator, milestoneTierValidator } from "../album/records.ts";

function domainEvent<Fields extends z.ZodRawShape>(fields: Fields) {
  return z.strictObject({ ...fields, fact: z.optional(z.string()) });
}

export const awardValidator = z.strictObject({ award: awardIdValidator, giver: zv.id("members"), recipient: zv.id("members"), kudos: zv.number() });

export const kudosGivenEventValidator = domainEvent({
  type: z.literal("kudosGiven"),
  workspace: z.string(),
  message: messageRefValidator,
  giver: zv.id("members"),
  awards: z.array(awardValidator),
  via: z.literal("message"),
  kudosEmoji: z.string(),
  ownedEmoji: z.optional(z.array(z.string())),
  loadoutEmoji: z.optional(z.array(z.string())),
  annotations: annotationsValidator,
  allowance: z.strictObject({ dailyOpening: zv.number(), dailyLeft: zv.number() }),
  skippedMentions: zv.number(),
  retry: z.boolean(),
  inThread: z.boolean(),
  day: z.string(),
  at: zv.number(),
});

export const levelReachedEventValidator = domainEvent({
  type: z.literal("levelReached"),
  workspace: z.string(),
  member: zv.id("members"),
  level: zv.number(),
  skillPointsGained: zv.number(),
  skillPoints: zv.number(),
  xpToNextLevel: zv.number(),
  message: z.optional(messageRefValidator),
  at: zv.number(),
});

export const xpRecordedEventValidator = domainEvent({
  type: z.literal("xpRecorded"),
  workspace: z.string(),
  member: zv.id("members"),
  at: zv.number(),
});

export type KudosGivenEvent = z.infer<typeof kudosGivenEventValidator>;

export const attemptFailedEventValidator = domainEvent({
  type: z.literal("attemptFailed"),
  workspace: z.string(),
  message: messageRefValidator,
  giver: zv.id("members"),
  outcome: z.union([z.literal("over-allowance"), z.literal("invalid")]),
  recipients: zv.number(),
  perRecipient: zv.number(),
  cost: zv.number(),
  skippedMentions: zv.number(),
  retry: z.boolean(),
  inThread: z.boolean(),
  allowance: z.strictObject({ dailyLeft: zv.number() }),
  day: z.string(),
  at: zv.number(),
});

export type AttemptFailedEvent = z.infer<typeof attemptFailedEventValidator>;

export const memberWelcomedEventValidator = domainEvent({
  type: z.literal("memberWelcomed"),
  workspace: z.string(),
  member: zv.id("members"),
  as: z.union([z.literal("giver"), z.literal("recipient")]),
  at: zv.number(),
});

export type MemberWelcomedEvent = z.infer<typeof memberWelcomedEventValidator>;

export const memberGreetedEventValidator = domainEvent({
  type: z.literal("memberGreeted"),
  workspace: z.string(),
  member: zv.id("members"),
  owesTheWelcomeItem: z.boolean(),
  at: zv.number(),
});

export type MemberGreetedEvent = z.infer<typeof memberGreetedEventValidator>;

export type LevelReachedEvent = z.infer<typeof levelReachedEventValidator>;

export type XpRecordedEvent = z.infer<typeof xpRecordedEventValidator>;

const unlockFields = { workspace: z.string(), member: zv.id("members"), feature: featureValidator, at: zv.number() };

export const unlockReadyEventValidator = domainEvent({ type: z.literal("unlockReady"), ...unlockFields });

export const unlockOpenedEventValidator = domainEvent({ type: z.literal("unlockOpened"), ...unlockFields, byLaunch: z.optional(z.literal(true)) });

export type UnlockReadyEvent = z.infer<typeof unlockReadyEventValidator>;

export type UnlockOpenedEvent = z.infer<typeof unlockOpenedEventValidator>;

export const unlocksLaunchedEventValidator = domainEvent({
  type: z.literal("unlocksLaunched"),
  workspace: z.string(),
  openings: z.array(z.strictObject({ member: zv.id("members"), feature: featureValidator })),
  at: zv.number(),
});

export type UnlocksLaunchedEvent = z.infer<typeof unlocksLaunchedEventValidator>;

const questFields = { workspace: z.string(), member: zv.id("members"), quest: questValidator, at: zv.number() };

export const questFinishedEventValidator = domainEvent({
  type: z.literal("questFinished"),
  ...questFields,
  poolQuest: z.optional(questIdValidator),
  rewardKey: z.optional(z.string()),
  reward: z.optional(z.strictObject({ xp: zv.number(), coins: zv.number() })),
  catalogueVersion: z.optional(z.string()),
  cause: z.optional(messageRefValidator),
});

const weekFields = { workspace: z.string(), member: zv.id("members"), week: z.string(), at: zv.number() };

export const questsDrawnEventValidator = domainEvent({ type: z.literal("questsDrawn"), ...weekFields, quests: z.array(questIdValidator) });

export type QuestsDrawnEvent = z.infer<typeof questsDrawnEventValidator>;

export const achievementEarnedEventValidator = domainEvent({
  type: z.literal("achievementEarned"),
  workspace: z.string(),
  member: zv.id("members"),
  ladder: ladderValidator,
  tier: tierValidator,
  at: zv.number(),
  batch: z.optional(zv.id("bookBatches")),
});

export type AchievementEarnedEvent = z.infer<typeof achievementEarnedEventValidator>;

export const perkBoughtEventValidator = domainEvent({ type: z.literal("perkBought"), workspace: z.string(), member: zv.id("members"), perk: perkValidator, at: zv.number() });

export type PerkBoughtEvent = z.infer<typeof perkBoughtEventValidator>;

export const itemBoughtEventValidator = domainEvent({ type: z.literal("itemBought"), workspace: z.string(), member: zv.id("members"), item: z.string(), price: zv.number(), at: zv.number() });

export type ItemBoughtEvent = z.infer<typeof itemBoughtEventValidator>;

const membershipFields = { workspace: z.string(), member: zv.id("members"), at: zv.number() };

export const memberLeftEventValidator = domainEvent({ type: z.literal("memberLeft"), ...membershipFields });

export const memberRejoinedEventValidator = domainEvent({ type: z.literal("memberRejoined"), ...membershipFields });

export type MemberLeftEvent = z.infer<typeof memberLeftEventValidator>;

export type MemberRejoinedEvent = z.infer<typeof memberRejoinedEventValidator>;

export type QuestFinishedEvent = z.infer<typeof questFinishedEventValidator>;

export const primaryGroupChangedEventValidator = domainEvent({
  type: z.literal("primaryGroupChanged"),
  workspace: z.string(),
  member: zv.id("members"),
  from: z.union([zv.id("userGroups"), z.null()]),
  to: z.union([zv.id("userGroups"), z.null()]),
  cause: primaryGroupCauseValidator,
  at: zv.number(),
});

export type PrimaryGroupChangedEvent = z.infer<typeof primaryGroupChangedEventValidator>;

const attributedFields = {
  workspace: z.string(),
  message: messageRefValidator,
  giver: zv.id("members"),
  group: groupOrNoneValidator,
  kudos: zv.number(),
  day: z.string(),
  at: zv.number(),
  awards: z.array(attributedAwardValidator),
};

export const awardsAttributedEventValidator = domainEvent({ type: z.literal("awardsAttributed"), ...attributedFields });

export type AwardsAttributedEvent = z.infer<typeof awardsAttributedEventValidator>;

export const hoggieDroppedEventValidator = domainEvent({
  type: z.literal("hoggieDropped"),
  workspace: z.string(),
  member: zv.id("members"),
  crate: z.string(),
  hoggie: z.string(),
  rarity: rarityValidator,
  copy: zv.number(),
  at: zv.number(),
  pack: z.optional(z.strictObject({ xp: zv.number(), coins: zv.number() })),
  surface: z.optional(surfaceValidator),
});

export type HoggieDroppedEvent = z.infer<typeof hoggieDroppedEventValidator>;

export const teamPagesCompletedEventValidator = domainEvent({
  type: z.literal("teamPagesCompleted"),
  workspace: z.string(),
  member: zv.id("members"),
  message: messageRefValidator,
  award: awardIdValidator,
  teams: z.array(z.strictObject({ team: z.string(), people: zv.number() })),
  at: zv.number(),
  told: z.boolean(),
});

export type TeamPagesCompletedEvent = z.infer<typeof teamPagesCompletedEventValidator>;

export const stickersCollectedEventValidator = domainEvent({
  type: z.literal("stickersCollected"),
  workspace: z.string(),
  stickers: z.array(z.strictObject({ collector: zv.id("members"), person: zv.id("members"), firstAward: awardIdValidator, firstGiver: zv.id("members") })),
  at: zv.number(),
});

export type StickersCollectedEvent = z.infer<typeof stickersCollectedEventValidator>;

export const thoughtfulPacksGrantedEventValidator = domainEvent({
  type: z.literal("thoughtfulPacksGranted"),
  workspace: z.string(),
  giver: zv.id("members"),
  message: messageRefValidator,
  outcomes: z.array(z.strictObject({ recipient: zv.id("members"), outcome: grantOutcomeValidator })),
  at: zv.number(),
});

export type ThoughtfulPacksGrantedEvent = z.infer<typeof thoughtfulPacksGrantedEventValidator>;

export const stickerPutInEventValidator = domainEvent({ type: z.literal("stickerPutIn"), workspace: z.string(), member: zv.id("members"), person: zv.id("members"), at: zv.number() });

export type StickerPutInEvent = z.infer<typeof stickerPutInEventValidator>;

export const itemTurnedEventValidator = domainEvent({ type: z.literal("itemTurned"), workspace: z.string(), member: zv.id("members"), source: itemSourceValidator, rarity: z.optional(rarityValidator), isNew: z.boolean(), at: zv.number() });

export type ItemTurnedEvent = z.infer<typeof itemTurnedEventValidator>;

export const companyTeamsReplacedEventValidator = domainEvent({ type: z.literal("companyTeamsReplaced"), at: zv.number() });

export type CompanyTeamsReplacedEvent = z.infer<typeof companyTeamsReplacedEventValidator>;

export const companyMatchesKeptEventValidator = domainEvent({ type: z.literal("companyMatchesKept"), workspace: z.string(), at: zv.number() });

export type CompanyMatchesKeptEvent = z.infer<typeof companyMatchesKeptEventValidator>;

export const crateBoughtEventValidator = domainEvent({ type: z.literal("crateBought"), workspace: z.string(), member: zv.id("members"), crate: z.string(), price: zv.number(), at: zv.number() });

export type CrateBoughtEvent = z.infer<typeof crateBoughtEventValidator>;

export const hugGivenEventValidator = domainEvent({
  type: z.literal("hugGiven"),
  workspace: z.string(),
  giver: zv.id("members"),
  message: messageRefValidator,
  onKudos: z.boolean(),
  author: z.optional(zv.id("members")),
  at: zv.number(),
  day: z.string(),
  first: z.optional(z.boolean()),
  reaction: z.optional(z.string()),
  rewards: z.optional(z.boolean()),
});

export type HugGivenEvent = z.infer<typeof hugGivenEventValidator>;

export const hugReceivedEventValidator = domainEvent({
  type: z.literal("hugReceived"),
  workspace: z.string(),
  giver: zv.id("members"),
  person: zv.id("members"),
  message: messageRefValidator,
  at: zv.number(),
  week: z.string(),
  rewards: z.optional(z.boolean()),
});

export type HugReceivedEvent = z.infer<typeof hugReceivedEventValidator>;

export const hypeReactedEventValidator = domainEvent({
  type: z.literal("hypeReacted"),
  workspace: z.string(),
  giver: zv.id("members"),
  owner: zv.id("members"),
  author: zv.id("members"),
  emoji: z.string(),
  message: messageRefValidator,
  at: zv.number(),
});

export type HypeReactedEvent = z.infer<typeof hypeReactedEventValidator>;

export const medalsUnlockedEventValidator = domainEvent({
  type: z.literal("medalsUnlocked"),
  workspace: z.string(),
  member: zv.id("members"),
  medals: z.array(z.strictObject({ milestone: milestoneIdValidator, tier: milestoneTierValidator, xp: zv.number(), rewardKey: z.string() })),
  catalogueVersion: z.string(),
  at: zv.number(),
});

export type MedalsUnlockedEvent = z.infer<typeof medalsUnlockedEventValidator>;

export type DomainEvent =
  | KudosGivenEvent
  | AttemptFailedEvent
  | MemberWelcomedEvent
  | MemberGreetedEvent
  | LevelReachedEvent
  | XpRecordedEvent
  | UnlockReadyEvent
  | UnlockOpenedEvent
  | UnlocksLaunchedEvent
  | QuestFinishedEvent
  | QuestsDrawnEvent
  | AchievementEarnedEvent
  | PerkBoughtEvent
  | ItemBoughtEvent
  | MemberLeftEvent
  | MemberRejoinedEvent
  | PrimaryGroupChangedEvent
  | AwardsAttributedEvent
  | HoggieDroppedEvent
  | CrateBoughtEvent
  | HugGivenEvent
  | HugReceivedEvent
  | HypeReactedEvent
  | TeamPagesCompletedEvent
  | StickersCollectedEvent
  | ThoughtfulPacksGrantedEvent
  | StickerPutInEvent
  | ItemTurnedEvent
  | MedalsUnlockedEvent
  | CompanyTeamsReplacedEvent
  | CompanyMatchesKeptEvent;

export function membersNamedIn(event: KudosGivenEvent): MemberId[] {
  return [...new Set([event.giver, ...event.awards.map((award) => award.recipient)])];
}
