// Convex's index order on Postgres, for a query that walks an index as `.withIndex(...)` did, and pages through it.
// - Order: the index's fields, then `_creationTime`, then `_id`, each ascending with a missing field (SQL NULL) before
//   every value, as the migrations build the indexes; `desc`, Convex's `.order("desc")`, is the exact reverse.
// - `after`: the rows that follow a document in that order, for keyset paging. A plain row-value comparison,
//   `(a, b) > ($1, $2)`, yields NULL where a field is NULL and drops those rows, so this one is spelled out field by
//   field: equal on every earlier field and after on this one, where both "equal" and "after" know NULL.
import { and, eq, getTableColumns, gt, isNotNull, isNull, lt, or, sql, type Column, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export type Direction = "asc" | "desc";

export interface IndexOrder {
  /** The index's ORDER BY, `_creationTime` and `_id` last. */
  orderBy(direction?: Direction): SQL[];
  /** Holds for the rows after `document` in this order: a document as `toDocument` reads it, a missing field absent. */
  after(document: Readonly<Record<string, unknown>>, direction?: Direction): SQL;
}

/**
 * The index on `fields`, in order, of `table`; `_creationTime` and `_id` are appended, as Convex appends them. A nested
 * field's document value must be of its generated column's kind, as the schema's documents are: a value of another
 * kind reads as missing in the column but not in `after`.
 */
export function indexOrder<Table extends PgTable>(table: Table, fields: ReadonlyArray<keyof Table["_"]["columns"] & string>): IndexOrder {
  const all = getTableColumns(table);
  const keys: Key[] = [...fields, "_creationTime", "_id"].flatMap((field) => {
    const column = all[field];
    if (!column) throw new Error(`The table has no field ${field}`);
    // A nested field's generated column, `chatIdentity$workspace`, holds the document's `chatIdentity.workspace`.
    const path = field.split("$");
    const key: Key = { expression: column, valueOf: (document) => valueAt(document, path) };
    if (column.getSQLType() !== "double precision") return [key];
    // Postgres holds -0 equal to 0, where Convex orders -0 first: a second key tells them apart, false for -0.
    const zeroSign: Key = {
      expression: sql`(${column}::text <> '-0')`,
      valueOf: (document) => {
        const value = key.valueOf(document);
        return value === null ? null : !Object.is(value, -0);
      },
    };
    return [key, zeroSign];
  });

  return {
    orderBy: (direction = "asc") => keys.map(({ expression }) => (direction === "asc" ? sql`${expression} asc nulls first` : sql`${expression} desc nulls last`)),
    after(document, direction = "asc") {
      const values = keys.map((key) => key.valueOf(document));
      const terms = keys.map((key, i) => and(...keys.slice(0, i).map((earlier, j) => same(earlier.expression, values[j])), follows(key.expression, values[i], direction)));
      return or(...terms)!;
    },
  };
}

interface Key {
  expression: Column | SQL;
  /** The document's value for the key; null for a missing field. */
  valueOf(document: Readonly<Record<string, unknown>>): unknown;
}

function valueAt(document: Readonly<Record<string, unknown>>, path: readonly string[]): unknown {
  let value: unknown = document;
  for (const key of path) value = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
  return value ?? null;
}

// Drizzle's comparisons take a column, which encodes the value as the column does, or an expression, which binds it
// as it is; the zero-sign key is the one expression, and its values are booleans.
function same(expression: Column | SQL, value: unknown): SQL {
  return value === null ? isNull(expression) : eq(expression as Column, value);
}

// Ascending, NULL comes first: after NULL is any value, after a value only a greater one. Descending is the reverse:
// after a value comes a smaller one or NULL, and nothing comes after NULL.
function follows(expression: Column | SQL, value: unknown, direction: Direction): SQL {
  if (direction === "asc") return value === null ? isNotNull(expression) : gt(expression as Column, value);
  return value === null ? sql`false` : or(lt(expression as Column, value), isNull(expression))!;
}
