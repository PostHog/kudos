// The primary group history: which group each member counted for from which instant. Only ever inserted.
// Today's convex/groups/history.ts over the service's transaction.
import { and, eq, lte } from "drizzle-orm";
import type { PrimaryGroupChangedEvent } from "../bus/events.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { primaryGroupHistory, type Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { PrimaryGroupCause } from "./cause.ts";
import type { GroupId } from "./groups.ts";
import { insertDocument, uniqueOf } from "./rows.ts";

const historyByMemberAt = indexOrder(primaryGroupHistory, ["member", "at"]);

/** The entry in force at the instant: the last one at or before it, in index order, as `.order("desc").first()` read it. */
export async function primaryGroupAt(ctx: QueryContext, member: MemberId, at: number): Promise<GroupId | null> {
  const rows = await ctx.tx
    .select()
    .from(primaryGroupHistory)
    .where(and(eq(primaryGroupHistory.member, member), lte(primaryGroupHistory.at, at)))
    .orderBy(...historyByMemberAt.orderBy("desc"))
    .limit(1);
  return uniqueOf<Doc<"primaryGroupHistory">>(primaryGroupHistory, rows)?.group ?? null;
}

export async function latestEntryOf(ctx: QueryContext, member: MemberId): Promise<null | Doc<"primaryGroupHistory">> {
  const rows = await ctx.tx.select().from(primaryGroupHistory).where(eq(primaryGroupHistory.member, member)).orderBy(...historyByMemberAt.orderBy("desc")).limit(1);
  return uniqueOf(primaryGroupHistory, rows);
}

/**
 * Records the change no earlier than the member's latest entry, so the history stays in order, and publishes it. An
 * entry dated in the latest's millisecond is stamped after it too: `newRow` orders stamps only within one process, and
 * another runner's clock, as in a deploy's overlap, may stand behind. The mutation's read of the latest entry makes a
 * concurrent change to the same member conflict and run again, so the latest it reads is the latest there is.
 */
export async function recordChange(ctx: MutationContext, person: Doc<"members">, from: GroupId | null, to: GroupId | null, cause: PrimaryGroupCause, recordedAt: number): Promise<void> {
  const latest = await latestEntryOf(ctx, person._id);
  const at = Math.max(recordedAt, latest?.at ?? recordedAt);
  const row = ctx.newRow();
  const _creationTime = latest === null ? row._creationTime : Math.max(row._creationTime, nextAfter(latest._creationTime));
  const change = { workspace: person.workspace, member: person._id, from, cause, at };
  await insertDocument(ctx.tx, primaryGroupHistory, { ...row, _creationTime, ...change, group: to });
  const event: PrimaryGroupChangedEvent = { type: "primaryGroupChanged", ...change, to };
  await ctx.publish(event);
}

/** The next float64 above `value`, the step `newRow` takes between stamps. */
function nextAfter(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  view.setBigUint64(0, value >= 0 ? bits + 1n : bits - 1n);
  return value === 0 ? Number.MIN_VALUE : view.getFloat64(0);
}
