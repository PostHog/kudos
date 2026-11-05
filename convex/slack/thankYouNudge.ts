import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { observedAction } from "../analytics/boundary";
import { countableOf, type MessageDeleted, type MessageEvent } from "../engine/messageEvent";
import { isThankYou } from "../feedback/thankYouClassifier";
import { classifiedTextOf, mayThankSomeone, thankYouNudgeText } from "../feedback/thankYouNudge";
import { attemptArgs, sendAtMostOnce, tryAtMostThreeTimes } from "./delivery";

export async function nudgeIfThankYou(ctx: ActionCtx, event: MessageEvent | MessageDeleted | null) {
  if (event === null || event.kind !== "posted") return;
  if (!mayThankSomeone({ author: event.author, mentions: event.content.mentions, text: event.content.text })) return;
  try {
    const claimed = await ctx.runMutation(internal.feedback.thankYouNudge.claim, { ref: event.ref, author: event.author, content: countableOf(event.content) });
    if (!claimed || !(await isThankYou(classifiedTextOf(event.words.segments)))) return;
    const nudge = { workspace: event.ref.workspace, user: event.author, conversation: event.ref.conversation, ...(event.threadRoot && { threadRoot: event.threadRoot }) };
    await ctx.scheduler.runAfter(0, internal.slack.thankYouNudge.deliverThankYouNudge, nudge);
  } catch (error) {
    console.warn("thank_you_nudge.not_considered", { error: error instanceof Error ? error.name : typeof error });
  }
}

export const deliverThankYouNudge = observedAction({
  args: { workspace: v.string(), user: v.string(), conversation: v.string(), threadRoot: v.optional(v.string()), ...attemptArgs },
  handler: async (ctx, { attempt = 1, ...nudge }) => {
    await tryAtMostThreeTimes(
      attempt,
      async (attempt) => {
        const { kudosEmoji } = await ctx.runQuery(internal.welcome.mondayWelcome.howToOf, { workspace: nudge.workspace });
        const ephemeral = { channel: nudge.conversation, user: nudge.user, text: thankYouNudgeText(kudosEmoji), ...(nudge.threadRoot && { thread_ts: nudge.threadRoot }) };
        return sendAtMostOnce(ctx, nudge.workspace, "chat.postEphemeral", ephemeral, attempt);
      },
      (retry) => ctx.scheduler.runAt(retry.at, internal.slack.thankYouNudge.deliverThankYouNudge, { ...nudge, attempt: retry.attempt }),
    );
  },
});
