import { v, type Infer, type PropertyValidators } from "convex/values";
import { ladderValidator, tierValidator } from "../achievements/ladders";
import { awardIdValidator } from "../engine/awards";
import { attributedAwardValidator, groupOrNoneValidator } from "../groups/attributedAward";
import { primaryGroupCauseValidator } from "../groups/cause";
import { annotationsValidator, messageRefValidator } from "../engine/messageEvent";
import { perkValidator } from "../progression/tree";
import { questIdValidator } from "../quests/pool";
import { questValidator } from "../quests/step";
import { featureValidator } from "../unlocks/feature";
import { rarityValidator } from "../album/hoggies/catalogue";
import { itemSourceValidator } from "../album/items/records";
import { surfaceValidator } from "../commands/surface";
import type { MemberId } from "../workspace/directory";
import { grantOutcomeValidator, milestoneIdValidator, milestoneTierValidator } from "../album/records";

function domainEvent<Fields extends PropertyValidators>(fields: Fields) {
  return v.object({ ...fields, fact: v.optional(v.string()) });
}

export const awardValidator = v.object({ award: awardIdValidator, giver: v.id("members"), recipient: v.id("members"), kudos: v.number() });

export const kudosGivenEventValidator = domainEvent({
  type: v.literal("kudosGiven"),
  workspace: v.string(),
  message: messageRefValidator,
  giver: v.id("members"),
  awards: v.array(awardValidator),
  via: v.literal("message"),
  kudosEmoji: v.string(),
  ownedEmoji: v.optional(v.array(v.string())),
  loadoutEmoji: v.optional(v.array(v.string())),
  annotations: annotationsValidator,
  allowance: v.object({ dailyOpening: v.number(), dailyLeft: v.number() }),
  skippedMentions: v.number(),
  retry: v.boolean(),
  inThread: v.boolean(),
  day: v.string(),
  at: v.number(),
});

export const levelReachedEventValidator = domainEvent({
  type: v.literal("levelReached"),
  workspace: v.string(),
  member: v.id("members"),
  level: v.number(),
  skillPointsGained: v.number(),
  skillPoints: v.number(),
  xpToNextLevel: v.number(),
  message: v.optional(messageRefValidator),
  at: v.number(),
});

export const xpRecordedEventValidator = domainEvent({
  type: v.literal("xpRecorded"),
  workspace: v.string(),
  member: v.id("members"),
  at: v.number(),
});

export type KudosGivenEvent = Infer<typeof kudosGivenEventValidator>;

export const attemptFailedEventValidator = domainEvent({
  type: v.literal("attemptFailed"),
  workspace: v.string(),
  message: messageRefValidator,
  giver: v.id("members"),
  outcome: v.union(v.literal("over-allowance"), v.literal("invalid")),
  recipients: v.number(),
  perRecipient: v.number(),
  cost: v.number(),
  skippedMentions: v.number(),
  retry: v.boolean(),
  inThread: v.boolean(),
  allowance: v.object({ dailyLeft: v.number() }),
  day: v.string(),
  at: v.number(),
});

export type AttemptFailedEvent = Infer<typeof attemptFailedEventValidator>;

export const memberWelcomedEventValidator = domainEvent({
  type: v.literal("memberWelcomed"),
  workspace: v.string(),
  member: v.id("members"),
  as: v.union(v.literal("giver"), v.literal("recipient")),
  at: v.number(),
});

export type MemberWelcomedEvent = Infer<typeof memberWelcomedEventValidator>;

export const memberGreetedEventValidator = domainEvent({
  type: v.literal("memberGreeted"),
  workspace: v.string(),
  member: v.id("members"),
  owesTheWelcomeItem: v.boolean(),
  at: v.number(),
});

export type MemberGreetedEvent = Infer<typeof memberGreetedEventValidator>;

export type LevelReachedEvent = Infer<typeof levelReachedEventValidator>;

export type XpRecordedEvent = Infer<typeof xpRecordedEventValidator>;

const unlockFields = { workspace: v.string(), member: v.id("members"), feature: featureValidator, at: v.number() };

export const unlockReadyEventValidator = domainEvent({ type: v.literal("unlockReady"), ...unlockFields });

export const unlockOpenedEventValidator = domainEvent({ type: v.literal("unlockOpened"), ...unlockFields, byLaunch: v.optional(v.literal(true)) });

export type UnlockReadyEvent = Infer<typeof unlockReadyEventValidator>;

export type UnlockOpenedEvent = Infer<typeof unlockOpenedEventValidator>;

export const unlocksLaunchedEventValidator = domainEvent({
  type: v.literal("unlocksLaunched"),
  workspace: v.string(),
  openings: v.array(v.object({ member: v.id("members"), feature: featureValidator })),
  at: v.number(),
});

export type UnlocksLaunchedEvent = Infer<typeof unlocksLaunchedEventValidator>;

const questFields = { workspace: v.string(), member: v.id("members"), quest: questValidator, at: v.number() };

export const questFinishedEventValidator = domainEvent({
  type: v.literal("questFinished"),
  ...questFields,
  poolQuest: v.optional(questIdValidator),
  rewardKey: v.optional(v.string()),
  reward: v.optional(v.object({ xp: v.number(), coins: v.number() })),
  catalogueVersion: v.optional(v.string()),
  cause: v.optional(messageRefValidator),
});

const weekFields = { workspace: v.string(), member: v.id("members"), week: v.string(), at: v.number() };

export const questsDrawnEventValidator = domainEvent({ type: v.literal("questsDrawn"), ...weekFields, quests: v.array(questIdValidator) });

export type QuestsDrawnEvent = Infer<typeof questsDrawnEventValidator>;

export const achievementEarnedEventValidator = domainEvent({
  type: v.literal("achievementEarned"),
  workspace: v.string(),
  member: v.id("members"),
  ladder: ladderValidator,
  tier: tierValidator,
  at: v.number(),
  batch: v.optional(v.id("bookBatches")),
});

export type AchievementEarnedEvent = Infer<typeof achievementEarnedEventValidator>;

export const perkBoughtEventValidator = domainEvent({ type: v.literal("perkBought"), workspace: v.string(), member: v.id("members"), perk: perkValidator, at: v.number() });

export type PerkBoughtEvent = Infer<typeof perkBoughtEventValidator>;

export const itemBoughtEventValidator = domainEvent({ type: v.literal("itemBought"), workspace: v.string(), member: v.id("members"), item: v.string(), price: v.number(), at: v.number() });

export type ItemBoughtEvent = Infer<typeof itemBoughtEventValidator>;

const membershipFields = { workspace: v.string(), member: v.id("members"), at: v.number() };

export const memberLeftEventValidator = domainEvent({ type: v.literal("memberLeft"), ...membershipFields });

export const memberRejoinedEventValidator = domainEvent({ type: v.literal("memberRejoined"), ...membershipFields });

export type MemberLeftEvent = Infer<typeof memberLeftEventValidator>;

export type MemberRejoinedEvent = Infer<typeof memberRejoinedEventValidator>;

export type QuestFinishedEvent = Infer<typeof questFinishedEventValidator>;

export const primaryGroupChangedEventValidator = domainEvent({
  type: v.literal("primaryGroupChanged"),
  workspace: v.string(),
  member: v.id("members"),
  from: v.union(v.id("userGroups"), v.null()),
  to: v.union(v.id("userGroups"), v.null()),
  cause: primaryGroupCauseValidator,
  at: v.number(),
});

export type PrimaryGroupChangedEvent = Infer<typeof primaryGroupChangedEventValidator>;

const attributedFields = {
  workspace: v.string(),
  message: messageRefValidator,
  giver: v.id("members"),
  group: groupOrNoneValidator,
  kudos: v.number(),
  day: v.string(),
  at: v.number(),
  awards: v.array(attributedAwardValidator),
};

export const awardsAttributedEventValidator = domainEvent({ type: v.literal("awardsAttributed"), ...attributedFields });

export type AwardsAttributedEvent = Infer<typeof awardsAttributedEventValidator>;

export const hoggieDroppedEventValidator = domainEvent({
  type: v.literal("hoggieDropped"),
  workspace: v.string(),
  member: v.id("members"),
  crate: v.string(),
  hoggie: v.string(),
  rarity: rarityValidator,
  copy: v.number(),
  at: v.number(),
  pack: v.optional(v.object({ xp: v.number(), coins: v.number() })),
  surface: v.optional(surfaceValidator),
});

export type HoggieDroppedEvent = Infer<typeof hoggieDroppedEventValidator>;

export const teamPagesCompletedEventValidator = domainEvent({
  type: v.literal("teamPagesCompleted"),
  workspace: v.string(),
  member: v.id("members"),
  message: messageRefValidator,
  award: awardIdValidator,
  teams: v.array(v.object({ team: v.string(), people: v.number() })),
  at: v.number(),
  told: v.boolean(),
});

export type TeamPagesCompletedEvent = Infer<typeof teamPagesCompletedEventValidator>;

export const stickersCollectedEventValidator = domainEvent({
  type: v.literal("stickersCollected"),
  workspace: v.string(),
  stickers: v.array(v.object({ collector: v.id("members"), person: v.id("members"), firstAward: awardIdValidator, firstGiver: v.id("members") })),
  at: v.number(),
});

export type StickersCollectedEvent = Infer<typeof stickersCollectedEventValidator>;

export const thoughtfulPacksGrantedEventValidator = domainEvent({
  type: v.literal("thoughtfulPacksGranted"),
  workspace: v.string(),
  giver: v.id("members"),
  message: messageRefValidator,
  outcomes: v.array(v.object({ recipient: v.id("members"), outcome: grantOutcomeValidator })),
  at: v.number(),
});

export type ThoughtfulPacksGrantedEvent = Infer<typeof thoughtfulPacksGrantedEventValidator>;

export const stickerPutInEventValidator = domainEvent({ type: v.literal("stickerPutIn"), workspace: v.string(), member: v.id("members"), person: v.id("members"), at: v.number() });

export type StickerPutInEvent = Infer<typeof stickerPutInEventValidator>;

export const itemTurnedEventValidator = domainEvent({ type: v.literal("itemTurned"), workspace: v.string(), member: v.id("members"), source: itemSourceValidator, rarity: v.optional(rarityValidator), isNew: v.boolean(), at: v.number() });

export type ItemTurnedEvent = Infer<typeof itemTurnedEventValidator>;

export const companyTeamsReplacedEventValidator = domainEvent({ type: v.literal("companyTeamsReplaced"), at: v.number() });

export type CompanyTeamsReplacedEvent = Infer<typeof companyTeamsReplacedEventValidator>;

export const companyMatchesKeptEventValidator = domainEvent({ type: v.literal("companyMatchesKept"), workspace: v.string(), at: v.number() });

export type CompanyMatchesKeptEvent = Infer<typeof companyMatchesKeptEventValidator>;

export const crateBoughtEventValidator = domainEvent({ type: v.literal("crateBought"), workspace: v.string(), member: v.id("members"), crate: v.string(), price: v.number(), at: v.number() });

export type CrateBoughtEvent = Infer<typeof crateBoughtEventValidator>;

export const hugGivenEventValidator = domainEvent({
  type: v.literal("hugGiven"),
  workspace: v.string(),
  giver: v.id("members"),
  message: messageRefValidator,
  onKudos: v.boolean(),
  author: v.optional(v.id("members")),
  at: v.number(),
  day: v.string(),
  first: v.optional(v.boolean()),
  reaction: v.optional(v.string()),
  rewards: v.optional(v.boolean()),
});

export type HugGivenEvent = Infer<typeof hugGivenEventValidator>;

export const hugReceivedEventValidator = domainEvent({
  type: v.literal("hugReceived"),
  workspace: v.string(),
  giver: v.id("members"),
  person: v.id("members"),
  message: messageRefValidator,
  at: v.number(),
  week: v.string(),
  rewards: v.optional(v.boolean()),
});

export type HugReceivedEvent = Infer<typeof hugReceivedEventValidator>;

export const hypeReactedEventValidator = domainEvent({
  type: v.literal("hypeReacted"),
  workspace: v.string(),
  giver: v.id("members"),
  owner: v.id("members"),
  author: v.id("members"),
  emoji: v.string(),
  message: messageRefValidator,
  at: v.number(),
});

export type HypeReactedEvent = Infer<typeof hypeReactedEventValidator>;

export const medalsUnlockedEventValidator = domainEvent({
  type: v.literal("medalsUnlocked"),
  workspace: v.string(),
  member: v.id("members"),
  medals: v.array(v.object({ milestone: milestoneIdValidator, tier: milestoneTierValidator, xp: v.number(), rewardKey: v.string() })),
  catalogueVersion: v.string(),
  at: v.number(),
});

export type MedalsUnlockedEvent = Infer<typeof medalsUnlockedEventValidator>;

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
