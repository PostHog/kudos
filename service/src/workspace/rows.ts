// The workspace domain's row helpers over the service's transaction: Convex's `.unique()` on an index, an insert stamped
// by the operation, and a patch where a field set to `undefined` is cleared, as Convex's `patch` clears it.
import { eq, getTableName, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { fromDocument, toDocument } from "../db/documents.ts";
import { encodeStored, type Value } from "../db/codec.ts";
import type { IndexOrder } from "../db/indexOrder.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

type Keyed = PgTable & { _id: Parameters<typeof eq>[0] };

/** The one row `where` selects, in `order`, or `null`; a second row fails, as `.unique()` did. */
export async function uniqueRow<Doc>(ctx: QueryContext, table: Keyed, where: SQL | undefined, order: IndexOrder): Promise<Doc | null> {
  const rows = await ctx.tx
    .select()
    .from(table as PgTable)
    .where(where)
    .orderBy(...order.orderBy())
    .limit(2);
  if (rows.length > 1) throw new Error(`More than one ${getTableName(table)} row where one was expected`);
  return rows[0] ? toDocument<Doc>(table, rows[0]) : null;
}

/** The document `id` names in `table`, or `null`, as `ctx.db.get` read it. */
export async function rowById<Doc>(ctx: QueryContext, table: Keyed, id: string): Promise<Doc | null> {
  const [row] = await ctx.tx
    .select()
    .from(table as PgTable)
    .where(eq(table._id, id));
  return row ? toDocument<Doc>(table, row) : null;
}

/** Inserts a document with a new `_id` and `_creationTime` from the operation. */
export async function insertRow(ctx: MutationContext, table: PgTable, document: Record<string, unknown>): Promise<void> {
  await ctx.tx.insert(table).values(fromDocument(table, { ...ctx.newRow(), ...document }) as never);
}

/** Sets the fields `patch` names on the row `id`; a field given as `undefined` becomes missing (SQL NULL). */
export async function patchRow(ctx: MutationContext, table: Keyed, id: string, patch: Record<string, unknown>): Promise<void> {
  const set = Object.fromEntries(Object.entries(patch).map(([field, value]) => [field, storedOf(table, field, value)]));
  if (Object.keys(set).length === 0) return;
  await ctx.tx
    .update(table as PgTable)
    .set(set)
    .where(eq(table._id, id));
}

function storedOf(table: PgTable, field: string, value: unknown): unknown {
  const column = (table as unknown as Record<string, { getSQLType(): string } | undefined>)[field];
  if (column === undefined || field === "_id" || field === "_creationTime") throw new Error(`${getTableName(table)} has no field ${field} to patch`);
  if (value === undefined) return null;
  return column.getSQLType() === "jsonb" ? encodeStored(value as Value) : value;
}
