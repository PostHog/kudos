// The module map's skeleton of convex/unlocks/launch.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import { type MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const unlocksFlag = { key: "unlocks", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type UnlocksFor = "off" | "live" | "previewStarted";

export async function unlocksShownTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("unlocks.launch.unlocksShownTo");
}

export const exposeUnlocksArgs = z.strictObject({ workspace: z.string(), user: z.string(), shown: z.boolean() });
export async function exposeUnlocks(ctx: MutationContext, args: z.infer<typeof exposeUnlocksArgs>): Promise<void> {
  throw notPorted("unlocks.launch.exposeUnlocks");
}
export const exposeUnlocksJob = mutationJob("unlocks.launch.exposeUnlocks", exposeUnlocksArgs, exposeUnlocks);

export async function unlocksLiveFor(ctx: MutationContext, member: MemberId): Promise<UnlocksFor> {
  throw notPorted("unlocks.launch.unlocksLiveFor");
}

export async function unlocksOpenedFor(ctx: MutationContext, workspace: string, member: MemberId): Promise<UnlocksFor> {
  throw notPorted("unlocks.launch.unlocksOpenedFor");
}

export async function unlocksLiveIn(ctx: MutationContext, workspace: string): Promise<boolean> {
  throw notPorted("unlocks.launch.unlocksLiveIn");
}

export async function unlocksPreviewedBy(ctx: MutationContext, member: MemberId): Promise<void> {
  throw notPorted("unlocks.launch.unlocksPreviewedBy");
}

export async function readyFromTheStartOnTheWebsite(ctx: MutationContext, member: MemberId): Promise<void> {
  throw notPorted("unlocks.launch.readyFromTheStartOnTheWebsite");
}

export async function unlockPathShownIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("unlocks.launch.unlockPathShownIn");
}

export async function unlockPathShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("unlocks.launch.unlockPathShownTo");
}

export async function unlocksAppliedIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("unlocks.launch.unlocksAppliedIn");
}

export async function unlocksAppliedTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("unlocks.launch.unlocksAppliedTo");
}

export async function unlocksLaunchDueIn(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("unlocks.launch.unlocksLaunchDueIn");
}
