// The album's reads and writes of one document, as today's `.withIndex(...).unique()`, `.first()`, `insert` and
// `replace` did them: rows go through `toDocument`/`fromDocument`, so a missing field stays missing and a value keeps
// its kind, and a read walks the index in Convex's order (../db/indexOrder.ts).
import { eq, getTableName, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { fromDocument, toDocument } from "../db/documents.ts";
import type { IndexOrder } from "../db/indexOrder.ts";
import type { MutationContext, QueryContext } from "../operations.ts";

type Table = PgTable & { _id: PgColumn };

/**
 * The one document the index range holds, or `null`; two fail with Convex's own `.unique()` error, word for word.
 * S4's `db/unique.ts` (PostHog/kudos#922) replaces the check once it is on main.
 */
export async function uniqueIn<Doc>(ctx: QueryContext, table: Table, index: IndexOrder, where: SQL | undefined): Promise<Doc | null> {
  const rows = await ctx.tx.select().from(table).where(where).orderBy(...index.orderBy()).limit(2);
  if (rows.length > 1) throw new Error(`unique() query returned more than one result from table ${getTableName(table)}:`);
  return rows[0] ? toDocument<Doc>(table, rows[0]) : null;
}

/** The first document of the index range in Convex's order, or `null`, as `.first()` read it. */
export async function firstIn<Doc>(ctx: QueryContext, table: Table, index: IndexOrder, where: SQL | undefined): Promise<Doc | null> {
  const [row] = await ctx.tx.select().from(table).where(where).orderBy(...index.orderBy()).limit(1);
  return row ? toDocument<Doc>(table, row) : null;
}

/** Every document of the index range in Convex's order, as `.take(n)` or `.collect()` read them. */
export async function allIn<Doc>(ctx: QueryContext, table: Table, index: IndexOrder, where: SQL | undefined, atMost?: number): Promise<Doc[]> {
  const query = ctx.tx.select().from(table).where(where).orderBy(...index.orderBy());
  const rows = atMost === undefined ? await query : await query.limit(atMost);
  return rows.map((row) => toDocument<Doc>(table, row));
}

/** Inserts the document, stamped as the mutation stamps a new row, and answers its ID. */
export async function insertInto(ctx: MutationContext, table: Table, document: Record<string, unknown>): Promise<string> {
  const stamped = { ...ctx.newRow(), ...document };
  await ctx.tx.insert(table).values(fromDocument(table, stamped) as never);
  return stamped._id;
}

/** Replaces the document's fields with these, keeping its `_id` and `_creationTime`, as `replace` did. */
export async function replaceIn(ctx: MutationContext, table: Table, existing: { _id: string; _creationTime: number }, document: Record<string, unknown>): Promise<void> {
  const { _id, _creationTime, ...fields } = document;
  const row = fromDocument(table, { ...fields, _id: existing._id, _creationTime: existing._creationTime });
  await ctx.tx.update(table).set(row as never).where(eq(table._id, existing._id));
}
