// The column kinds of the data model, one per Convex scalar kind, by the spec's column rule:
// a field of one scalar kind gets a typed column, every other field a `value` column (jsonb in the stored encoding).
import { bigint, boolean, customType, doublePrecision } from "drizzle-orm/pg-core";

/** A Convex document ID. New rows get a UUID; loaded rows keep their Convex ID verbatim. */
export type Id<Table extends string> = string & { readonly __table?: Table };

/** A string or an ID, compared byte-wise as Convex compares strings. */
export const str = customType<{ data: string; driverData: string }>({
  dataType: () => 'text COLLATE "C"',
});

/** A float64. Postgres keeps NaN, ±Infinity and -0 in `double precision`. */
export const f64 = (name?: string) => (name ? doublePrecision(name) : doublePrecision());

/** An int64, read back as a `bigint`. */
export const i64 = (name?: string) => (name ? bigint(name, { mode: "bigint" }) : bigint({ mode: "bigint" }));

export const bool = (name?: string) => (name ? boolean(name) : boolean());

/**
 * Any other field: an object, an array, a union across kinds, or a field that may be both missing and null.
 * The column holds the codec's stored text; `toDocument` and `fromDocument` decode and encode it, so a value is
 * never parsed by the driver's `JSON.parse` nor written by Drizzle's `JSON.stringify`.
 */
export const value = customType<{ data: string; driverData: string }>({
  dataType: () => "jsonb",
});

/** Raw bytes, for stored files. */
export const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** `_id`: the document's ID, the primary key. */
export const id = () => str("_id").primaryKey();

/** `_creationTime`: Convex's milliseconds, verbatim for loaded rows. */
export const creationTime = () => doublePrecision("_creationTime").notNull();
