// The module map's skeleton of convex/feedback/indicator.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type Indicator = { emoji: string } | null;
export type DesiredIndicator = { indicator: Indicator; version: number };

export async function setIndicator(ctx: MutationContext, ref: MessageRef, indicator: Indicator): Promise<void> {
  throw notPorted("feedback.indicator.setIndicator");
}

export async function clearIndicator(ctx: MutationContext, ref: MessageRef): Promise<void> {
  throw notPorted("feedback.indicator.clearIndicator");
}

export const desiredArgs = messageRefValidator;
export async function desired(ctx: QueryContext, args: z.infer<typeof desiredArgs>): Promise<DesiredIndicator> {
  throw notPorted("feedback.indicator.desired");
}
