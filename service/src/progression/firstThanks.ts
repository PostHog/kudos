// The first thanks a member gives tops their XP up to level 2. Today's convex/progression/firstThanks.ts.
import type { KudosGivenEvent } from "../bus/events.ts";
import { firstDecidedOf, oldestAwardGivenBy, type AwardWithId } from "../engine/awards.ts";
import { onboardingShownTo } from "../album/items/onboardingFlag.ts";
import { isPaidOnTheMondayPath } from "../quests/mondayCatalogue.ts";
import { onboardingRewardKeys } from "../quests/onboarding.ts";
import type { MemberId } from "../workspace/directory.ts";
import { isRecorded, progressionWaitedFor } from "./effects.ts";
import { xpToReach } from "./levels.ts";
import { rewardOf, type RewardRecord } from "./rewards.ts";
import type { QueryContext } from "../operations.ts";

const firstThanksKey = "first-thanks";
const firstThanksCatalogueVersion = "onboarding-1";
const levelTheFirstThanksReaches = 2;

export type FirstThanksTopUp = { xp: number; decided: number };

export async function firstThanksTopUpFor(ctx: QueryContext, { giver, message, at }: KudosGivenEvent, recorded: AwardWithId[], xpAfter: number): Promise<RewardRecord | null> {
  if (!(await recordsTheFirstAwardOf(ctx, giver, recorded))) return null;
  const xp = xpToReach(levelTheFirstThanksReaches) - (xpAfter - (await onboardingQuestXpCreditedTo(ctx, giver)));
  if (xp <= 0 || !(await onboardingShownTo(ctx, giver))) return null;
  return { member: giver, key: firstThanksKey, xp, coins: 0, item: null, catalogueVersion: firstThanksCatalogueVersion, at, cause: message };
}

export async function firstThanksTopUpPaidTo(ctx: QueryContext, member: MemberId): Promise<FirstThanksTopUp | null> {
  const reward = await rewardOf(ctx, member, firstThanksKey);
  if (reward?.cause === undefined) return null;
  const decided = await firstDecidedOf(ctx, reward.cause);
  return decided === null ? null : { xp: reward.xp, decided };
}

export async function firstThanksAwaitsItsMoment(ctx: QueryContext, member: MemberId, now: number): Promise<boolean> {
  if ((await firstThanksTopUpPaidTo(ctx, member)) !== null) return true;
  const oldest = await oldestAwardGivenBy(ctx, member);
  return oldest !== null && oldest.decided > now - progressionWaitedFor && !(await isRecorded(ctx, oldest.award, "giver")) && (await onboardingShownTo(ctx, member));
}

async function onboardingQuestXpCreditedTo(ctx: QueryContext, member: MemberId): Promise<number> {
  let xp = 0;
  for (const key of onboardingRewardKeys) {
    const reward = await rewardOf(ctx, member, key);
    if (reward !== null && isPaidOnTheMondayPath(reward)) xp += reward.xp;
  }
  return xp;
}

async function recordsTheFirstAwardOf(ctx: QueryContext, giver: MemberId, recorded: AwardWithId[]): Promise<boolean> {
  const oldest = await oldestAwardGivenBy(ctx, giver);
  return recorded.some(({ award, giver: givenBy }) => givenBy === giver && award === oldest?.award);
}
