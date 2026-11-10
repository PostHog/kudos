// The module map's skeleton of convex/website/unlockPath.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { scheduled, type ScheduledFeature } from "../unlocks/schedule.ts";
import type { Feature } from "../unlocks/feature.ts";
import type { MemberUnlock } from "../unlocks/unlocks.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type UnlockPath = MemberUnlock[] | null;

export type FeaturePage = { kind: "off" } | { kind: "locked"; level: number } | { kind: "ready" } | { kind: "open" };

export type PageWaits = Extract<FeaturePage, { kind: "locked" | "ready" }>;

export type FeatureCard = MemberUnlock & Pick<ScheduledFeature, "name" | "opens" | "level"> & { seen: string };

export async function unlockPathOf(ctx: QueryContext, me: VerifiedMember): Promise<UnlockPath> {
  throw notPorted("website.unlockPath.unlockPathOf");
}

export function featurePageOf(path: UnlockPath, feature: Feature): FeaturePage {
  const state = path?.find((unlock) => unlock.feature === feature)?.state;
  if (state === undefined) return { kind: "off" };
  if (state === "locked") return { kind: "locked", level: scheduled(feature).level };
  return { kind: state };
}

export async function leaderboardStateOf(ctx: QueryContext, me: VerifiedMember, path: UnlockPath): Promise<FeaturePage> {
  throw notPorted("website.unlockPath.leaderboardStateOf");
}

export async function openFeaturesOf(ctx: QueryContext, me: VerifiedMember): Promise<Feature[]> {
  throw notPorted("website.unlockPath.openFeaturesOf");
}

export async function featureCardsOf(ctx: QueryContext, me: VerifiedMember, path: UnlockPath): Promise<FeatureCard[] | null> {
  throw notPorted("website.unlockPath.featureCardsOf");
}
