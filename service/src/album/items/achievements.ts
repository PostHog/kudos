// The module map's skeleton of convex/album/items/achievements.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ReachedTier } from "../milestones.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { MutationContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

type Achiever = { workspace: string; member: MemberId };

type FilledTeam = { team: string; name: string };

export async function earnTeamItem(ctx: MutationContext, { workspace, member }: Achiever, { team, name }: FilledTeam, at: number): Promise<void> {
  throw notPorted("album.items.achievements.earnTeamItem");
}

export async function earnTierItem(ctx: MutationContext, { workspace, member }: Achiever, { milestone, tier }: ReachedTier, at: number): Promise<void> {
  throw notPorted("album.items.achievements.earnTierItem");
}
