// The module map's skeleton of convex/album/items/milestoneUnlocks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MilestoneAnswer, ReachedTier } from "../milestones.ts";
import type { UnlockedTier } from "../milestoneXp.ts";
import type { PageOwner } from "../teamPages.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export async function unlockMilestoneTiers(ctx: MutationContext, owner: PageOwner, at: number): Promise<UnlockedTier[]> {
  throw notPorted("album.items.milestoneUnlocks.unlockMilestoneTiers");
}

export async function tiersTurnedBy(ctx: QueryContext, member: MemberId): Promise<ReachedTier[]> {
  throw notPorted("album.items.milestoneUnlocks.tiersTurnedBy");
}

export async function milestonesHeldForTheirTurn(ctx: QueryContext, member: MemberId, milestones: MilestoneAnswer[]): Promise<MilestoneAnswer[]> {
  throw notPorted("album.items.milestoneUnlocks.milestonesHeldForTheirTurn");
}
