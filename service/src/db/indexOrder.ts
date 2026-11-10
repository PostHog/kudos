// Convex's index order on Postgres, for a query that walks an index as `.withIndex(...)` did, and pages through it.
// - Order: the index's fields, then `_creationTime`, then `_id`, each ascending with a missing field (SQL NULL) before
//   every value, as the migrations build the indexes; `desc`, Convex's `.order("desc")`, is the exact reverse. A key
//   that can't be NULL takes no nulls clause, so the ORDER BY is the index's own and Postgres walks it with no sort.
// - `after`: the rows that follow a document in that order, for keyset paging. A plain row-value comparison,
//   `(a, b) > ($1, $2)`, yields NULL where a field is NULL and drops those rows, so this one is spelled out field by
//   field: equal on every earlier field and after on this one, where both "equal" and "after" know NULL. A bound goes in
//   front, which those terms imply, so Postgres starts the walk at the cursor: a row comparison over the leading
//   columns that can't be NULL, `(a, b) >= ($1, $2)`, or, where the first one can, `a >= $1`.
// - Paging: only an index over strings, floats, booleans and int64 can be paged. Postgres orders jsonb by its own rules,
//   not Convex's, and a missing field (SQL NULL) and a JSON null would share one place; a cursor can't carry bytes as
//   the column compares them. Either way a walk could repeat or skip rows, so paging such an index throws.
import { and, Column, eq, getTableColumns, getTableName, gt, gte, is, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export type Direction = "asc" | "desc";

export interface IndexOrder {
  /** The table and the index's fields, `users(chatIdentity$workspace, chatIdentity$user)`. */
  readonly name: string;
  /** The index's ORDER BY, `_creationTime` and `_id` last. */
  orderBy(direction?: Direction): SQL[];
  /** Holds for the rows after `document` in this order: a document as `toDocument` reads it, a missing field absent. */
  after(document: Readonly<Record<string, unknown>>, direction?: Direction): SQL;
  /** The part of `document` its place in this order needs: the index's fields, `_creationTime` and `_id`. `after` takes it. */
  keyOf(document: Readonly<Record<string, unknown>>): Record<string, unknown>;
  /** Whether `place` is one `keyOf` could give: each key there, of its column's kind, null only where it may be missing. */
  isPlace(place: unknown): place is Record<string, unknown>;
  /** Throws when the index can't be paged, because a field of it is of a kind paging doesn't know; `after` and `keyOf` throw too. */
  refuseUnpageable(): void;
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
    const notNull = column.notNull || field === "_creationTime" || field === "_id";
    const key: Key = { expression: column, path, notNull, valueOf: (document) => valueAt(document, path), accepts: acceptsOf(column) };
    // Postgres holds -0 equal to 0, where Convex orders -0 first: a second key tells them apart, false for -0. No
    // `_creationTime` is -0, as Convex stamps none and neither the clock nor the load writes one (operations.ts,
    // load/loader.ts), so that key walks its index as it is.
    if (column.getSQLType() !== "double precision" || field === "_creationTime") return [key];
    const zeroSign: Key = {
      expression: sql`(${column}::text <> '-0')`,
      path,
      notNull,
      valueOf: (document) => {
        const value = key.valueOf(document);
        return value === null ? null : !Object.is(value, -0);
      },
      accepts: key.accepts,
    };
    return [key, zeroSign];
  });

  const name = `${getTableName(table)}(${fields.join(", ")})`;
  const unpageable = fields.map((field) => all[field]!).filter((column) => kindOf(column) === undefined);
  const refuseUnpageable = () => {
    if (unpageable.length > 0) throw new Error(`${name} can't be paged: ${unpageable.map((column) => `${column.name} is stored as ${column.getSQLType()}`).join(", ")}, which paging doesn't know`);
  };

  const order: IndexOrder = {
    name,
    refuseUnpageable,
    orderBy: (direction = "asc") =>
      keys.map(({ expression, notNull }) => {
        if (notNull) return direction === "asc" ? sql`${expression} asc` : sql`${expression} desc`;
        return direction === "asc" ? sql`${expression} asc nulls first` : sql`${expression} desc nulls last`;
      }),
    after(document, direction = "asc") {
      refuseUnpageable();
      const values = keys.map((key) => key.valueOf(document));
      // Where no key can be NULL and none is a -0 sign key, a row comparison over them all is "after" exactly.
      if (keys.every(isPlainColumn)) return rowAfter(keys, values, direction);
      const terms = keys.map((key, i) => and(...keys.slice(0, i).map((earlier, j) => same(earlier.expression, values[j])), follows(key.expression, values[i], direction)));
      return and(atOrAfter(keys, values, direction), or(...terms))!;
    },
    keyOf(document) {
      refuseUnpageable();
      const key: Record<string, unknown> = {};
      for (const { path } of keys) {
        let into = key;
        for (const step of path.slice(0, -1)) into = (into[step] ??= {}) as Record<string, unknown>;
        // A missing field and a null one hold the same place, as `after` reads them: both are kept as null.
        into[path.at(-1)!] = valueAt(document, path);
      }
      return key;
    },
    isPlace(place): place is Record<string, unknown> {
      if (typeof place !== "object" || place === null || Array.isArray(place) || place instanceof ArrayBuffer) return false;
      const document = place as Record<string, unknown>;
      // Nothing beyond the keys, and every key there: keyOf over the place gives the place back, key for key.
      if (!sameShape(order.keyOf(document), document)) return false;
      return keys.every(({ path, accepts }) => accepts(valueAt(document, path)));
    },
  };
  return order;
}

// A column's values: a value of its kind, or null where the field may be missing. `_creationTime` and `_id` never are.
function acceptsOf(column: Column): (value: unknown) => boolean {
  const kind = kindOf(column);
  return (value) => (value === null ? !column.notNull && column.name !== "_creationTime" && column.name !== "_id" : kind !== undefined && typeof value === kind);
}

// The kinds paging knows, by column type: Postgres orders each as Convex does, and a cursor carries each as it is.
const pagedKinds: Record<string, "string" | "number" | "boolean" | "bigint"> = { 'text COLLATE "C"': "string", "double precision": "number", boolean: "boolean", bigint: "bigint" };

function kindOf(column: Column): "string" | "number" | "boolean" | "bigint" | undefined {
  return pagedKinds[column.getSQLType()];
}

function sameShape(expected: unknown, actual: unknown): boolean {
  if (typeof expected !== "object" || expected === null) return typeof actual !== "object" || actual === null || actual instanceof ArrayBuffer;
  if (typeof actual !== "object" || actual === null || Array.isArray(actual)) return false;
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  return expectedKeys.length === actualKeys.length && expectedKeys.every((key) => key in actual && sameShape((expected as Record<string, unknown>)[key], (actual as Record<string, unknown>)[key]));
}

interface Key {
  expression: Column | SQL;
  /** Whether the key is never NULL: its ORDER BY takes no nulls clause, as its index column has none. */
  notNull: boolean;
  /** The field's path in a document: `["chatIdentity", "workspace"]` for the column `chatIdentity$workspace`. */
  path: readonly string[];
  /** The document's value for the key; null for a missing field. */
  valueOf(document: Readonly<Record<string, unknown>>): unknown;
  /** Whether a cursor's place may hold `value` for this key. */
  accepts(value: unknown): boolean;
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

// A key Postgres compares as the index holds it: a column that is never NULL.
function isPlainColumn(key: Key): boolean {
  return key.notNull && is(key.expression, Column);
}

// The rows after `values` on `keys`, all plain columns, as one row comparison: `(a, b) > ($1, $2)`, `<` descending. A
// row comparison on an index's leading columns is one range of it, which Postgres walks from the cursor.
function rowAfter(keys: readonly Key[], values: readonly unknown[], direction: Direction, orAt = false): SQL {
  const columns = keys.map((key) => key.expression as Column);
  const comparison = direction === "asc" ? (orAt ? sql`>=` : sql`>`) : orAt ? sql`<=` : sql`<`;
  return sql`(${sql.join(columns, sql`, `)}) ${comparison} (${sql.join(columns.map((column, i) => sql.param(values[i], column)), sql`, `)})`;
}

// A range of rows that holds every row after `values`, which Postgres can start an index walk from, where some key can
// be NULL or is a -0 sign key, which no index holds.
// - The plain columns before that key compare as a row, at or after: `(a, b) >= ($1, $2)`.
// - Where the first key can be NULL, it bounds alone: ascending, at or after a value, which leaves NULL out; descending,
//   from NULL only NULL. None where no range is: ascending from NULL, or descending from a value, where NULL follows.
function atOrAfter(keys: readonly Key[], values: readonly unknown[], direction: Direction): SQL | undefined {
  const length = keys.findIndex((key) => !isPlainColumn(key));
  if (length > 0) return rowAfter(keys.slice(0, length), values, direction, true);
  const [key, value] = [keys[0]!, values[0]];
  if (direction === "asc") return value === null ? undefined : gte(key.expression as Column, value);
  return value === null ? isNull(key.expression) : undefined;
}

// Ascending, NULL comes first: after NULL is any value, after a value only a greater one. Descending is the reverse:
// after a value comes a smaller one or NULL, and nothing comes after NULL.
function follows(expression: Column | SQL, value: unknown, direction: Direction): SQL {
  if (direction === "asc") return value === null ? isNotNull(expression) : gt(expression as Column, value);
  return value === null ? sql`false` : or(lt(expression as Column, value), isNull(expression))!;
}
