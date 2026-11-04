import { v, type Infer } from "convex/values";
import type {
  AchievementEarnedEvent,
  TeamPagesCompletedEvent,
  AttemptFailedEvent,
  HoggieDroppedEvent,
  HugGivenEvent,
  KudosGivenEvent,
  LevelReachedEvent,
  MemberWelcomedEvent,
  PerkBoughtEvent,
  QuestFinishedEvent,
  QuestsDrawnEvent,
  StickersCollectedEvent,
  StickerPutInEvent,
  ItemTurnedEvent,
  ThoughtfulPacksGrantedEvent,
  UnlockOpenedEvent,
  UnlockReadyEvent,
  UnlocksLaunchedEvent,
} from "../bus/events";
import type { Award } from "../engine/awards";
import type { KudosCommandResult } from "../feedback/kudosCommand";
import type { BoardPeriod } from "../album/boards";
import type { HugMeasure } from "../website/peopleBoards";
import type { MessageKind, MessagePlace } from "../messageSettings/kinds";
import type { Feature } from "../unlocks/feature";
import { gateDecisionOf, wordCountOf } from "../progression/gate";
import { crateKindOf } from "../album/hoggies/crateKey";
import { defaultKudosEmoji } from "../workspace/settings";
import type { MemberId } from "../workspace/directory";
import type { WelcomePath } from "../welcome/welcomedAs";
import type { SentMondayDmSection } from "../mondayDm/records";

export const propertiesValidator = v.record(v.string(), v.union(v.string(), v.number(), v.boolean()));

export type Properties = Infer<typeof propertiesValidator>;

export const personPropertiesValidator = v.record(v.string(), v.union(v.string(), v.boolean(), v.array(v.string())));

export type ProductEvent = {
  event:
    | "kudos given"
    | "kudos received"
    | "attempt failed"
    | "member welcomed"
    | "level reached"
    | "unlock made ready"
    | "unlock opened"
    | "quest drawn"
    | "quest finished"
    | "perk bought"
    | "hoggie dropped"
    | "hug given"
    | "hugs recap sent"
    | "team page completed"
    | "person collected"
    | "packs earned"
    | "album sticker collected"
    | "item turned"
    | "xp moment ended"
    | "onboarding card closed"
    | "achievement earned"
    | "app home opened"
    | "command used"
    | "leaderboard viewed"
    | "leaderboard left"
    | "leaderboard joined"
    | "primary group picked"
    | "message setting changed"
    | "profile card viewed"
    | "dm sent"
    | "dm link clicked"
    | "quests viewed"
    | "activity viewed"
    | "$feature_flag_called";
  subject: { member: MemberId };
  at: number;
  properties: Properties;
};

export type UsageFact =
  | { kind: "appHomeOpened"; workspace: string; member: MemberId; at: number }
  | { kind: "commandUsed"; workspace: string; member: MemberId; alias: boolean; result: KudosCommandResult; at: number }
  | { kind: "leaderboardViewed"; workspace: string; member: MemberId; board: ViewedBoard; period: BoardPeriod; surface: LeaderboardSurface; measure?: HugMeasure; at: number }
  | { kind: "leaderboardVisibilityChanged"; workspace: string; member: MemberId; visible: boolean; at: number }
  | { kind: "primaryGroupPicked"; workspace: string; member: MemberId; surface: PickSurface; at: number }
  | { kind: "messageSettingChanged"; workspace: string; member: MemberId; setting: MessageKind; on: boolean; place?: MessagePlace; via?: "dm-button"; at: number }
  | { kind: "profileCardViewed"; workspace: string; member: MemberId; own: boolean; surface: "command"; at: number }
  | { kind: "hugsRecapSent"; workspace: string; member: MemberId; given: number; received: number; xp: number; via?: HugsRecapCarrier; at: number }
  | { kind: "xpMomentEnded"; workspace: string; member: MemberId; skipped: boolean; excerptsShown: number; folded: number; at: number }
  | { kind: "howItWorksClosed"; workspace: string; member: MemberId; triedSlack: boolean; at: number }
  | { kind: "dmSent"; workspace: string; member: MemberId; dm: SentDm; at: number }
  | { kind: "dmLinkClicked"; workspace: string; member: MemberId; dm: DmKind; destination: DmLinkDestination; at: number }
  | { kind: "questsViewed"; workspace: string; member: MemberId; surface: QuestsSurface; at: number }
  | { kind: "activityViewed"; workspace: string; member: MemberId; state: ActivityState; at: number };

export type SentDm = { kind: "welcome"; path: WelcomePath } | { kind: "monday"; sections: SentMondayDmSection[] };

export const dmKindValidator = v.union(v.literal("welcome"), v.literal("monday"), v.literal("kudos-reply"));

export const dmLinkDestinationValidator = v.union(v.literal("book"), v.literal("quests"), v.literal("quests-how"), v.literal("home"));

export type DmLinkDestination = Infer<typeof dmLinkDestinationValidator>;

export type DmKind = Infer<typeof dmKindValidator>;

export const hugsRecapCarrierValidator = v.union(v.literal("recap"), v.literal("monday"));

export type HugsRecapCarrier = Infer<typeof hugsRecapCarrierValidator>;

export const questsSurfaceValidator = v.union(v.literal("panel"), v.literal("profile"));

export type QuestsSurface = Infer<typeof questsSurfaceValidator>;

export const activityStateValidator = v.union(v.literal("thanked"), v.literal("empty"), v.literal("quiet"));

export type ActivityState = Infer<typeof activityStateValidator>;

export type PickSurface = "welcome" | "settings" | "website";

export type ViewedBoard = "everyone" | "groups" | "my-group" | "people";

export type LeaderboardSurface = "app-home" | "command" | "website";

const surfaceNames: Record<LeaderboardSurface, string> = { "app-home": "app home", command: "command", website: "website" };

const outcomeNames: Record<AttemptFailedEvent["outcome"], string> = { "over-allowance": "over allowance", invalid: "invalid" };

const featureNames: Record<Feature, string> = {
  quests: "quests",
  leaderboard: "leaderboard",
  book: "book",
  skillTree: "skill tree",
  coins: "coins",
};

const commandResultNames: Record<KudosCommandResult, string> = {
  joined: "joined",
  "already-in": "already in",
  "off-limits": "off limits",
  "private-channel": "private channel",
  "direct-message": "direct message",
};

export type GivingHistory = { newRecipients: number };

export function projectKudosGiven(event: KudosGivenEvent, history: GivingHistory): ProductEvent[] {
  return [kudosGiven(event, history), ...event.awards.map((award) => kudosReceived(event, award))];
}

function kudosGiven(event: KudosGivenEvent, { newRecipients }: GivingHistory): ProductEvent {
  const kudos = event.awards.map((award) => award.kudos);
  const wordCount = wordCountOf(event.annotations);
  return {
    event: "kudos given",
    subject: { member: event.giver },
    at: event.at,
    properties: {
      recipients: event.awards.length,
      kudos_per_recipient: Math.max(0, ...kudos),
      kudos_total: kudos.reduce((sum, each) => sum + each, 0),
      skipped_mentions: event.skippedMentions,
      retry: event.retry,
      in_thread: event.inThread,
      daily_allowance_opening: event.allowance.dailyOpening,
      daily_allowance_left: event.allowance.dailyLeft,
      default_kudos_emoji: event.kudosEmoji === defaultKudosEmoji(),
      thoughtful: gateDecisionOf(event.annotations)?.thoughtful === true,
      ...(wordCount !== null && { word_count: wordCount }),
      new_recipients: newRecipients,
    },
  };
}

function kudosReceived(event: KudosGivenEvent, award: Award): ProductEvent {
  return {
    event: "kudos received",
    subject: { member: award.recipient },
    at: event.at,
    properties: { kudos: award.kudos, retry: event.retry },
  };
}

export function projectAttemptFailed(event: AttemptFailedEvent): ProductEvent {
  return {
    event: "attempt failed",
    subject: { member: event.giver },
    at: event.at,
    properties: {
      outcome: outcomeNames[event.outcome],
      recipients: event.recipients,
      kudos_per_recipient: event.perRecipient,
      kudos_total: event.cost,
      skipped_mentions: event.skippedMentions,
      retry: event.retry,
      in_thread: event.inThread,
      daily_allowance_left: event.allowance.dailyLeft,
    },
  };
}

export function projectMemberWelcomed(event: MemberWelcomedEvent): ProductEvent {
  return { event: "member welcomed", subject: { member: event.member }, at: event.at, properties: { as: event.as } };
}

export function projectLevelReached(event: LevelReachedEvent): ProductEvent {
  return {
    event: "level reached",
    subject: { member: event.member },
    at: event.at,
    properties: { level: event.level, skill_points_gained: event.skillPointsGained, via: event.message === undefined ? "reward" : "kudos" },
  };
}

export function projectUnlockReady(event: UnlockReadyEvent): ProductEvent {
  return { event: "unlock made ready", subject: { member: event.member }, at: event.at, properties: { feature: featureNames[event.feature] } };
}

export function projectUnlockOpened(event: UnlockOpenedEvent): ProductEvent {
  return {
    event: "unlock opened",
    subject: { member: event.member },
    at: event.at,
    properties: { feature: featureNames[event.feature], by: event.byLaunch === true ? "launch" : "member" },
  };
}

export function projectUnlocksLaunched({ workspace, openings, at }: UnlocksLaunchedEvent): ProductEvent[] {
  return openings.map(({ member, feature }) => projectUnlockOpened({ type: "unlockOpened", workspace, member, feature, at, byLaunch: true }));
}

export function projectQuestsDrawn(event: QuestsDrawnEvent): ProductEvent[] {
  return event.quests.map((quest) => ({ event: "quest drawn", subject: { member: event.member }, at: event.at, properties: { quest } }));
}

export function projectQuestFinished(event: QuestFinishedEvent): ProductEvent {
  return {
    event: "quest finished",
    subject: { member: event.member },
    at: event.at,
    properties: { ...questNamed(event), ...(event.reward === undefined ? {} : { xp: event.reward.xp, coins: event.reward.coins }) },
  };
}

function questNamed({ quest, poolQuest }: QuestFinishedEvent) {
  const id = quest.kind === "journey" ? quest.step : poolQuest;
  return { kind: quest.kind, ...(id === undefined ? {} : { quest: id }) };
}

export function projectHoggieDropped(event: HoggieDroppedEvent): ProductEvent {
  return { event: "hoggie dropped", subject: { member: event.member }, at: event.at, properties: { rarity: event.rarity, is_new: event.copy === 1, crate_kind: crateKindOf(event.crate), ...(event.pack && { pack_xp: event.pack.xp, pack_coins: event.pack.coins }), ...(event.surface && { surface: event.surface }) } };
}

export function projectHugGiven(event: HugGivenEvent): ProductEvent {
  return { event: "hug given", subject: { member: event.giver }, at: event.at, properties: { on_kudos: event.onKudos, ...(event.reaction !== undefined && { reaction: event.reaction }) } };
}

export function projectTeamPagesCompleted({ member, teams, at, told }: TeamPagesCompletedEvent): ProductEvent[] {
  return teams.map(({ team, people }) => ({ event: "team page completed", subject: { member }, at, properties: { team, people, told } }));
}

export function projectPersonCollected({ stickers, at }: StickersCollectedEvent): ProductEvent[] {
  return stickers.map(({ collector, firstGiver }) => ({ event: "person collected", subject: { member: collector }, at, properties: { via: firstGiver === collector ? "gave" : "received" } }));
}

export function projectPacksEarned({ giver, outcomes, at }: ThoughtfulPacksGrantedEvent): ProductEvent {
  const packsEarned = outcomes.filter(({ outcome }) => outcome !== "nextWeek").length;
  return { event: "packs earned", subject: { member: giver }, at, properties: { packs_earned: packsEarned, recipients: outcomes.length } };
}

export function projectItemTurned({ member, source, rarity, isNew, at }: ItemTurnedEvent): ProductEvent {
  return { event: "item turned", subject: { member }, at, properties: { source, ...(rarity !== undefined && { rarity }), is_new: isNew } };
}

export function projectAlbumStickerCollected({ member, at }: StickerPutInEvent): ProductEvent {
  return { event: "album sticker collected", subject: { member }, at, properties: {} };
}

export function projectPerkBought(event: PerkBoughtEvent): ProductEvent {
  return { event: "perk bought", subject: { member: event.member }, at: event.at, properties: { perk: event.perk } };
}

export function projectAchievementEarned(event: AchievementEarnedEvent): ProductEvent {
  return { event: "achievement earned", subject: { member: event.member }, at: event.at, properties: { ladder: event.ladder, tier: event.tier } };
}

export function projectUsage(fact: UsageFact): ProductEvent {
  const subject = { member: fact.member };
  switch (fact.kind) {
    case "appHomeOpened":
      return { event: "app home opened", subject, at: fact.at, properties: {} };
    case "commandUsed":
      return { event: "command used", subject, at: fact.at, properties: { command: "hedgehug", alias: fact.alias, result: commandResultNames[fact.result] } };
    case "leaderboardViewed":
      return { event: "leaderboard viewed", subject, at: fact.at, properties: { board: fact.board, period: fact.period, surface: surfaceNames[fact.surface], ...(fact.measure !== undefined && { measure: fact.measure }) } };
    case "leaderboardVisibilityChanged":
      return { event: fact.visible ? "leaderboard joined" : "leaderboard left", subject, at: fact.at, properties: {} };
    case "primaryGroupPicked":
      return { event: "primary group picked", subject, at: fact.at, properties: { surface: fact.surface } };
    case "messageSettingChanged":
      return { event: "message setting changed", subject, at: fact.at, properties: { kind: fact.setting, on: fact.on, ...(fact.place !== undefined && { place: fact.place }), ...(fact.via !== undefined && { via: fact.via }) } };
    case "profileCardViewed":
      return { event: "profile card viewed", subject, at: fact.at, properties: { own: fact.own, surface: fact.surface } };
    case "hugsRecapSent":
      return { event: "hugs recap sent", subject, at: fact.at, properties: { hugs_given: fact.given, hugs_received: fact.received, xp: fact.xp, ...(fact.via !== undefined && { via: fact.via }) } };
    case "xpMomentEnded":
      return { event: "xp moment ended", subject, at: fact.at, properties: { skipped: fact.skipped, excerpts_shown: fact.excerptsShown, folded: fact.folded } };
    case "howItWorksClosed":
      return { event: "onboarding card closed", subject, at: fact.at, properties: { tried_slack: fact.triedSlack } };
    case "dmSent":
      return { event: "dm sent", subject, at: fact.at, properties: sentDmProperties(fact.dm) };
    case "dmLinkClicked":
      return { event: "dm link clicked", subject, at: fact.at, properties: { kind: fact.dm, destination: fact.destination } };
    case "questsViewed":
      return { event: "quests viewed", subject, at: fact.at, properties: { surface: fact.surface } };
    case "activityViewed":
      return { event: "activity viewed", subject, at: fact.at, properties: { state: fact.state } };
  }
}

function sentDmProperties(dm: SentDm): Properties {
  return dm.kind === "welcome" ? { kind: dm.kind, path: dm.path } : { kind: dm.kind, sections: dm.sections.join(",") };
}
