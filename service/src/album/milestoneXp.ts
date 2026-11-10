// The medals: each milestone tier a member turns pays XP by its metal, behind the milestone-xp flag. The album only
// publishes medalsUnlocked, each medal with its reward key; progression pays each key once. Today's
// convex/album/milestoneXp.ts over the service's transaction and bus.
import { exposed, memberDecision, type Flag } from "../analytics/flags.ts";
import type { MedalsUnlockedEvent } from "../bus/events.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { ReachedTier } from "./milestones.ts";
import type { MilestoneTier } from "./records.ts";
import type { MutationContext } from "../operations.ts";

export type UnlockedTier = ReachedTier & { xp?: number };

export const milestoneXpFlag = { key: "milestone-xp", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const milestoneXpByMetal: Record<MilestoneTier, number> = { bronze: 100, silver: 250, gold: 500, diamond: 1000 };

const catalogueVersion = "milestone-xp-1";

type Owner = { workspace: string; member: MemberId };

function rewardKeyOf({ milestone, tier }: ReachedTier) {
  return `milestone:${milestone}:${tier}`;
}

export async function payTheMedals(ctx: MutationContext, { workspace, member }: Owner, unlocked: ReachedTier[], at: number): Promise<UnlockedTier[]> {
  if (unlocked.length === 0 || !(await milestoneXpPaysFor(ctx, member))) return unlocked;
  const paid = unlocked.map((reached) => ({ ...reached, xp: milestoneXpByMetal[reached.tier] }));
  const medals: MedalsUnlockedEvent = { type: "medalsUnlocked", workspace, member, medals: paid.map((medal) => ({ ...medal, rewardKey: rewardKeyOf(medal) })), catalogueVersion, at };
  await ctx.publish(medals);
  return paid;
}

async function milestoneXpPaysFor(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const pays = await memberDecision(ctx, milestoneXpFlag, member);
  await exposed(ctx, milestoneXpFlag, member, pays);
  return pays;
}
