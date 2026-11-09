// Rows to documents and back. A document is what Convex held: fields as Convex values, a missing optional field
// absent rather than null. In a row, SQL NULL means missing, except in the few typed columns whose field is a
// required `T | null`, where it means null; `value` columns hold the codec's stored text, whose JSON `null` is null.
import { getTableColumns, getTableName, type Column } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { decodeStored, encodeStored, type Value } from "./codec.ts";

const nullValuedFields = new WeakMap<PgTable, ReadonlySet<string>>();

/** Declares the typed columns of a table whose SQL NULL is the value null, not a missing field. */
export function nullValued<T extends PgTable>(table: T, fields: ReadonlyArray<keyof T["_"]["columns"] & string>): T {
  nullValuedFields.set(table, new Set(fields));
  return table;
}

function isValueColumn(column: Column): boolean {
  return column.getSQLType() === "jsonb";
}

/** The document a selected row holds. Generated columns (nested index fields) are left out. */
export function toDocument<Doc>(table: PgTable, row: Record<string, unknown>): Doc {
  const nulls = nullValuedFields.get(table);
  const doc: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(getTableColumns(table))) {
    if (column.generated) continue;
    const stored = row[field];
    if (stored === undefined) throw new Error(`The row of ${getTableName(table)} has no ${field}; select every column`);
    if (stored === null) {
      if (nulls?.has(field)) doc[field] = null;
      continue;
    }
    doc[field] = isValueColumn(column) ? decodeStored(stored as string) : stored;
  }
  return doc as Doc;
}

/** The row that stores a document: every column set, a missing field as SQL NULL. */
export function fromDocument(table: PgTable, doc: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(table);
  for (const field of Object.keys(doc)) {
    if (!(field in columns) || columns[field]!.generated) throw new Error(`${getTableName(table)} has no field ${field}`);
  }
  const nulls = nullValuedFields.get(table);
  const row: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(columns)) {
    if (column.generated) continue;
    const value = doc[field];
    if (value === undefined) row[field] = null;
    else if (isValueColumn(column)) row[field] = encodeStored(value as Value);
    else if (value === null && !nulls?.has(field)) throw new Error(`${getTableName(table)}.${field} can't be null`);
    else row[field] = value;
  }
  return row;
}
