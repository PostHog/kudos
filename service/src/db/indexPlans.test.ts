// A paged read walks its index: Postgres reads the page in the index's order and starts at the cursor, with no sort.
// The plans are read on enough rows, analyzed, that the planner chooses as it would on a real table: each member has
// many pages of rows, so a sort of all of them would cost more than walking the index.
import { eq, is } from "drizzle-orm";
import { getTableConfig, IndexedColumn, PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { beforeEach, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { indexOrder } from "./indexOrder.ts";
import { paginate, type PagedQuery } from "./page.ts";
import * as schema from "./schema/index.ts";
import { analyticsIds } from "./schema/index.ts";

const database = useTestDatabase();
const rows = 50_000;

beforeEach(async () => {
  await database.pool.query(
    `insert into "analyticsIds" ("_id", "_creationTime", member, "analyticsId")
     select 'a' || lpad(n::text, 5, '0'), 1700000000000 + n, 'm' || (n % 5), 'id-' || n from generate_series(0, $1 - 1) as n`,
    [rows],
  );
  await database.pool.query(`analyze "analyticsIds"`);
});

/** The plan of the read `paginate` sends for a first page and the page after it. */
async function plans(query: PagedQuery): Promise<string[]> {
  const first = await planOf(query, null);
  const later = await planOf(query, first.page.continueCursor);
  return [first.plan, later.plan];
}

/** One page, and the plan of the read of the table it sent for that page. */
async function planOf(query: PagedQuery, cursor: string | null) {
  const sent: Array<{ text: string; params: unknown[] }> = [];
  const db = drizzle({ client: database.pool, logger: { logQuery: (text, params) => sent.push({ text, params }) } });
  const page = await paginate(db, query, { cursor, numItems: 100 });
  const reads = sent.filter(({ text }) => /^select .* from "analyticsIds"/s.test(text));
  expect(reads, "the page reads the table").not.toEqual([]);
  const { text, params } = reads.at(-1)!;
  const plan = (await database.pool.query(`explain ${text}`, params)).rows.map((row) => row["QUERY PLAN"] as string).join("\n");
  return { page, plan };
}

test.each([
  ["a read in creation order walks by_creation_time", { table: analyticsIds, order: indexOrder(analyticsIds, []) }, "analyticsIds_by_creation_time"],
  ["a read in creation order, descending, walks it backwards", { table: analyticsIds, order: indexOrder(analyticsIds, []), direction: "desc" }, "analyticsIds_by_creation_time"],
  ["a read of one member walks by_member", { table: analyticsIds, order: indexOrder(analyticsIds, ["member"]), where: eq(analyticsIds.member, "m3") }, "analyticsIds_by_member"],
] as const)("%s, with no sort, from the cursor on", async (_, query, index) => {
  for (const plan of await plans(query as PagedQuery)) {
    expect(plan, plan).toMatch(new RegExp(`Index Scan(?: Backward)? using "${index}"`));
    expect(plan, plan).not.toMatch(/Sort/);
  }
});

test("a later page starts at the cursor in the index, not at the start of it", async () => {
  const [, later] = await plans({ table: analyticsIds, order: indexOrder(analyticsIds, []) });
  expect(later, later).toMatch(/Index Cond: \(ROW\("_creationTime", _id\) > ROW\(/);
});

// `indexOrder` orders a key that can be NULL `asc nulls first` and one that can't plain `asc`; an index walks a read
// only where it holds each key that way, as the migrations build it from this schema (migrations.test.ts). The indexes
// it orders are Convex's, which end in `_creationTime`, then `_id`; an index of the service's own, read by its own SQL
// (the failed-job sweep's), keeps the order that SQL gives.
test("every index in Convex's shape holds each key as indexOrder orders it: ascending, nulls first where the key can be NULL", () => {
  const mismatched = (Object.values(schema) as unknown[])
    .filter((table): table is PgTable => is(table, PgTable))
    .flatMap((table) => {
      const { name, columns, indexes } = getTableConfig(table);
      const convexShaped = indexes.filter(({ config }) => config.columns.slice(-2).map((column) => ("name" in column ? column.name : undefined)).join() === "_creationTime,_id");
      return convexShaped.flatMap(({ config }) =>
        config.columns.flatMap((column) => {
          if (!is(column, IndexedColumn)) return [`${name}.${config.name} indexes an expression`];
          const nullable = !columns.find((stored) => stored.name === column.name)!.notNull;
          const { order = "asc", nulls = order === "asc" ? "last" : "first" } = column.indexConfig ?? {};
          return order === "asc" && (nulls === "first") === nullable ? [] : [`${name}.${config.name}: ${column.name} ${order} nulls ${nulls}`];
        }),
      );
    });

  expect(mismatched).toEqual([]);
});
