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

export { receive, receiveArgs, receiveChannelCreated, receiveChannelCreatedArgs, receiveChannelToCheck, receiveChannelToCheckArgs, receiveDmLinkClick, receiveDmLinkClickArgs, receiveDmLinkClickJob, receiveEmojiChanged, receiveEmojiChangedArgs, receiveHomeClick, receiveHomeClickArgs, receiveHomeClickJob, receiveHomeOpened, receiveHomeOpenedArgs, receiveLinkShared, receiveLinkSharedArgs, receiveMemberChanged, receiveMemberChangedArgs, receiveReaction, receiveReactionArgs, receiveUserGroupChanged, receiveUserGroupChangedArgs } from "./receipts.map.ts";
