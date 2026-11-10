// The module map's skeleton of convex/slack/customEmoji.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { textOf } from "./directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { ActionContext, MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { actionJob } from "../jobs/define.ts";

type EmojiChanged = { type: "emoji_changed" };

export function isEmojiChanged(event: { type: string }): event is EmojiChanged {
  return event.type === "emoji_changed";
}

export function emojiChangeOf(workspace: unknown, eventId: unknown) {
  const [team, receipt] = [textOf(workspace), textOf(eventId)];
  return team === undefined || receipt === undefined ? null : { workspace: team, eventId: receipt };
}

export async function refreshCustomEmojiLater(ctx: MutationContext, workspace: string): Promise<void> {
  throw notPorted("slack.customEmoji.refreshCustomEmojiLater");
}

export const syncCustomEmojiArgs = z.strictObject({ attempt: z.optional(zv.number()) });
export async function syncCustomEmoji(ctx: ActionContext, args: z.infer<typeof syncCustomEmojiArgs>): Promise<void> {
  throw notPorted("slack.customEmoji.syncCustomEmoji");
}
export const syncCustomEmojiJob = actionJob("slack.customEmoji.syncCustomEmoji", syncCustomEmojiArgs, syncCustomEmoji);
