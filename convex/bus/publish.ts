import type { FunctionReference } from "convex/server";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { crateKindOf } from "../album/hoggies/crateKey";
import { isTheFirstThanks } from "../welcome/firstThanks";
import type { DomainEvent } from "./events";

type Subscriber<E extends DomainEvent> = FunctionReference<"mutation" | "action", "internal", { event: E }>;
type Subscription<E extends DomainEvent> = Subscriber<E> | { subscriber: Subscriber<E>; only: (event: E) => boolean };
type Registry = { [T in DomainEvent["type"]]: Array<Subscription<Extract<DomainEvent, { type: T }>>> };

export const subscribers: Registry = {
  kudosGiven: [
    internal.welcome.welcome.welcomeNewMembers,
    internal.feedback.welcomeNudge.nudgeTheThanked,
    internal.progression.progression.recordEffects,
    internal.quests.quests.followKudosGiven,
    internal.achievements.achievements.countKudosGiven,
    internal.leaderboard.totals.countKudosGiven,
    internal.groups.attribution.attributeKudosGiven,
    internal.stickers.stickers.recordStickers,
    internal.album.packs.grantThoughtfulPacks,
    internal.album.tallies.tallyKudosGiven,
    internal.analytics.subscribers.recordKudosGiven,
  ],
  attemptFailed: [internal.analytics.subscribers.recordAttemptFailed],
  memberWelcomed: [internal.analytics.subscribers.recordMemberWelcomed],
  memberGreeted: [internal.album.items.welcome.earnWelcomeItemOnGreeting],
  levelReached: [internal.unlocks.unlocks.makeReady, internal.album.levelUpHoggies.earnLevelUpHoggies, internal.feedback.publicReplies.celebrateLevel, internal.analytics.subscribers.recordLevelReached],
  xpRecorded: [internal.feedback.homes.refreshHomeOnXp],
  unlockReady: [internal.analytics.subscribers.recordUnlockReady],
  unlockOpened: [
    { subscriber: internal.analytics.subscribers.recordUnlockOpened, only: ({ byLaunch }) => byLaunch !== true },
    { subscriber: internal.feedback.tierNotices.tellOpeningSummary, only: ({ feature, byLaunch }) => byLaunch !== true && feature === "book" },
    { subscriber: internal.feedback.coins.tellCoinsOpened, only: ({ feature, byLaunch }) => byLaunch !== true && feature === "coins" },
  ],
  unlocksLaunched: [internal.analytics.subscribers.recordUnlocksLaunched],
  questFinished: [
    { subscriber: internal.welcome.welcome.welcomeOnFirstThanks, only: ({ quest }) => isTheFirstThanks(quest) },
    internal.progression.questRewards.payQuestFinished,
    internal.album.items.questHoggies.earnQuestHoggie,
    internal.analytics.subscribers.recordQuestFinished,
  ],
  questsDrawn: [internal.analytics.subscribers.recordQuestsDrawn],
  achievementEarned: [internal.analytics.subscribers.recordAchievementEarned],
  perkBought: [internal.analytics.subscribers.recordPerkBought],
  itemBought: [],
  memberLeft: [internal.quests.journey.recheckSomeoneNew, internal.engine.kudosText.forgetWordsOfLeaver],
  memberRejoined: [internal.quests.journey.recheckRejoined],
  primaryGroupChanged: [],
  awardsAttributed: [internal.leaderboard.groupTotals.countAwardsAttributed],
  hoggieDropped: [internal.analytics.subscribers.recordHoggieDropped, { subscriber: internal.album.milestones.recordMilestonesAfterAHoggieDrop, only: ({ crate }) => crateKindOf(crate) !== "thoughtful" }],
  crateBought: [],
  hugGiven: [
    { subscriber: internal.welcome.welcome.welcomeOnHug, only: ({ first }) => first === true },
    internal.progression.hugRewards.payHugGiven,
    internal.album.items.hugFinds.findOnHug,
    internal.hugs.people.payHugPeople,
    internal.feedback.welcomeNudge.nudgeTheHugged,
    internal.album.tallies.tallyHugGiven,
    internal.leaderboard.hugs.countHugGiven,
    internal.quests.quests.followHugGiven,
    internal.analytics.subscribers.recordHugGiven,
  ],
  hugReceived: [internal.progression.hugRewards.payHugReceived, internal.leaderboard.hugs.countHugReceived],
  hypeReacted: [internal.album.hypeReactions.keepHypeReaction],
  teamPagesCompleted: [internal.analytics.subscribers.recordTeamPagesCompleted],
  stickersCollected: [internal.analytics.subscribers.recordPersonCollected],
  thoughtfulPacksGranted: [internal.analytics.subscribers.recordPacksEarned, internal.feedback.albumReplies.replyAfterTheGrant],
  stickerPutIn: [internal.analytics.subscribers.recordAlbumStickerCollected],
  itemTurned: [internal.analytics.subscribers.recordItemTurned],
  medalUnlocked: [internal.progression.medalRewards.payMedalUnlocked],
  companyTeamsReplaced: [internal.album.emojiNames.reserveTeamNamesAfterTheSync],
  companyMatchesKept: [internal.album.milestones.recordMilestonesAfterTheMatches],
};

export async function publish(ctx: MutationCtx, event: DomainEvent) {
  const identified = { ...event, fact: crypto.randomUUID() };
  for (const subscription of subscribers[event.type] as Array<Subscription<DomainEvent>>) {
    const { subscriber, only } = "subscriber" in subscription ? subscription : { subscriber: subscription, only: () => true };
    if (only(identified)) await ctx.scheduler.runAfter(0, subscriber, { event: identified });
  }
}
