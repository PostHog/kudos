// An achievement's hoggie: a filled team or a reached milestone tier earns one face-down hoggie, once. Today's
// convex/album/items/achievements.ts over the service's transaction.
import type { ReachedTier } from "../milestones.ts";
import type { CrateKey } from "../hoggies/crateKey.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { completedTeamRarities, earnHoggieItem, milestoneRarities } from "../hoggies/rarityCaps.ts";
import type { MutationContext } from "../../operations.ts";

type Achiever = { workspace: string; member: MemberId };

type FilledTeam = { team: string; name: string };

export async function earnTeamItem(ctx: MutationContext, { workspace, member }: Achiever, { team, name }: FilledTeam, at: number): Promise<void> {
  const key: CrateKey = `team:${team}`;
  await earnHoggieItem(ctx, { workspace, member, key, reason: { kind: "team", team, name }, earnedAt: at }, completedTeamRarities);
}

export async function earnTierItem(ctx: MutationContext, { workspace, member }: Achiever, { milestone, tier }: ReachedTier, at: number): Promise<void> {
  const key: CrateKey = `milestone:${milestone}:${tier}`;
  await earnHoggieItem(ctx, { workspace, member, key, reason: { kind: "milestone", milestone, tier }, earnedAt: at }, milestoneRarities[tier]);
}
