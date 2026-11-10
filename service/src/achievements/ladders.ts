import { z } from "zod";

export const awardLadderValidator = z.union([
  z.literal("generosity"),
  z.literal("recognition"),
  z.literal("connections"),
  z.literal("dependability"),
  z.literal("applause"),
  z.literal("seasons"),
  z.literal("old-friends"),]
);

export const completionLadderValidator = z.literal("team-spirit");

export const ladderValidator = z.union([...awardLadderValidator.options, completionLadderValidator]);

export const tierValidator = z.union([z.literal("bronze"), z.literal("silver"), z.literal("gold"), z.literal("diamond")]);

export const rewardKindValidator = z.union([z.literal("coins"), z.literal("kudosEmoji"), z.literal("hedgehog")]);

export const promisedRewardValidator = z.strictObject({ kind: rewardKindValidator, reward: z.string() });

export const tierRefValidator = z.strictObject({ ladder: ladderValidator, tier: tierValidator });

export type LadderId = z.infer<typeof ladderValidator>;

export type AwardLadderId = z.infer<typeof awardLadderValidator>;

export type CompletionLadderId = z.infer<typeof completionLadderValidator>;

export type TierId = z.infer<typeof tierValidator>;

export type PromisedReward = z.infer<typeof promisedRewardValidator>;

export type TierRef = z.infer<typeof tierRefValidator>;

export type Tier = { tier: TierId; name: string; count: number; rewards: PromisedReward[] };

export type CoinReward = { reward: string; coins: number };

export type Ladder = { ladder: LadderId; name: string; counts: string; countsOne: string; tiers: Tier[]; countsCompletions?: true };

type FourTiers<T> = [T, T, T, T];

const kudosCounts: FourTiers<number> = [1, 25, 100, 500];

const coinsOfTier: Partial<Record<TierId, number>> = { bronze: 10, diamond: 100 };

export const ladders = {
  version: "1",
  ladders: [
    {
      ladder: "generosity",
      name: "Generosity",
      counts: "kudos given",
      countsOne: "kudos given",
      tiers: tiersOf("generosity", ["First Thanks", "Generous Soul", "Heart of the Team", "Patron of Praise"], kudosCounts),
    },
    {
      ladder: "recognition",
      name: "Recognition",
      counts: "kudos received",
      countsOne: "kudos received",
      tiers: tiersOf("recognition", ["Noticed", "Appreciated", "Highly Valued", "Hall of Fame"], kudosCounts),
    },
    {
      ladder: "connections",
      name: "Connections",
      counts: "different people thanked",
      countsOne: "person thanked",
      tiers: tiersOf("connections", ["Friendly Face", "Connector", "Social Butterfly", "Constellation Maker"], [3, 6, 12, 24]),
    },
    {
      ladder: "team-spirit",
      name: "Team Spirit",
      counts: "team pages completed",
      countsOne: "team page completed",
      tiers: tiersOf("team-spirit", ["Team Spirit", "All Hands", "Tight-Knit", "Unbreakable Crew"], [1, 2, 4, 8]),
      countsCompletions: true,
    },
    {
      ladder: "dependability",
      name: "Dependability",
      counts: "days with a kudos given",
      countsOne: "day with a kudos given",
      tiers: tiersOf("dependability", ["Regular", "Mainstay", "Pillar", "Cornerstone"], [10, 30, 100, 250]),
    },
    {
      ladder: "applause",
      name: "Applause",
      counts: "days thanking 3+ different people",
      countsOne: "day thanking 3+ different people",
      tiers: tiersOf("applause", ["Shout-out", "Hype Squad", "Thunderous Applause", "Grand Chorus"], [3, 10, 30, 100]),
    },
    {
      ladder: "seasons",
      name: "Seasons",
      counts: "calendar months with a kudos given",
      countsOne: "calendar month with a kudos given",
      tiers: tiersOf("seasons", ["First Chapter", "Season of Thanks", "Half-Year Hero", "Year of Gratitude"], [1, 3, 6, 12]),
    },
    {
      ladder: "old-friends",
      name: "Old Friends",
      counts: "thanks again after 30+ days",
      countsOne: "thanks again after 30+ days",
      tiers: tiersOf("old-friends", ["Remembered", "Old Friends", "Long Memory", "Evergreen"], [1, 3, 6, 12]),
    },
  ],
} as const satisfies { version: string; ladders: readonly Ladder[] };

export function ladderOf(ladder: LadderId): Ladder {
  return ladders.ladders.find((entry) => entry.ladder === ladder)!;
}

export function awardLadders(): Array<Ladder & { ladder: AwardLadderId }> {
  const catalogue: readonly Ladder[] = ladders.ladders;
  return catalogue.filter((entry): entry is Ladder & { ladder: AwardLadderId } => entry.countsCompletions !== true);
}

export function isToldPublicly({ ladder }: Pick<TierRef, "ladder">): boolean {
  return ladderOf(ladder).countsCompletions !== true;
}

export function tierOf({ ladder, tier }: TierRef): Tier {
  return ladderOf(ladder).tiers.find((entry) => entry.tier === tier)!;
}

export function tierNameOf(ref: TierRef) {
  return tierOf(ref).name;
}

export function countsOf(ladder: LadderId, count: number): string {
  const { counts, countsOne } = ladderOf(ladder);
  return count === 1 ? countsOne : counts;
}

export function coinsPaidBy(tier: TierId): number {
  return coinsOfTier[tier] ?? 0;
}

export function coinRewardsOf({ tier, rewards }: Pick<Tier, "tier" | "rewards">): CoinReward[] {
  return rewards.filter(({ kind }) => kind === "coins").map(({ reward }) => ({ reward, coins: coinsPaidBy(tier) }));
}

function tiersOf(ladder: LadderId, [bronze, silver, gold, diamond]: FourTiers<string>, counts: FourTiers<number>): Tier[] {
  return [
    { tier: "bronze", name: bronze, count: counts[0], rewards: [{ kind: "coins", reward: `${ladder}-bronze-coins` }] },
    { tier: "silver", name: silver, count: counts[1], rewards: [{ kind: "kudosEmoji", reward: `${ladder}-silver-kudos-emoji` }] },
    { tier: "gold", name: gold, count: counts[2], rewards: [{ kind: "hedgehog", reward: `${ladder}-gold-hedgehog` }] },
    {
      tier: "diamond",
      name: diamond,
      count: counts[3],
      rewards: [
        { kind: "coins", reward: `${ladder}-diamond-coins` },
        { kind: "hedgehog", reward: `${ladder}-diamond-hedgehog` },
      ],
    },
  ];
}
