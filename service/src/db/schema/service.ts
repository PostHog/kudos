// The service's own tables, beside the ones generated from convex/schema.ts.
import { doublePrecision, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { bytes, creationTime, f64, id, str, value } from "../columns.ts";

/**
 * Rows of Convex tables the rewrite doesn't use, kept verbatim: Convex Auth's tables other than `users`, the
 * components' private tables and every exported `_scheduled_functions` row. `document` is the whole document in the
 * codec's stored encoding; nothing is dropped.
 */
export const archive = pgTable(
  "archive",
  {
    /** Where the row came from: `app`, or the component's name. */
    source: str().notNull(),
    table: str().notNull(),
    _id: str("_id").notNull(),
    _creationTime: doublePrecision("_creationTime").notNull(),
    document: value().notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.table, t._id] })],
);

/**
 * Stored files, such as card pictures: Convex's `_storage` document field by field, with its bytes.
 * `contentType` is optional in `_storage`, so NULL means it was missing.
 */
export const files = pgTable("files", {
  _id: id(),
  _creationTime: creationTime(),
  sha256: str().notNull(),
  size: f64().notNull(),
  contentType: str(),
  bytes: bytes().notNull(),
});
