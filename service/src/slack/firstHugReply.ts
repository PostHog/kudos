// The reply to a member's first hug: what a hug is, whom it paid, and how a kudos earns more. Ephemeral, beside the
// message hugged, tried at most three times. Today's convex/slack/firstHugReply.ts; the welcome schedules it.
import { escaped } from "./blocks.ts";
import { attemptArgs, enqueueAt, sendAtMostOnce, tryAtMostThreeTimes } from "./delivery.ts";
import { howToOf } from "../welcome/mondayWelcome.ts";
import { z } from "zod";
import type { ActionContext } from "../operations.ts";
import { actionJob } from "../jobs/define.ts";

const huggedValidator = z.union([z.strictObject({ kind: z.literal("author"), name: z.optional(z.string()) }), z.strictObject({ kind: z.literal("peopleThanked") })]);

type Hugged = z.infer<typeof huggedValidator>;

export const deliverFirstHugReplyArgs = z.strictObject({ workspace: z.string(), user: z.string(), conversation: z.string(), hugged: huggedValidator, ...attemptArgs });
export async function deliverFirstHugReply(ctx: ActionContext, { attempt = 1, ...reply }: z.infer<typeof deliverFirstHugReplyArgs>): Promise<void> {
  await tryAtMostThreeTimes(
    ctx.clock,
    attempt,
    async (attempt) => {
      const { kudosEmoji } = await ctx.run.query("welcome.mondayWelcome.howToOf", (query) => howToOf(query, { workspace: reply.workspace }));
      return sendAtMostOnce(ctx, reply.workspace, "chat.postEphemeral", { channel: reply.conversation, user: reply.user, text: firstHugReplyText(reply.hugged, kudosEmoji) }, attempt);
    },
    (retry) => enqueueAt(ctx, deliverFirstHugReplyJob, { ...reply, attempt: retry.attempt }, retry.at),
  );
}
export const deliverFirstHugReplyJob = actionJob("slack.firstHugReply.deliverFirstHugReply", deliverFirstHugReplyArgs, deliverFirstHugReply);

function firstHugReplyText(hugged: Hugged, kudosEmoji: string) {
  return `That was a hug: +1 XP for you and ${huggedPeopleOf(hugged)}. Thank them in a message with :${kudosEmoji}: to earn an item.`;
}

function huggedPeopleOf(hugged: Hugged) {
  if (hugged.kind === "peopleThanked") return "the people thanked";
  return hugged.name === undefined ? "the author" : escaped(hugged.name);
}
