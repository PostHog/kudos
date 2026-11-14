// The unlock schedule: each feature, the level that makes it ready, and the flag it ships with.
// Today's convex/unlocks/schedule.ts over the service's flags.
import { achievementsFlag } from "../achievements/achievementsFlag.ts";
import { memberDecision, workspaceDecision, type Flag } from "../analytics/flags.ts";
import { everyoneBoardFlag } from "../leaderboard/flag.ts";
import { questsFlag } from "../quests/questsFlag.ts";
import { skillTreeLevel } from "../progression/levels.ts";
import { skillTreeFlag } from "../progression/skillTreeFlag.ts";
import { coinsFlag } from "../wallet/coinsFlag.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { Feature } from "./feature.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

type ShipFlag = Flag<boolean>;

export type ScheduledFeature = { feature: Feature; level: number; name: string; opens: string; shipsWith: ShipFlag };

type Naming = Pick<ScheduledFeature, "name" | "opens">;

const namedWithTheStore: Partial<Record<Feature, Naming>> = {
  coins: { name: "Coins and inventory", opens: "your wallet, the store and your kudos emoji" },
};

export const schedule = {
  version: "2",
  features: [
    { feature: "book", level: 1, name: "Book", opens: "achievements", shipsWith: achievementsFlag },
    { feature: "leaderboard", level: 2, name: "Leaderboard", opens: "the boards", shipsWith: everyoneBoardFlag },
    { feature: "quests", level: 3, name: "Quests", opens: "your weekly quests", shipsWith: questsFlag },
    { feature: "skillTree", level: skillTreeLevel, name: "Skill tree", opens: "the tree and your first skill point", shipsWith: skillTreeFlag },
    { feature: "coins", level: 6, name: "Coins", opens: "your wallet and the coin perks", shipsWith: coinsFlag },
  ],
} as const satisfies { version: string; features: readonly ScheduledFeature[] };

const startingLevel = 1;

export function readyFromTheStart({ level }: Pick<ScheduledFeature, "level">): boolean {
  return level <= startingLevel;
}

export function scheduled(feature: Feature): ScheduledFeature {
  return schedule.features.find((entry) => entry.feature === feature)!;
}

export type StoreNaming = { storeShown: boolean };

export const withoutTheStore: StoreNaming = { storeShown: false };

export function namedFor(entry: ScheduledFeature, { storeShown }: StoreNaming): ScheduledFeature {
  const naming = storeShown ? namedWithTheStore[entry.feature] : undefined;
  return naming === undefined ? entry : { ...entry, ...naming };
}

export function shippedIn(ctx: QueryContext | MutationContext, workspace: string): Promise<ScheduledFeature[]> {
  return shippedBy((flag) => workspaceDecision(ctx, flag, workspace), schedule.features);
}

export function shippedTo(ctx: QueryContext | MutationContext, member: MemberId, among: readonly ScheduledFeature[] = schedule.features): Promise<ScheduledFeature[]> {
  return shippedBy((flag) => memberDecision(ctx, flag, member), among);
}

async function shippedBy(decides: (flag: ShipFlag) => Promise<boolean>, among: readonly ScheduledFeature[]) {
  const shipped: ScheduledFeature[] = [];
  for (const entry of among) {
    if (await decides(entry.shipsWith)) shipped.push(entry);
  }
  return shipped;
}
