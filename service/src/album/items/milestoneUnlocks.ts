// Unlocking milestone tiers: a turn records the album's milestones, unlocks each earned tier's emoji once and pays its
// medals; while hidden items show, a tier counts as turned only once its emoji is seen. Today's
// convex/album/items/milestoneUnlocks.ts over the service's transaction.
import { markEmojiSeen, seenAtOf, tierEmojiIdOf, tierUnlockedAt } from "../earnedEmojis.ts";
import { recordMilestonesOf, tiersEarnedBy, type MilestoneAnswer, type ReachedTier } from "../milestones.ts";
import type { MilestoneId } from "../milestoneCatalogue.ts";
import { payTheMedals, type UnlockedTier } from "../milestoneXp.ts";
import type { PageOwner } from "../teamPages.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { hiddenItemsShownTo } from "./flag.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";

type AnsweredTier = MilestoneAnswer["tiers"][number];

export async function unlockMilestoneTiers(ctx: MutationContext, owner: PageOwner, at: number): Promise<UnlockedTier[]> {
  await recordMilestonesOf(ctx, owner, at);
  const unlocked: ReachedTier[] = [];
  for (const tier of await tiersEarnedBy(ctx, owner.member)) if (await markEmojiSeen(ctx, owner.member, tierEmojiIdOf(tier), at)) unlocked.push(tier);
  return payTheMedals(ctx, owner, unlocked, at);
}

export async function tiersTurnedBy(ctx: QueryContext, member: MemberId): Promise<ReachedTier[]> {
  const earned = await tiersEarnedBy(ctx, member);
  if (!(await hiddenItemsShownTo(ctx, member))) return earned;
  const turned: ReachedTier[] = [];
  for (const tier of earned) if ((await seenAtOf(ctx, member, tierEmojiIdOf(tier))) !== null) turned.push(tier);
  return turned;
}

export async function milestonesHeldForTheirTurn(ctx: QueryContext, member: MemberId, milestones: MilestoneAnswer[]): Promise<MilestoneAnswer[]> {
  const held: MilestoneAnswer[] = [];
  for (const milestone of milestones) held.push({ ...milestone, tiers: await tiersHeldOf(ctx, member, milestone) });
  return held;
}

async function tiersHeldOf(ctx: QueryContext, member: MemberId, { id, tiers }: MilestoneAnswer): Promise<AnsweredTier[]> {
  const held: AnsweredTier[] = [];
  for (const tier of tiers) held.push(await heldUntilSeen(ctx, member, id, tier));
  return held;
}

async function heldUntilSeen(ctx: QueryContext, member: MemberId, milestone: MilestoneId, tier: AnsweredTier): Promise<AnsweredTier> {
  if (tier.earnedAt === null) return tier;
  const unlockedAt = await tierUnlockedAt(ctx, member, { milestone, tier: tier.tier }, tier.earnedAt);
  return unlockedAt === null ? { ...tier, earnedAt: null } : { ...tier, unlockedAt };
}
