// The module map's skeleton of convex/slack/placedReactions.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { messageRefValidator } from "../engine/messageEvent.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const onArgs = messageRefValidator;
export async function on(ctx: QueryContext, args: z.infer<typeof onArgs>): Promise<string[]> {
  throw notPorted("slack.placedReactions.on");
}

export const rememberArgs = z.strictObject({ ref: messageRefValidator, emoji: z.string() });
export async function remember(ctx: MutationContext, args: z.infer<typeof rememberArgs>): Promise<void> {
  throw notPorted("slack.placedReactions.remember");
}
