import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { markEmojiSeen, seenAtOf, tierEmojiIdOf, tierUnlockedAt } from "../earnedEmojis";
import { recordMilestonesOf, tiersEarnedBy, type MilestoneAnswer, type ReachedTier } from "../milestones";
import type { MilestoneId } from "../milestoneCatalogue";
import { payTheMedals, type MedalXp } from "../milestoneXp";
import type { PageOwner } from "../teamPages";
import type { MemberId } from "../../workspace/directory";
import { hiddenItemsShownTo } from "./flag";

type AnsweredTier = MilestoneAnswer["tiers"][number];

export type UnlockedMedals = { milestones: ReachedTier[]; medalXp: MedalXp[] };

export async function unlockMilestoneTiers(ctx: MutationCtx, owner: PageOwner, at: number): Promise<UnlockedMedals> {
  await recordMilestonesOf(ctx, owner, at);
  const unlocked: ReachedTier[] = [];
  for (const tier of await tiersEarnedBy(ctx, owner.member)) if (await markEmojiSeen(ctx, owner.member, tierEmojiIdOf(tier), at)) unlocked.push(tier);
  return { milestones: unlocked, medalXp: await payTheMedals(ctx, owner, unlocked, at) };
}

export async function tiersTurnedBy(ctx: QueryCtx, member: MemberId): Promise<ReachedTier[]> {
  const earned = await tiersEarnedBy(ctx, member);
  if (!(await hiddenItemsShownTo(ctx, member))) return earned;
  const turned: ReachedTier[] = [];
  for (const tier of earned) if ((await seenAtOf(ctx, member, tierEmojiIdOf(tier))) !== null) turned.push(tier);
  return turned;
}

export async function milestonesHeldForTheirTurn(ctx: QueryCtx, member: MemberId, milestones: MilestoneAnswer[]): Promise<MilestoneAnswer[]> {
  const held: MilestoneAnswer[] = [];
  for (const milestone of milestones) held.push({ ...milestone, tiers: await tiersHeldOf(ctx, member, milestone) });
  return held;
}

async function tiersHeldOf(ctx: QueryCtx, member: MemberId, { id, tiers }: MilestoneAnswer): Promise<AnsweredTier[]> {
  const held: AnsweredTier[] = [];
  for (const tier of tiers) held.push(await heldUntilSeen(ctx, member, id, tier));
  return held;
}

async function heldUntilSeen(ctx: QueryCtx, member: MemberId, milestone: MilestoneId, tier: AnsweredTier): Promise<AnsweredTier> {
  if (tier.earnedAt === null) return tier;
  const unlockedAt = await tierUnlockedAt(ctx, member, { milestone, tier: tier.tier }, tier.earnedAt);
  return unlockedAt === null ? { ...tier, earnedAt: null } : { ...tier, unlockedAt };
}
