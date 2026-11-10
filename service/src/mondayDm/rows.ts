// A member's Monday DM for a week, as today's convex/mondayDm/rows.ts, and the reads and writes of a DM's row that
// the Monday DM's mutations share. A whole document is written back, as Convex's patch kept every other field.
import { and, eq } from "drizzle-orm";
import type { Id } from "../db/columns.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import type { Doc } from "../db/schema/index.ts";
import { mondayDms } from "../db/schema/mondayDm.ts";
import type { DayKey } from "../engine/allowance.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";

export type MondayDmRow = Doc<"mondayDms">;

/** One DM per member and week, as Convex's `unique()` asked. */
export async function mondayDmOf(ctx: QueryContext, member: MemberId, monday: DayKey): Promise<MondayDmRow | null> {
  const rows = await ctx.tx.select().from(mondayDms).where(and(eq(mondayDms.member, member), eq(mondayDms.monday, monday))).limit(2);
  if (rows.length > 1) throw new Error(`More than one Monday DM is held for ${monday}`);
  return rows[0] ? toDocument<MondayDmRow>(mondayDms, rows[0]) : null;
}

export async function mondayDmRow(tx: Transaction, dm: Id<"mondayDms">): Promise<MondayDmRow | null> {
  const [row] = await tx.select().from(mondayDms).where(eq(mondayDms._id, dm));
  return row ? toDocument<MondayDmRow>(mondayDms, row) : null;
}

export async function insertMondayDm(ctx: MutationContext, dm: Omit<MondayDmRow, "_id" | "_creationTime">): Promise<Id<"mondayDms">> {
  const document = { ...ctx.newRow(), ...dm };
  await ctx.tx.insert(mondayDms).values(fromDocument(mondayDms, document) as typeof mondayDms.$inferInsert);
  return document._id as Id<"mondayDms">;
}

/** Changes the DM's fields, as `ctx.db.patch` did, and throws as it did when the DM is gone. */
export async function patchMondayDm(tx: Transaction, dm: Id<"mondayDms">, changes: Partial<Omit<MondayDmRow, "_id" | "_creationTime">>): Promise<void> {
  const row = await mondayDmRow(tx, dm);
  if (row === null) throw new Error(`Update on nonexistent document ID ${dm}`);
  await tx.update(mondayDms).set(fromDocument(mondayDms, { ...row, ...changes })).where(eq(mondayDms._id, dm));
}
