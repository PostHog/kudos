// The load's own tables: its state (the hold), the staged snapshot and a checkpoint per archive entry.
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { bytes, value } from "../columns.ts";

/** One row, `key = 'load'`, once a load has started. Until its phase is `done`, the app holds. */
export const loadState = pgTable("loadState", {
  key: text().primaryKey(),
  phase: text().$type<LoadPhase>().notNull(),
  /** sha256 of the admin token that started the load; a finished load refuses it. */
  tokenHash: text().notNull(),
  /** The staged snapshot's chunk count and sha256 (hex), set when the load starts. */
  chunks: integer(),
  sha256: text(),
  /** Why the load stopped; a stopped load waits for `finish` again or a reset. */
  error: text(),
});

export type LoadPhase = "staging" | "loading" | "verifying" | "recovering" | "done";

/** The snapshot ZIP as uploaded, chunk by chunk. */
export const loadChunks = pgTable("loadChunks", {
  number: integer().primaryKey(),
  sha256: text().notNull(),
  bytes: bytes().notNull(),
});

/** How many lines of an archive entry are loaded; committed with each batch, so a restarted load resumes there. */
export const loadCheckpoints = pgTable("loadCheckpoints", {
  entry: text().primaryKey(),
  lines: integer().notNull(),
  done: boolean().notNull(),
  /** `-0` and `NaN` read in indexed number fields, as a stored-form array of `{ table, field, _id, value }`. */
  reports: value().notNull(),
});
