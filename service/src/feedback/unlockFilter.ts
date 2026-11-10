// The module map's skeleton of convex/feedback/unlockFilter.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { featureValidator, type Feature } from "../unlocks/feature.ts";
import { type ScheduledFeature } from "../unlocks/schedule.ts";
import { type MemberId } from "../workspace/directory.ts";
import type { Line } from "./segments.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function whenOpened<T>(ctx: QueryContext, member: MemberId, feature: Feature, told: T): Promise<T | null> {
  throw notPorted("feedback.unlockFilter.whenOpened");
}

export async function whenShipped<T>(ctx: QueryContext, member: MemberId, feature: Feature, told: T): Promise<T | null> {
  throw notPorted("feedback.unlockFilter.whenShipped");
}

export async function isOpened(ctx: QueryContext, member: MemberId, feature: Feature): Promise<boolean> {
  throw notPorted("feedback.unlockFilter.isOpened");
}

export type UnopenedReply = { lines: Line[] | null; shownToUnknownViewer: boolean | null };

export const unopenedReplyOfArgs = z.strictObject({ workspace: z.string(), user: z.string(), feature: featureValidator });
export async function unopenedReplyOf(ctx: MutationContext, args: z.infer<typeof unopenedReplyOfArgs>): Promise<UnopenedReply> {
  throw notPorted("feedback.unlockFilter.unopenedReplyOf");
}

export function renderUnopenedReply(feature: ScheduledFeature, state: "ready" | "locked"): Line[] {
  return [[{ text: unopenedTextOf(feature, state) }]];
}

export function unopenedTextOf({ name, level }: ScheduledFeature, state: "ready" | "locked") {
  return state === "ready" ? `${name} is ready for you. Open it in App Home.` : `${name} opens at level ${level}.`;
}
