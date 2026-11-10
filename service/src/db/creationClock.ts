// The creation clock (schema/service.ts, migration 0005): the highest `_creationTime` any writer has used, which every
// runner's new rows stamp after, so "the latest" by `_creationTime` is the row written last whichever runner wrote it.
// It holds a float64 as an int64 that orders the same way: a non-negative one's bits as they are, a negative one's
// with all but the sign bit flipped. Exact, so no stamp rounds below the one it keys.
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type pg from "pg";
import * as schema from "./schema/index.ts";

/** The clock as one column, `clock`: its key, or NULL while nothing has moved it. */
export const readCreationClock = `select case when is_called then last_value end as clock from "creationClock"`;

/** The stamp a `readCreationClock` row holds: every stamp a runner takes comes after it. */
export function creationClockFloor(result: pg.QueryResult): number {
  const key = (result.rows[0] as { clock: string | null } | undefined)?.clock;
  if (key === null || key === undefined) return Number.NEGATIVE_INFINITY;
  const bits = BigInt(key);
  const view = new DataView(new ArrayBuffer(8));
  view.setBigInt64(0, bits < 0n ? bits ^ 0x7fff_ffff_ffff_ffffn : bits);
  return view.getFloat64(0);
}

/** The statement that moves the clock to `stamp`, unless it is there or past; its key is an integer, safe inline. */
export function advanceCreationClock(stamp: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, stamp);
  const bits = view.getBigInt64(0);
  return `select "advanceCreationClock"('${bits < 0n ? bits ^ 0x7fff_ffff_ffff_ffffn : bits}'::bigint)`;
}

// Every table with a `_creationTime`: the data model's, `archive` and `files`.
const stampedTables = (Object.values(schema) as unknown[]).filter(
  (table): table is PgTable => is(table, PgTable) && "_creationTime" in getTableColumns(table),
);

/**
 * Moves the clock past every row in the database: rows a load wrote with Convex's own stamps never moved it, and a
 * runner whose clock is behind the newest of them would otherwise stamp new rows before old ones. One read of every
 * table, for the end of a load; run it outside a transaction, as the load runs its batches.
 */
export async function advanceCreationClockPastRows(client: Pick<pg.ClientBase, "query">): Promise<void> {
  const highest = stampedTables.map((table) => `select max("_creationTime") as stamp from "${getTableName(table)}"`).join(" union all ");
  const { rows } = await client.query<{ stamp: number | null }>(`select max(stamp) as stamp from (${highest}) as tables`);
  const stamp = rows[0]?.stamp;
  if (stamp !== null && stamp !== undefined) await client.query(advanceCreationClock(stamp));
}
