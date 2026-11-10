// A member's profile card: their name, their level where XP levels show, and their best medals where the Book applies,
// each ladder's highest tier, best first. Today's convex/profileCard/profileCard.ts.
import { bookAppliesIn } from "../achievements/flag.ts";
import { ladderOf, ladders, type LadderId, type TierId } from "../achievements/ladders.ts";
import { laddersShownTo } from "../achievements/shown.ts";
import { everyTierEarnedBy, type EarnedTier } from "../achievements/tiers.ts";
import { groupsShownTo, primaryGroupOf } from "../groups/groups.ts";
import { standingOf } from "../progression/progression.ts";
import { xpLevelsShownIn } from "../progression/xpLevels.ts";
import { openedAtOf } from "../unlocks/unlocks.ts";
import { nameless } from "../website/faces.ts";
import { chatUserOf, displayNameOf, type MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export type Medal = { ladder: LadderId; tier: TierId; name: string };

export type ProfileCard = { name: string; level: number | null; medals: Medal[] };

export type Viewing = { own: boolean; viewer: MemberId | null };

const medalsShown = 4;
const tiersBestFirst: readonly TierId[] = ["diamond", "gold", "silver", "bronze"];
const ladderOrder: readonly LadderId[] = ladders.ladders.map(({ ladder }) => ladder);

export async function profileCardOf(ctx: QueryContext, member: MemberId, { own, viewer }: Viewing): Promise<ProfileCard> {
  const { workspace } = await chatUserOf(ctx, member);
  return {
    name: (await displayNameOf(ctx, member)) ?? nameless,
    level: (await xpLevelsShownIn(ctx, workspace)) ? (await standingOf(ctx, member)).level : null,
    medals: (await medalsShownIn(ctx, workspace, member, own)) ? await medalsShownTo(ctx, viewer, member) : [],
  };
}

async function medalsShownTo(ctx: QueryContext, viewer: MemberId | null, member: MemberId) {
  const shown = await laddersShownTo(ctx, viewer);
  return bestMedalsOf((await everyTierEarnedBy(ctx, member)).filter(({ ladder }) => shown.includes(ladder)));
}

export async function groupNameOnCard(ctx: QueryContext, viewer: MemberId, member: MemberId): Promise<string | null> {
  if (!(await groupsShownTo(ctx, viewer))) return null;
  return (await primaryGroupOf(ctx, member))?.name ?? null;
}

async function medalsShownIn(ctx: QueryContext, workspace: string, member: MemberId, own: boolean) {
  if (!(await bookAppliesIn(ctx, workspace))) return false;
  return !own || (await openedAtOf(ctx, member, "book")) !== null;
}

function bestMedalsOf(earned: EarnedTier[]): Medal[] {
  return ladderOrder
    .flatMap((ladder) => highestTierOn(ladder, earned))
    .toSorted((one, other) => tiersBestFirst.indexOf(one.tier) - tiersBestFirst.indexOf(other.tier))
    .slice(0, medalsShown);
}

function highestTierOn(ladder: LadderId, earned: EarnedTier[]): Medal[] {
  const tier = tiersBestFirst.find((tier) => earned.some((row) => row.ladder === ladder && row.tier === tier));
  if (tier === undefined) return [];
  return [{ ladder, tier, name: ladderOf(ladder).tiers.find((entry) => entry.tier === tier)!.name }];
}
