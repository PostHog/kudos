// Rarity caps, as today's convex/album/hoggies/rarityCaps.ts: each source of hoggies draws from today's range, or from
// its capped one while the member is in the rarity-caps flag, and the forge makes nothing above the member's highest.
import { exposed, memberDecision, memberDecisionWithoutWriting, type Flag } from "../../analytics/flags.ts";
import type { Id } from "../../db/columns.ts";
import type { MutationContext, QueryContext } from "../../operations.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { earnedItemOf, earnItem } from "../items/ledger.ts";
import type { Earning } from "../items/records.ts";
import type { MilestoneTier } from "../records.ts";
import type { Rarity, WeightsName } from "./catalogue.ts";

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

const forgedUpTo = { today: "legendary", capped: "rare" } as const satisfies { today: Rarity; capped: Rarity };

export function rarityCapsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, rarityCapsFlag, member);
}

export async function highestForgedFor(ctx: QueryContext, member: MemberId): Promise<Rarity> {
  return (await rarityCapsShownTo(ctx, member)) ? forgedUpTo.capped : forgedUpTo.today;
}

export async function earnHoggieItem(ctx: MutationContext, earning: HoggieEarning, rarities: SourceRarities): Promise<Id<"items">> {
  const earned = await earnedItemOf(ctx, earning.member, "hoggie", earning.key);
  return earned?._id ?? (await earnItem(ctx, { ...earning, source: "hoggie", ...(await rarityRangeFor(ctx, earning.member, rarities)) }));
}

export async function rarityRangeFor(ctx: MutationContext, member: MemberId, { today, capped }: SourceRarities): Promise<RarityRange> {
  const caps = await memberDecision(ctx, rarityCapsFlag, member);
  await exposed(ctx, rarityCapsFlag, member, caps);
  return caps ? capped : today;
}

export function storedRangeOf({ floor, cap, weights }: RarityRange): RarityRange {
  return { floor, cap, weights };
}
