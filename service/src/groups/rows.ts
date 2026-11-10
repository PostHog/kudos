// What the groups domain and the user group copy need of a table that Convex's `ctx.db` gave them: rows read back as
// documents, `.unique()`'s one-or-none, and `ctx.db.patch`.
import { eq, getTableColumns, getTableName, type Column } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { fromDocument, toDocument } from "../db/documents.ts";
import type { Transaction } from "../operations.ts";

/** The selected rows as documents, in the order they came. */
export function documentsOf<Doc>(table: PgTable, rows: Record<string, unknown>[]): Doc[] {
  return rows.map((row) => toDocument<Doc>(table, row));
}

/** The one document of the rows, or `null`; two are an error, as `.unique()` held. Select with a limit of 2. */
export function uniqueOf<Doc>(table: PgTable, rows: Record<string, unknown>[]): Doc | null {
  if (rows.length > 1) throw new Error(`More than one ${getTableName(table)} row matched a read for one`);
  return rows[0] === undefined ? null : toDocument<Doc>(table, rows[0]);
}

/** Sets the fields the patch names, removes those it sets to `undefined`, and keeps the rest, as `ctx.db.patch` did. */
export async function patchDocument<Doc extends { _id: string }>(tx: Transaction, table: PgTable, document: Doc, patch: Partial<Doc>): Promise<void> {
  const patched: Record<string, unknown> = { ...document, ...patch };
  for (const field of Object.keys(patched)) if (patched[field] === undefined) delete patched[field];
  const id = getTableColumns(table)._id as Column;
  await tx.update(table).set(fromDocument(table, patched)).where(eq(id, document._id));
}

/** Inserts a new document. */
export async function insertDocument(tx: Transaction, table: PgTable, document: Record<string, unknown>): Promise<void> {
  await tx.insert(table).values(fromDocument(table, document));
}
