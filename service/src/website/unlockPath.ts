// A member's unlock path on the website: which features are off, locked, ready or open, and the cards that show them.
// Today's convex/website/unlockPath.ts over the service's transaction.
import { everyoneBoardOnFor } from "../leaderboard/flag.ts";
import { unlockPathShownTo } from "../unlocks/launch.ts";
import { storeShownTo } from "../store/visibility.ts";
import { namedFor, scheduled, type ScheduledFeature, type StoreNaming } from "../unlocks/schedule.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksOf, type MemberUnlock } from "../unlocks/unlocks.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { seenKeyOf } from "./seen.ts";
import type { QueryContext } from "../operations.ts";

export type UnlockPath = MemberUnlock[] | null;

export type FeaturePage = { kind: "off" } | { kind: "locked"; level: number } | { kind: "ready" } | { kind: "open" };

export type PageWaits = Extract<FeaturePage, { kind: "locked" | "ready" }>;

export type FeatureCard = MemberUnlock & Pick<ScheduledFeature, "name" | "opens" | "level"> & { seen: string };

export async function unlockPathOf(ctx: QueryContext, me: VerifiedMember): Promise<UnlockPath> {
  if (!(await unlockPathShownTo(ctx, me.member))) return null;
  return unlocksOf(ctx, me.member);
}

export function featurePageOf(path: UnlockPath, feature: Feature): FeaturePage {
  const state = path?.find((unlock) => unlock.feature === feature)?.state;
  if (state === undefined) return { kind: "off" };
  if (state === "locked") return { kind: "locked", level: scheduled(feature).level };
  return { kind: state };
}

export async function leaderboardStateOf(ctx: QueryContext, me: VerifiedMember, path: UnlockPath): Promise<FeaturePage> {
  if (path === null) return (await everyoneBoardOnFor(ctx, me.member)) ? { kind: "open" } : { kind: "off" };
  return featurePageOf(path, "leaderboard");
}

export async function openFeaturesOf(ctx: QueryContext, me: VerifiedMember): Promise<Feature[]> {
  const path = await unlockPathOf(ctx, me);
  if (path !== null) return path.filter(({ state }) => state === "open").map(({ feature }) => feature);
  return (await leaderboardStateOf(ctx, me, path)).kind === "open" ? ["leaderboard"] : [];
}

export async function featureCardsOf(ctx: QueryContext, me: VerifiedMember, path: UnlockPath): Promise<FeatureCard[] | null> {
  if (path === null) return null;
  const naming = await storeNamingOf(ctx, me);
  return Promise.all(path.map((unlock) => featureCardOf(me, unlock, naming)));
}

async function storeNamingOf(ctx: QueryContext, me: VerifiedMember): Promise<StoreNaming> {
  return { storeShown: await storeShownTo(ctx, me.member) };
}

async function featureCardOf(me: VerifiedMember, unlock: MemberUnlock, naming: StoreNaming): Promise<FeatureCard> {
  const { name, opens, level } = namedFor(scheduled(unlock.feature), naming);
  return { ...unlock, name, opens, level, seen: await seenKeyOf(me.member, `feature:${unlock.feature}`) };
}
