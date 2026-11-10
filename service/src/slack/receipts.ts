// Slack's receipts, as today's convex/slack/receipts.ts: one row per event the app took in, so a redelivery of the
// same event does nothing. Slack redelivers within minutes; a receipt is kept a week, and a daily cron drops older ones.
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { slackReceipts } from "../db/schema/slack.ts";
import { mutationJob, type MutationJob } from "../jobs/define.ts";
import type { MutationContext, Transaction } from "../operations.ts";

export type Receipt = { workspace: string; eventId: string };

const keptForMs = 7 * 24 * 60 * 60 * 1000;
const deletionBatchSize = 500;
const noArgs = z.object({});

export async function isRedelivered(tx: Transaction, { workspace, eventId }: Receipt): Promise<boolean> {
  const [existing] = await tx
    .select({ _id: slackReceipts._id })
    .from(slackReceipts)
    .where(and(eq(slackReceipts.workspace, workspace), eq(slackReceipts.eventId, eventId)))
    .limit(1);
  return existing !== undefined;
}

export async function recordReceipt({ tx, newRow }: MutationContext, receipt: Receipt): Promise<void> {
  await tx.insert(slackReceipts).values({ ...newRow(), ...receipt });
}

/** The cron `slack.receipts.deleteExpired`: drops a batch of receipts past a week, and runs again while more are left. */
export const deleteExpiredReceipts: MutationJob<z.output<typeof noArgs>, z.input<typeof noArgs>> = mutationJob("slack.receipts.deleteExpired", noArgs, async (ctx) => {
  const { tx, now, jobs } = ctx;
  const expired = tx
    .select({ _id: slackReceipts._id })
    .from(slackReceipts)
    .where(lt(slackReceipts._creationTime, now - keptForMs))
    .orderBy(asc(slackReceipts._creationTime))
    .limit(deletionBatchSize);
  const deleted = await tx.delete(slackReceipts).where(inArray(slackReceipts._id, expired)).returning({ _id: slackReceipts._id });
  if (deleted.length === deletionBatchSize) await jobs.enqueue(deleteExpiredReceipts, {});
});

// The module map's stubs of the rest of convex/slack/receipts.ts, written by tools/rewrite/moduleMap/skeleton.ts: what S1 left of it
// throws notPorted until the stack that owns it ports it. Above this line is S1's own.
import { dmLinkValidator } from "../analytics/isolatedUsage.ts";
import { commandValidator } from "../commands/commands.ts";
import { messageDeletedValidator, messageEventValidator } from "../engine/messageEvent.ts";
import { directoryEntryValidator } from "../workspace/directory.ts";
import { howToAskedValidator } from "./welcome.ts";
import { hugReactionValidator } from "../hugs/reaction.ts";
import { linkSharingValidator } from "./linkPreviews.ts";
import { zv } from "../values.ts";
import { notPorted } from "../notPorted.ts";

const receivedEventArgs = { workspace: z.string(), eventId: z.string(), event: z.union([messageEventValidator, messageDeletedValidator, z.null()]) };

export const receiveArgs = z.strictObject(receivedEventArgs);
export async function receive(ctx: MutationContext, args: z.infer<typeof receiveArgs>): Promise<void> {
  throw notPorted("slack.receipts.receive");
}

export const receiveReactionArgs = z.strictObject({ eventId: z.string(), reaction: hugReactionValidator });
export async function receiveReaction(ctx: MutationContext, args: z.infer<typeof receiveReactionArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveReaction");
}

export const receiveHomeOpenedArgs = z.strictObject({ workspace: z.string(), eventId: z.string(), user: z.string(), at: zv.number() });
export async function receiveHomeOpened(ctx: MutationContext, args: z.infer<typeof receiveHomeOpenedArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveHomeOpened");
}

export const receiveHomeClickArgs = z.strictObject({
    workspace: z.string(),
    eventId: z.string(),
    user: z.string(),
    commands: z.array(commandValidator),
    conversation: z.optional(z.string()),
    message: z.optional(z.string()),
    ephemeral: z.optional(z.strictObject({ threadRoot: z.optional(z.string()) })),
  });
export async function receiveHomeClick(ctx: MutationContext, args: z.infer<typeof receiveHomeClickArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveHomeClick");
}
export const receiveHomeClickJob = mutationJob("slack.receipts.receiveHomeClick", receiveHomeClickArgs, receiveHomeClick);

export const receiveDmLinkClickArgs = z.strictObject({ workspace: z.string(), eventId: z.string(), user: z.string(), link: dmLinkValidator, howTo: z.optional(howToAskedValidator) });
export async function receiveDmLinkClick(ctx: MutationContext, args: z.infer<typeof receiveDmLinkClickArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveDmLinkClick");
}
export const receiveDmLinkClickJob = mutationJob("slack.receipts.receiveDmLinkClick", receiveDmLinkClickArgs, receiveDmLinkClick);

export const receiveMemberChangedArgs = z.strictObject({ workspace: z.string(), eventId: z.string(), user: z.string(), entry: directoryEntryValidator, asOf: zv.number() });
export async function receiveMemberChanged(ctx: MutationContext, args: z.infer<typeof receiveMemberChangedArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveMemberChanged");
}

export const receiveUserGroupChangedArgs = z.strictObject({ workspace: z.string(), eventId: z.string(), group: z.string() });
export async function receiveUserGroupChanged(ctx: MutationContext, args: z.infer<typeof receiveUserGroupChangedArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveUserGroupChanged");
}

export const receiveChannelCreatedArgs = z.strictObject({ workspace: z.string(), eventId: z.string(), channel: z.string() });
export async function receiveChannelCreated(ctx: MutationContext, args: z.infer<typeof receiveChannelCreatedArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveChannelCreated");
}

export const receiveChannelToCheckArgs = z.strictObject({ workspace: z.string(), eventId: z.string(), channel: z.string() });
export async function receiveChannelToCheck(ctx: MutationContext, args: z.infer<typeof receiveChannelToCheckArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveChannelToCheck");
}

export const receiveEmojiChangedArgs = z.strictObject({ workspace: z.string(), eventId: z.string() });
export async function receiveEmojiChanged(ctx: MutationContext, args: z.infer<typeof receiveEmojiChangedArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveEmojiChanged");
}

export const receiveLinkSharedArgs = z.strictObject({ eventId: z.string(), ...linkSharingValidator });
export async function receiveLinkShared(ctx: MutationContext, args: z.infer<typeof receiveLinkSharedArgs>): Promise<void> {
  throw notPorted("slack.receipts.receiveLinkShared");
}
