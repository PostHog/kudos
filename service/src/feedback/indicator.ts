// The indicator, as today's convex/feedback/indicator.ts: the one reaction the app wants on a kudos message, with a
// version that moves on every change, so a delivery that raced a newer change runs again.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { indicators } from "../db/schema/feedback.ts";
import { messageRefValidator, type MessageRef } from "../engine/messageEvent.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import { deliverIndicatorJob } from "../slack/delivery.ts";

export type Indicator = { emoji: string } | null;
export type DesiredIndicator = { indicator: Indicator; version: number };

export async function setIndicator(ctx: MutationContext, ref: MessageRef, indicator: Indicator): Promise<void> {
  const { tx, newRow, jobs } = ctx;
  const emoji = indicator?.emoji ?? null;
  const existing = await indicatorRow(tx, ref);
  if (existing === null) await tx.insert(indicators).values({ ...newRow(), ...messageOf(ref), emoji, version: 1 });
  else await tx.update(indicators).set({ emoji, version: existing.version + 1 }).where(eq(indicators._id, existing._id));
  await jobs.enqueue(deliverIndicatorJob, messageOf(ref));
}

export async function clearIndicator(ctx: MutationContext, ref: MessageRef): Promise<void> {
  if ((await indicatorRow(ctx.tx, ref))?.emoji) await setIndicator(ctx, ref, null);
}

export const desiredArgs = messageRefValidator;
export async function desired({ tx }: QueryContext, ref: z.infer<typeof desiredArgs>): Promise<DesiredIndicator> {
  const row = await indicatorRow(tx, ref);
  return { indicator: row?.emoji ? { emoji: row.emoji } : null, version: row?.version ?? 0 };
}

// Only the reference's own fields: a caller may hand over a wider object, as a Convex document was.
function messageOf({ workspace, conversation, message }: MessageRef): MessageRef {
  return { workspace, conversation, message };
}

// One row per message, as Convex's `unique()` asked: a second one is an error, not a choice.
async function indicatorRow(tx: Transaction, { workspace, conversation, message }: MessageRef) {
  const rows = await tx
    .select({ _id: indicators._id, emoji: indicators.emoji, version: indicators.version })
    .from(indicators)
    .where(and(eq(indicators.workspace, workspace), eq(indicators.conversation, conversation), eq(indicators.message, message)))
    .limit(2);
  if (rows.length > 1) throw new Error("More than one indicator is stored for a message");
  return rows[0] ?? null;
}
