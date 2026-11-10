// A `for await` over a Convex query streamed its rows: the service reads the same index order a page at a time, keyed
// on the last row read (./indexOrder.ts), so a caller that stops early reads no further page, and one that reads on
// sees each row once.
import { and } from "drizzle-orm";
import type { Transaction } from "../operations.ts";
import { toDocument } from "./documents.ts";
import type { PagedQuery } from "./page.ts";

/** How many rows a streamed read takes at once. */
export const streamPage = 100;

/** The rows of `table` that `where` holds for, in `order`, as documents, as a `for await` over `.withIndex(...)` streamed them. */
export async function* streamed<Doc>(tx: Transaction, { table, order, where, direction = "asc" }: PagedQuery, pageSize = streamPage): AsyncGenerator<Doc> {
  order.refuseUnpageable();
  let last: Record<string, unknown> | undefined;
  for (;;) {
    const rows = await tx
      .select()
      .from(table)
      .where(and(where, last === undefined ? undefined : order.after(last, direction)))
      .orderBy(...order.orderBy(direction))
      .limit(pageSize);
    const page = rows.map((row) => toDocument<Doc>(table, row));
    yield* page;
    if (rows.length < pageSize) return;
    last = page.at(-1) as Record<string, unknown>;
  }
}
