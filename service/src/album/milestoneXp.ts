// The module map's skeleton of convex/album/milestoneXp.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { ReachedTier } from "./milestones.ts";
import type { MilestoneTier } from "./records.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type UnlockedTier = ReachedTier & { xp?: number };

export const milestoneXpFlag = { key: "milestone-xp", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const milestoneXpByMetal: Record<MilestoneTier, number> = { bronze: 100, silver: 250, gold: 500, diamond: 1000 };

type Owner = { workspace: string; member: MemberId };

export async function payTheMedals(ctx: MutationContext, { workspace, member }: Owner, unlocked: ReachedTier[], at: number): Promise<UnlockedTier[]> {
  throw notPorted("album.milestoneXp.payTheMedals");
}
