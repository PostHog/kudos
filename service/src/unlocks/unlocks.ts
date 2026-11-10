// The module map's skeleton of convex/unlocks/unlocks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { levelReachedEventValidator } from "../bus/events.ts";
import type { Surface } from "../commands/surface.ts";
import { type DecidedBelow } from "../engine/awards.ts";
import { type MemberId } from "../workspace/directory.ts";
import { type Feature } from "./feature.ts";
import { type ScheduledFeature } from "./schedule.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type UnlockState = "unshipped" | "locked" | "ready" | "open";

export type MemberUnlock = { feature: Feature; state: Exclude<UnlockState, "unshipped">; readyAt: number | null; openedAt: number | null };

export type UnlocksHome = { ready: ScheduledFeature[]; next: ScheduledFeature | null };

export const makeReadyArgs = z.strictObject({ event: levelReachedEventValidator });
export async function makeReady(ctx: MutationContext, args: z.infer<typeof makeReadyArgs>): Promise<void> {
  throw notPorted("unlocks.unlocks.makeReady");
}
export const makeReadyJob = mutationJob("unlocks.unlocks.makeReady", makeReadyArgs, makeReady);

export async function openUnlock(ctx: MutationContext, member: MemberId, feature: Feature, surface: Surface): Promise<"done" | "refused"> {
  throw notPorted("unlocks.unlocks.openUnlock");
}

export type Opening = { workspace: string; member: MemberId; at: number; byLaunch?: true };

export async function keepOpen(ctx: MutationContext, opening: Opening, feature: Feature): Promise<boolean> {
  throw notPorted("unlocks.unlocks.keepOpen");
}

export async function stateOf(ctx: QueryContext, member: MemberId, feature: Feature): Promise<UnlockState> {
  throw notPorted("unlocks.unlocks.stateOf");
}

export async function openedAtOf(ctx: QueryContext, member: MemberId, feature: Feature): Promise<number | null> {
  throw notPorted("unlocks.unlocks.openedAtOf");
}

export async function unlocksOf(ctx: QueryContext, member: MemberId): Promise<MemberUnlock[]> {
  throw notPorted("unlocks.unlocks.unlocksOf");
}

export type ReadyFeature = { feature: Feature; readyAt: number };

export async function readyFeaturesOf(ctx: QueryContext, member: MemberId, limit: number): Promise<ReadyFeature[]> {
  throw notPorted("unlocks.unlocks.readyFeaturesOf");
}

export async function unlocksHomeOf(ctx: QueryContext, member: MemberId): Promise<UnlocksHome> {
  throw notPorted("unlocks.unlocks.unlocksHomeOf");
}

export async function withoutReadiness(ctx: QueryContext, member: MemberId, features: ScheduledFeature[]): Promise<import("./schedule.ts").ScheduledFeature[]> {
  throw notPorted("unlocks.unlocks.withoutReadiness");
}

export async function makeReadyFromTheStart(ctx: MutationContext, workspace: string, member: MemberId): Promise<void> {
  throw notPorted("unlocks.unlocks.makeReadyFromTheStart");
}

export function reachedAt(features: readonly ScheduledFeature[], level: number) {
  return features.filter((entry) => entry.level <= level);
}

export async function storeReadiness(ctx: MutationContext, { workspace, member, at }: { workspace: string; member: MemberId; at: number }, reached: ScheduledFeature[]): Promise<import("./schedule.ts").ScheduledFeature[]> {
  throw notPorted("unlocks.unlocks.storeReadiness");
}

export type RecordedLevelUp = { level: number; at: number; created: number };

export async function* levelUpsByDecision(ctx: QueryContext, member: MemberId, below: DecidedBelow): AsyncGenerator<RecordedLevelUp> {
  throw notPorted("unlocks.unlocks.levelUpsByDecision");
}
