// The module map's skeleton of convex/album/hoggies/rarityCaps.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../../analytics/flags.ts";
import type { Earning } from "../items/records.ts";
import type { MemberId } from "../../workspace/directory.ts";
import type { MilestoneTier } from "../records.ts";
import type { Rarity, WeightsName } from "./catalogue.ts";
import type { Id } from "../../db/columns.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import { notPorted } from "../../notPorted.ts";

export const rarityCapsFlag = { key: "rarity-caps", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type RarityRange = { floor?: Rarity; cap?: Rarity; weights?: WeightsName };

export type SourceRarities = { today: RarityRange; capped: RarityRange };

export type HoggieEarning = Omit<Earning, "source" | keyof RarityRange>;

const cappedAtRare: RarityRange = { cap: "rare", weights: "base" };

const exactlyRare: RarityRange = { floor: "rare", cap: "rare", weights: "base" };

export const kudosPackRarities: SourceRarities = { today: {}, capped: { weights: "kudos" } };

export const welcomeRarities: SourceRarities = { today: { floor: "rare" }, capped: exactlyRare };

export const levelUpSlotRarities: SourceRarities = { today: {}, capped: cappedAtRare };

export const levelUpThirdSlotRarities: SourceRarities = { today: { floor: "rare" }, capped: exactlyRare };

export const completedTeamRarities: SourceRarities = { today: { floor: "rare" }, capped: exactlyRare };

export const milestoneRarities: Record<MilestoneTier, SourceRarities> = {
  bronze: { today: { floor: "uncommon" }, capped: { floor: "uncommon", cap: "rare", weights: "base" } },
  silver: { today: { floor: "rare" }, capped: exactlyRare },
  gold: { today: { floor: "epic" }, capped: exactlyRare },
  diamond: { today: { floor: "legendary" }, capped: exactlyRare },
};

export const questHoggieRarities: SourceRarities = { today: {}, capped: cappedAtRare };

export const featureOpeningRarities: SourceRarities = { today: {}, capped: cappedAtRare };

export const boughtCrateRarities: SourceRarities = { today: {}, capped: cappedAtRare };

export const hugFindRarities: RarityRange = cappedAtRare;

export function rarityCapsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("album.hoggies.rarityCaps.rarityCapsShownTo");
}

export async function highestForgedFor(ctx: QueryContext, member: MemberId): Promise<Rarity> {
  throw notPorted("album.hoggies.rarityCaps.highestForgedFor");
}

export async function earnHoggieItem(ctx: MutationContext, earning: HoggieEarning, rarities: SourceRarities): Promise<Id<"items">> {
  throw notPorted("album.hoggies.rarityCaps.earnHoggieItem");
}

export async function rarityRangeFor(ctx: MutationContext, member: MemberId, { today, capped }: SourceRarities): Promise<RarityRange> {
  throw notPorted("album.hoggies.rarityCaps.rarityRangeFor");
}

export function storedRangeOf({ floor, cap, weights }: RarityRange): RarityRange {
  return { floor, cap, weights };
}
