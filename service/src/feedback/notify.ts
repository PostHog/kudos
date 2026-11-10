// The module map's skeleton of convex/feedback/notify.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// The notices a member gets in Slack about their progress: what is told, where, and whether it is still wanted when its
// delivery runs. Ported from convex/feedback/notify.ts; slack/directMessages.ts sends them.
import { achievementsApplyIn } from "../achievements/flag.ts";
import { levelUpFollowerAwaitedUntil, levelUpRevealedTo } from "../album/levelUp.ts";
import type { TierRef } from "../achievements/ladders.ts";
import { recordedRewardsOf, tierRewardsRecordedFor, type TierRewardsRecorded } from "../achievements/tierRewards.ts";
import { laddersShownTo } from "../achievements/shown.ts";
import { everyTierEarnedBy } from "../achievements/tiers.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { skillTreeLevel } from "../progression/levels.ts";
import { memberPerksOf, ownsEveryPerk, type MemberPerks } from "../progression/perks.ts";
import { skillTreeAppliesIn } from "../progression/skillTree.ts";
import { purchaseOutcomeValidator } from "../progression/purchases.ts";
import { xpLevelsOnFor, xpLevelsShownTo } from "../progression/xpLevels.ts";
import { placeOf, wantsMessage } from "../messageSettings/messageSettings.ts";
import { messageSettingsOnFor } from "../messageSettings/flag.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksAppliedTo, unlocksShownTo } from "../unlocks/launch.ts";
import { teamSpiritShownTo } from "../stickers/flag.ts";
import { storeShownTo, storeVisibleTo } from "../store/visibility.ts";
import { namedFor, readyFromTheStart, scheduled, type ScheduledFeature } from "../unlocks/schedule.ts";
import { stateOf } from "../unlocks/unlocks.ts";
import { websiteOriginFor } from "../website/link.ts";
import { websiteAt, type Website } from "../website/visitSource.ts";
import { coinsApplyTo, coinsVisibleTo } from "../wallet/visibility.ts";
import { isCoinPerk, perkOf } from "../progression/tree.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { settingsOf } from "../workspace/settings.ts";
import { deliverDirectMessageJob } from "../slack/directMessages.ts";
import { coinsOpenedLineOf, inventoryOpenedLineOf } from "./coins.ts";
import { deepLinkFrom, deepLinks, levelUpRevealOf, type DeepLink } from "./deepLinks.ts";
import { perkOfferOf, purchaseReplyOf, readyCrateOf, tiersEarnedLines, type HomeAction } from "./home.ts";
import { skillPointsOf } from "./naming.ts";
import { settingsFooterFor, type SettingsFooter } from "./settingsFooter.ts";
import { isOpened, whenOpened, whenShipped } from "./unlockFilter.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

export { completedTeamValidator, messageKindOfNotification, notificationValidator, type CompletedTeam, type Notification } from "./notification.ts";
import { messageKindOfNotification, notificationValidator, type CompletedTeam, type Notification } from "./notification.ts";

export type NotificationLine = string | { text: string; action: HomeAction } | { link: DeepLink } | { footer: SettingsFooter };

const linkedPages = {
  "level-reached": deepLinks.levelReached,
  "features-shipped": deepLinks.featuresShipped,
  "tiers-earned": deepLinks.tiersEarned,
  "coins-opened": deepLinks.successReply,
} satisfies Record<Notification["kind"], unknown>;



export async function notifyLevelReached(ctx: MutationContext, { member, level, skillPoints, xpToNextLevel, message }: LevelReachedEvent, ready: ScheduledFeature[]): Promise<void> {
  if (!(await xpLevelsShownTo(ctx, member))) return;
  const unlocksShown = await unlocksShownTo(ctx, member);
  await notify(ctx, member, { kind: "level-reached", level, skillPoints, xpToNextLevel, ready: unlocksShown ? featuresOf(ready) : [] }, message);
}

export async function notifyFeaturesShipped(ctx: MutationContext, member: MemberId, ready: ScheduledFeature[]): Promise<void> {
  if (!(await unlocksShownTo(ctx, member))) return;
  await notify(ctx, member, { kind: "features-shipped", ready: featuresOf(ready) });
}

/** Sends the notice where the member's message settings put it, beside the kudos that caused it when there is one. */
export async function notify(ctx: MutationContext, member: MemberId, notification: Notification, kudos?: MessageRef): Promise<void> {
  const place = await placeOf(ctx, member, messageKindOfNotification(notification));
  if (place === "none") return;
  const { workspace, user } = await chatUserOf(ctx, member);
  const placedAtDelivery = kudos !== undefined && (place === "channel" || (await messageSettingsOnFor(ctx, member)));
  await ctx.jobs.enqueue(deliverDirectMessageJob, { member, workspace, user, notification, ...(placedAtDelivery && { kudos }) });
}


export const linesStillWantedArgs = z.strictObject({ member: zv.id("members"), notification: notificationValidator });
/** The notice's lines as they are when it is sent: what is still true and still wanted, with its link and footer; null when nothing is. */
export async function linesStillWanted(ctx: QueryContext, { member, notification }: z.infer<typeof linesStillWantedArgs>): Promise<NotificationLine[] | null> {
  const { workspace } = await chatUserOf(ctx, member);
  if (!(await xpLevelsOnFor(ctx, member)) || !(await wantsNotification(ctx, member, notification))) return null;
  const told = await stillToldOf(ctx, workspace, member, notification);
  const website = websiteAt(await websiteOriginFor(ctx, workspace, member), "reply");
  const lines = told === null ? [] : renderNotification(told, await deliveryFactsOf(ctx, workspace, member, told, website));
  if (lines.length === 0) return null;
  const link = deepLinkFrom(website, await linkedPageOf(ctx, member, notification));
  const footer = await settingsFooterFor(ctx, member);
  return [...lines, ...(link === null ? [] : [{ link }]), ...(footer === null ? [] : [{ footer }])];
}

export const followersAwaitedUntilArgs = z.strictObject({ member: zv.id("members"), notification: notificationValidator });
export async function followersAwaitedUntil(ctx: QueryContext, { member, notification }: z.infer<typeof followersAwaitedUntilArgs>): Promise<null | number> {
  return notification.kind === "level-reached" ? await levelUpFollowerAwaitedUntil(ctx, member, notification.level) : null;
}

export const purchaseReplyStillWantedArgs = z.strictObject({ member: zv.id("members"), outcome: purchaseOutcomeValidator });
export async function purchaseReplyStillWanted(ctx: QueryContext, { member, outcome }: z.infer<typeof purchaseReplyStillWantedArgs>): Promise<null | string> {
  const { workspace } = await chatUserOf(ctx, member);
  if (!(await skillTreeAppliesIn(ctx, workspace))) return null;
  if (isCoinPerk(perkOf(outcome.perk)) && !(await coinsApplyTo(ctx, member))) return null;
  return purchaseReplyOf(outcome, namedFor(scheduled("coins"), { storeShown: await storeShownTo(ctx, member) }).name);
}

async function linkedPageOf(ctx: QueryContext, member: MemberId, notification: Notification) {
  if (notification.kind === "level-reached" && (await levelUpRevealedTo(ctx, member, notification.level))) return levelUpRevealOf(notification.level);
  return linkedPages[notification.kind];
}

type DeliveryFacts = { website: Website | null; openTree: MemberPerks | null; everyTierEarned: TierRef[]; tierRewardsShown: TierRewardsRecorded; inventoryWith: string | null };

function renderNotification(notification: Notification, { website, openTree, everyTierEarned, tierRewardsShown, inventoryWith }: DeliveryFacts): NotificationLine[] {
  if (notification.kind === "tiers-earned") return [...(notification.teams ?? []).map(completionLineOf), ...tiersEarnedLines(notification.tiers, everyTierEarned, (ref) => recordedRewardsOf(ref, tierRewardsShown))];
  if (notification.kind === "coins-opened") return [inventoryWith === null ? coinsOpenedLineOf(notification.balance) : inventoryOpenedLineOf(notification.balance, inventoryWith)];
  const crates = notification.ready.map((feature) => readyCrateOf(namedFor(scheduled(feature), { storeShown: inventoryWith !== null }), website));
  if (notification.kind !== "level-reached") return crates;
  return [...levelReachedLines(notification, openTree), ...crates, ...perkOffersOf(openTree, website)];
}

function completionLineOf({ name, crestEarned }: CompletedTeam) {
  return crestEarned ? `Team complete · ${name} crest earned` : `Team complete · ${name}`;
}

function levelReachedLines({ level, skillPoints, xpToNextLevel }: Extract<Notification, { kind: "level-reached" }>, openTree: MemberPerks | null) {
  return [`🎉 You reached level ${level}!${skillPointsTold(level, skillPoints, openTree)}`, `Level ${level + 1} is ${xpToNextLevel} XP away.`];
}

function skillPointsTold(level: number, skillPoints: number | null, openTree: MemberPerks | null) {
  if (openTree !== null) return ownsEveryPerk(openTree) ? "" : ` You have ${skillPointsOf(openTree.skillPoints)} to spend.`;
  return skillPoints !== null && level >= skillTreeLevel ? ` You have ${skillPointsOf(skillPoints)} saved for the skill tree.` : "";
}

function perkOffersOf(openTree: MemberPerks | null, website: Website | null): NotificationLine[] {
  return (openTree?.perks ?? []).filter(({ state }) => state === "buyable").map((perk) => perkOfferOf(perk, website));
}

async function stillToldOf(ctx: QueryContext, workspace: string, member: MemberId, notification: Notification): Promise<Notification | null> {
  if (notification.kind === "tiers-earned") return tiersAndTeamsStillToldOf(ctx, workspace, member, notification);
  if (notification.kind === "coins-opened") return (await coinsVisibleTo(ctx, member)) ? notification : null;
  const unlocksApply = await unlocksAppliedTo(ctx, member);
  const ready = unlocksApply ? await stillReady(ctx, member, notification.ready) : [];
  if (notification.kind !== "level-reached" || notification.skillPoints === null) return { ...notification, ready };
  const skillPointsTold = unlocksApply ? whenOpened : whenShipped;
  return { ...notification, ready, skillPoints: await skillPointsTold(ctx, member, "skillTree", notification.skillPoints) };
}

type TiersEarnedNotification = Extract<Notification, { kind: "tiers-earned" }>;

async function tiersAndTeamsStillToldOf(ctx: QueryContext, workspace: string, member: MemberId, notification: TiersEarnedNotification): Promise<TiersEarnedNotification | null> {
  const tiers = (await isBookOpenIn(ctx, workspace, member)) ? await tiersStillShownTo(ctx, member, notification) : null;
  if (notification.teams === undefined) return tiers;
  const teams = (await teamSpiritShownTo(ctx, member)) ? notification.teams : [];
  if (tiers === null && teams.length === 0) return null;
  return { kind: "tiers-earned", tiers: tiers?.tiers ?? [], teams };
}

async function tiersStillShownTo(ctx: QueryContext, member: MemberId, notification: TiersEarnedNotification): Promise<TiersEarnedNotification | null> {
  const shown = await laddersShownTo(ctx, member);
  const tiers = notification.tiers.filter(({ ladder }) => shown.includes(ladder));
  return tiers.length === 0 ? null : { ...notification, tiers };
}

async function deliveryFactsOf(ctx: QueryContext, workspace: string, member: MemberId, told: Notification, website: Website | null): Promise<DeliveryFacts> {
  return {
    website,
    openTree: await openTreeOf(ctx, workspace, member, told),
    everyTierEarned: told.kind === "tiers-earned" ? await everyTierEarnedBy(ctx, member) : [],
    tierRewardsShown: told.kind === "tiers-earned" ? await tierRewardsShownTo(ctx, member) : new Map(),
    inventoryWith: namesCoins(told) && (await storeShownTo(ctx, member)) ? (await settingsOf(ctx, workspace)).kudosEmoji : null,
  };
}

async function tierRewardsShownTo(ctx: QueryContext, member: MemberId): Promise<TierRewardsRecorded> {
  if (!(await coinsVisibleTo(ctx, member))) return new Map();
  const itemsShown = await storeVisibleTo(ctx, member);
  const recorded = await tierRewardsRecordedFor(ctx, member);
  return new Map([...recorded].map(([reward, record]) => [reward, { ...record, item: itemsShown ? record.item : null }]));
}

function namesCoins(told: Notification) {
  return told.kind === "coins-opened" || ("ready" in told && told.ready.includes("coins"));
}

async function openTreeOf(ctx: QueryContext, workspace: string, member: MemberId, told: Notification): Promise<MemberPerks | null> {
  if (told.kind !== "level-reached" || !(await skillTreeAppliesIn(ctx, workspace)) || !(await isOpened(ctx, member, "skillTree"))) return null;
  return memberPerksOf(ctx, member);
}

async function isBookOpenIn(ctx: QueryContext, workspace: string, member: MemberId) {
  return (await achievementsApplyIn(ctx, workspace)) && (await isOpened(ctx, member, "book"));
}

async function stillReady(ctx: QueryContext, member: MemberId, features: Feature[]) {
  const ready: Feature[] = [];
  for (const feature of features) if (!readyFromTheStart(scheduled(feature)) && (await stateOf(ctx, member, feature)) === "ready") ready.push(feature);
  return ready;
}

function featuresOf(ready: ScheduledFeature[]) {
  return ready.map(({ feature }) => feature);
}

function wantsNotification(ctx: QueryContext, member: MemberId, notification: Notification) {
  return wantsMessage(ctx, member, messageKindOfNotification(notification));
}
