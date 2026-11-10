// One page of a paged read and where the next one starts: the shape the app's paging loops read, today from Convex's
// paginate. The cursor is the service's own keyset over the index (./indexOrder.ts), opaque to the caller: the index's
// name and the place of the page's last document in its order, in the value codec's stored form, so -0, NaN and int64
// keep their place. A cursor that isn't a place in this read's order is refused. It isn't signed: cursors travel only
// in the service's own job arguments, as Convex's did, and a forged place is still a place, so a walk from it stays in order.
import { and, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Transaction } from "../operations.ts";
import { decodeStored, encodeStored, type Value } from "./codec.ts";
import { toDocument } from "./documents.ts";
import type { Direction, IndexOrder } from "./indexOrder.ts";

export interface PageOptions {
  numItems: number;
  /** Null for the first page. */
  cursor: string | null;
}

export interface Page<T> {
  page: T[];
  isDone: boolean;
  continueCursor: string;
}

/** What `paginate` walks: the rows of `table` that `where` holds for, in `order`, as `.withIndex(...).order(...)` did. */
export interface PagedQuery {
  table: PgTable;
  order: IndexOrder;
  where?: SQL | undefined;
  direction?: Direction;
}

// The cursor of an empty first page: no place yet, so the next read starts at the beginning.
const atTheStart = "start";
const placed = "after:";

/**
 * Up to `numItems` documents after the cursor, as Convex's `.paginate` answered. The continue cursor is the place of
 * the page's last document, or the given cursor when the page is empty, so a cursor read again later finds only what
 * came after it. `isDone` holds when nothing follows the page.
 */
export async function paginate<Doc>(tx: Transaction, { table, order, where, direction = "asc" }: PagedQuery, { cursor, numItems }: PageOptions): Promise<Page<Doc>> {
  if (!Number.isInteger(numItems) || numItems < 1) throw new RangeError(`A page holds a whole number of documents from 1, not ${numItems}`);
  order.refuseUnpageable();
  const after = cursor === null || cursor === atTheStart ? undefined : order.after(placeOf(cursor, order), direction);
  const rows = await tx
    .select()
    .from(table)
    .where(and(where, after))
    .orderBy(...order.orderBy(direction))
    .limit(numItems + 1);
  const page = rows.slice(0, numItems).map((row) => toDocument<Doc>(table, row));
  const last = page.at(-1);
  const continueCursor = last === undefined ? (cursor ?? atTheStart) : placed + encodeStored({ index: order.name, place: order.keyOf(last as Record<string, unknown>) } as Value);
  return { page, isDone: rows.length <= numItems, continueCursor };
}

function placeOf(cursor: string, order: IndexOrder): Record<string, unknown> {
  const decoded = cursor.startsWith(placed) ? safely(() => decodeStored(cursor.slice(placed.length))) : undefined;
  const { index, place, ...rest } = typeof decoded === "object" && decoded !== null && !Array.isArray(decoded) && !(decoded instanceof ArrayBuffer) ? decoded : {};
  if (index !== order.name || Object.keys(rest).length > 0 || !order.isPlace(place)) throw new Error("The cursor isn't one this read gave");
  return place;
}

function safely<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}
