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

/** The index on `fields`, in order, of `table`; `_creationTime` and `_id` are appended, as Convex appends them. */
export function indexOrder<Table extends PgTable>(table: Table, fields: ReadonlyArray<keyof Table["_"]["columns"] & string>): IndexOrder {
  const all = getTableColumns(table);
  const keys = [...fields, "_creationTime", "_id"];
  const columns: Column[] = keys.map((key) => {
    const column = all[key];
    if (!column) throw new Error(`The table has no field ${key}`);
    return column;
  });

  return {
    orderBy: (direction = "asc") => columns.map((column) => (direction === "asc" ? sql`${column} asc nulls first` : sql`${column} desc nulls last`)),
    after(document, direction = "asc") {
      const values = keys.map((key) => document[key] ?? null);
      const terms = columns.map((column, i) => and(...columns.slice(0, i).map((earlier, j) => same(earlier, values[j])), follows(column, values[i], direction)));
      return or(...terms)!;
    },
  };
}

function same(column: Column, value: unknown): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

// Ascending, NULL comes first: after NULL is any value, after a value only a greater one. Descending is the reverse:
// after a value comes a smaller one or NULL, and nothing comes after NULL.
function follows(column: Column, value: unknown, direction: Direction): SQL {
  if (direction === "asc") return value === null ? isNotNull(column) : gt(column, value);
  return value === null ? sql`false` : or(lt(column, value), isNull(column))!;
}
