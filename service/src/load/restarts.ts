// Cursor workflows, restarted: a Convex `paginate` cursor means nothing to the service's own paging (../db/page.ts), so
// recovery starts every workflow that carries one over from its start. Each one is safe to run again from the start:
// a marker or key it checks keeps every page it already did from doing its work twice (michaelr-context#128 holds the
// survey, guard by guard). What carries a Slack cursor, an ID or creation time, or an offset keeps it: those survive
// the move unchanged.
//
// A job's cursor lives in its args, and the original stays in the archive's `_scheduled_functions` row. A table's
// lives in a row, and recovery keeps that row verbatim in the archive, under the source `recovery`, before it resets it.
import { eq, getTableName, isNotNull, and, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Value } from "../db/codec.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { albumHistory, archive, bookReplayCursors, bookReplays, effectsBackfill, stickerBackfills } from "../db/schema/index.ts";

type Args = { [field: string]: Value };

/** Restarted from the start: the cursor left out of the args. */
const omit = (args: Args): Args => {
  const { cursor: _, ...rest } = args;
  return rest;
};
/** Restarted from the start: the cursor null, as its args take it. */
const nulled = (args: Args): Args => ("cursor" in args ? { ...args, cursor: null } : args);

/** Each job whose args carry a Convex paginate cursor, and its args restarted. */
export const argRestarts: ReadonlyMap<string, (args: Args) => Args> = new Map([
  ["unlocks.sweep.sweep", omit],
  ["quests.newWeek.sweep", omit],
  ["quests.journey.recheckSomeoneNew", omit],
  // Without a cursor the sweep first fails Monday DMs stuck past their try, as each Monday's run does.
  ["mondayDm.mondayDm.ensureMondayDms", omit],
  ["mondayDm.hugWeeks.ensureMondayDmsOfHugWeeks", omit],
  ["feedback.homes.republishAdminsIn", omit],
  ["feedback.welcomeNudge.nudgeTheHugged", omit],
  ["hugs.people.payHugPeople", omit],
  ["analytics.person.catchUp", omit],
  // Its queue of messages already read stays, and is drained before the listing starts over.
  ["slack.backfill.backfillWords", omit],
  ["feedback.tierNotices.tellBatchSummaries", nulled],
  ["engine.kudosText.forgetWorkspaceWords", nulled],
  ["album.milestones.recordMilestonesInWorkspace", nulled],
  // The cursor sits in the step; its member and kind, an ID and a kind, stay.
  ["album.items.fill.fillItems", (args) => (args.step && typeof args.step === "object" && !Array.isArray(args.step) && !(args.step instanceof ArrayBuffer) ? { ...args, step: omit(args.step as Args) } : args)],
]);

/** A scheduled job's args with any Convex cursor restarted. */
export function restartArgs(name: string, args: Args): Args {
  return argRestarts.get(name)?.(args) ?? args;
}

/**
 * Each table that keeps a workflow's Convex cursor in a row: an unfinished run's cursor is reset, and everything else
 * on the row stays (a run's cutoff, its phase, its inner `_id` bookmark). A book replay's cursor row can't be null, and
 * no row means the start, so an unfinished replay's row goes, kept in the archive like every reset row.
 */
export async function restartTables(db: NodePgDatabase): Promise<number> {
  let reset = 0;
  for (const [table, cursor, unfinished] of [
    [effectsBackfill, effectsBackfill.cursor, eq(effectsBackfill.isDone, false)],
    [stickerBackfills, stickerBackfills.cursor, eq(stickerBackfills.isDone, false)],
    [albumHistory, albumHistory.cursor, eq(albumHistory.done, false)],
  ] as const) {
    // A page at a time, each written in a few statements: a reset row leaves the page's condition, so the next read
    // finds the rest.
    for (;;) {
      const rows = await db.select().from(table).where(and(unfinished, isNotNull(cursor))).orderBy(idOf(table)).limit(pageRows);
      if (rows.length === 0) break;
      await keep(db, table, rows);
      await db.update(table).set({ cursor: null }).where(inArray(idOf(table), rows.map((row) => row._id)));
      reset += rows.length;
    }
  }
  const replays = db.select({ _id: bookReplays._id }).from(bookReplays).where(eq(bookReplays.isDone, false));
  for (;;) {
    const cursors = await db.select().from(bookReplayCursors).where(inArray(bookReplayCursors.replay, replays)).orderBy(bookReplayCursors._id).limit(pageRows);
    if (cursors.length === 0) break;
    await keep(db, bookReplayCursors, cursors);
    await db.delete(bookReplayCursors).where(inArray(bookReplayCursors._id, cursors.map((row) => row._id)));
    reset += cursors.length;
  }
  return reset;
}

/** Rows a page: well inside Postgres's 65,535 parameters a statement, five archive columns a row. */
const pageRows = 1_000;

const idOf = (table: PgTable) => (table as unknown as { _id: PgColumn })._id;

/** Rows as they were loaded, verbatim in the archive under the source `recovery`, before recovery changes them. */
async function keep(db: NodePgDatabase, table: PgTable, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const name = getTableName(table);
  await db.insert(archive).values(
    rows.map((row) => {
      const document = toDocument<Args>(table, row);
      return fromDocument(archive, { source: "recovery", table: name, _id: document._id, _creationTime: document._creationTime, document }) as typeof archive.$inferInsert;
    }),
  );
}
