// The service's own tables, beside the ones generated from convex/schema.ts.
import { doublePrecision, index, jsonb, pgSequence, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import type { FlagDefinitions } from "../../analytics/evaluator/types.ts";
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

/**
 * The latest valid flag definitions PostHog returned: one row, `key = 'posthog'`, and when PostHog returned them. S1's
 * own, never generated from convex/schema.ts: today's is the PostHog component's private table, which the load seeds
 * it from (S18). Only the refresh replaces it, and only when the definitions changed.
 */
export const flagDefinitions = pgTable("flagDefinitions", {
  key: text().primaryKey(),
  definitions: jsonb().$type<FlagDefinitions>().notNull(),
  fetchedAt: doublePrecision().notNull(),
});

/**
 * When the refresh last had a good answer, `key = 'posthog'`, changed or not: how stale the definitions are. A row of its
 * own, so the refresh writes it every minute while a decision, which reads only `flagDefinitions`, never conflicts.
 */
export const flagRefreshes = pgTable("flagRefreshes", {
  key: text().primaryKey(),
  refreshedAt: doublePrecision().notNull(),
});

/**
 * The creation order every runner shares: the highest `_creationTime` a mutation has stamped, as the order-keeping
 * int64 key of its float64 (db/creationClock.ts). A sequence, so moving it forward neither waits for nor conflicts with any
 * transaction; `"advanceCreationClock"` (migration 0006) moves it, and only forward. Unset until the first stamp.
 */
export const creationClock = pgSequence("creationClock", { minValue: "-9223372036854775808", startWith: "0" });
