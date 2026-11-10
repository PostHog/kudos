// The module map's skeleton of convex/profileCard/profileCard.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { ladders, type LadderId, type TierId } from "../achievements/ladders.ts";
import { type MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Medal = { ladder: LadderId; tier: TierId; name: string };

export type ProfileCard = { name: string; level: number | null; medals: Medal[] };

export type Viewing = { own: boolean; viewer: MemberId | null };
const ladderOrder: readonly LadderId[] = ladders.ladders.map(({ ladder }) => ladder);

export async function profileCardOf(ctx: QueryContext, member: MemberId, { own, viewer }: Viewing): Promise<ProfileCard> {
  throw notPorted("profileCard.profileCard.profileCardOf");
}

export async function groupNameOnCard(ctx: QueryContext, viewer: MemberId, member: MemberId): Promise<string | null> {
  throw notPorted("profileCard.profileCard.groupNameOnCard");
}
