// Slack's rate limits, as today's convex/slack/rateLimits.ts: when Slack answers a method with Retry-After, the
// workspace's calls to that method hold until then, across every delivery, while other methods go on.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { slackRateLimits } from "../db/schema/slack.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import { zv } from "../values.ts";

const methodArgs = { workspace: z.string(), method: z.string() };

export const heldUntilArgs = z.strictObject(methodArgs);
/** Until when the workspace's calls to the method hold; 0 when they don't. */
export async function heldUntil({ tx }: QueryContext, method: z.infer<typeof heldUntilArgs>): Promise<number> {
  return (await holdOf(tx, method))?.until ?? 0;
}

export const holdArgs = z.strictObject({ ...methodArgs, until: zv.number() });
/** Holds the workspace's calls to the method until `until`, or keeps a later hold. */
export async function hold({ tx, newRow }: MutationContext, { until, ...method }: z.infer<typeof holdArgs>): Promise<void> {
  const existing = await holdOf(tx, method);
  if (existing === null) await tx.insert(slackRateLimits).values({ ...newRow(), ...method, until });
  else if (existing.until < until) await tx.update(slackRateLimits).set({ until }).where(eq(slackRateLimits._id, existing._id));
}

// One row per workspace and method, as Convex's `unique()` asked: a second one is an error, not a choice.
async function holdOf(tx: Transaction, { workspace, method }: { workspace: string; method: string }) {
  const rows = await tx
    .select({ _id: slackRateLimits._id, until: slackRateLimits.until })
    .from(slackRateLimits)
    .where(and(eq(slackRateLimits.workspace, workspace), eq(slackRateLimits.method, method)))
    .limit(2);
  if (rows.length > 1) throw new Error(`More than one rate limit is held for ${method}`);
  return rows[0] ?? null;
}
