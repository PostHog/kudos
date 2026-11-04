import { exposed, memberDecision, type Flag } from "../analytics/flags";
import type { MutationCtx } from "../_generated/server";
import { publish } from "../bus/publish";
import type { MemberId } from "../workspace/directory";
import type { ReachedTier } from "./milestones";
import type { MilestoneTier } from "./records";

export type UnlockedTier = ReachedTier & { xp?: number };

export const milestoneXpFlag = { key: "milestone-xp", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const milestoneXpByMetal: Record<MilestoneTier, number> = { bronze: 100, silver: 250, gold: 500, diamond: 1000 };

const catalogueVersion = "milestone-xp-1";

type Owner = { workspace: string; member: MemberId };

function rewardKeyOf({ milestone, tier }: ReachedTier) {
  return `milestone:${milestone}:${tier}`;
}

export async function payTheMedals(ctx: MutationCtx, { workspace, member }: Owner, unlocked: ReachedTier[], at: number): Promise<UnlockedTier[]> {
  if (unlocked.length === 0 || !(await milestoneXpPaysFor(ctx, member))) return unlocked;
  const paid = unlocked.map((reached) => ({ ...reached, xp: milestoneXpByMetal[reached.tier] }));
  for (const medal of paid) await publish(ctx, { type: "medalUnlocked", workspace, member, ...medal, rewardKey: rewardKeyOf(medal), catalogueVersion, at });
  return paid;
}

async function milestoneXpPaysFor(ctx: MutationCtx, member: MemberId): Promise<boolean> {
  const pays = await memberDecision(ctx, milestoneXpFlag, member);
  await exposed(ctx, milestoneXpFlag, member, pays);
  return pays;
}
