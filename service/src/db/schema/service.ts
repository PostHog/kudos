// The service's own tables, beside the ones generated from convex/schema.ts.
import { doublePrecision, index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { bytes, creationTime, f64, id, str, value } from "../columns.ts";

/**
 * Rows of Convex tables the rewrite doesn't use, kept verbatim: Convex Auth's tables other than `users`, the
 * components' private tables and every exported `_scheduled_functions` row. `document` is the whole document in the
 * codec's stored encoding; nothing is dropped.
 */
export const archive = pgTable(
  "archive",
  {
    /** Where the row came from: `app`, or the component's path in the export, such as `_components/posthog`. */
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

/**
 * Every job, pending or done: the one job history, which the failed-job sweep and the bus's replay read. `args` is in
 * the codec's stored encoding; `deadline` is set on an action job when it starts running.
 */
export const jobs = pgTable(
  "jobs",
  {
    _id: id(),
    _creationTime: creationTime(),
    /** The handler's name: the former Convex function's path, dotted. */
    name: str().notNull(),
    args: value().notNull(),
    runAt: f64().notNull(),
    kind: str().$type<"mutation" | "action">().notNull(),
    state: str().$type<"pending" | "running" | "success" | "failed" | "canceled">().notNull(),
    error: str(),
    completedAt: f64(),
    deadline: f64(),
  },
  (t) => [index("jobs_by_state_and_runAt").on(t.state, t.runAt, t._creationTime, t._id)],
);

/** Each cron's next run; the copy that moves it forward fires the cron. */
export const crons = pgTable("crons", {
  id: str().primaryKey(),
  nextRun: f64().notNull(),
});
