// The migrated database against the Drizzle schema: the committed migrations build every table, column and index the
// schema declares, with Convex's order (nulls first) and its byte-wise string comparison.
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { tableShapes, type ColumnShape, type IndexShape } from "../../testing/schemaShape.ts";

const database = useTestDatabase();

describe("the migrations build the schema", () => {
  test("every table has the schema's columns, typed and collated as declared", async () => {
    const { rows } = await database.pool.query<{ table: string; name: string; type: string; collation: string | null; notNull: boolean; generated: string }>(`
      select c.relname as table, a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
             nullif(coll.collname, 'default') as collation, a.attnotnull as "notNull", a.attgenerated as generated
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_collation coll on coll.oid = a.attcollation
      where n.nspname = current_schema() and c.relkind = 'r' and c.relname <> '__migrations' and a.attnum > 0 and not a.attisdropped`);
    const actual = new Map<string, ColumnShape[]>();
    for (const row of rows) {
      const sqlType = row.collation ? `${row.type} COLLATE "${row.collation}"` : row.type;
      actual.set(row.table, [...(actual.get(row.table) ?? []), { name: row.name, sqlType, notNull: row.notNull, generated: row.generated !== "" }]);
    }

    const expected = new Map([...tableShapes()].map(([name, shape]) => [name, shape.columns]));
    expect([...actual.keys()].sort(), "tables").toEqual([...expected.keys()].sort());
    for (const [table, columns] of expected) expect(actual.get(table)!.sort(byName), table).toEqual([...columns].sort(byName));
  });

  test("every table has the schema's indexes, column by column, nulls first where the schema says", async () => {
    const { rows } = await database.pool.query<{ table: string; name: string; columns: string[]; options: number[] }>(`
      select t.relname as table, i.relname as name,
             array(select a.attname::text from unnest(ix.indkey) with ordinality k(attnum, position)
                   join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum order by k.position) as columns,
             ix.indoption::int2[] as options
      from pg_index ix
      join pg_class i on i.oid = ix.indexrelid
      join pg_class t on t.oid = ix.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = current_schema() and not ix.indisprimary and t.relname <> '__migrations'`);
    const actual = new Map<string, IndexShape[]>();
    for (const row of rows) {
      // indoption bit 1 is DESC, bit 2 NULLS FIRST.
      const index = { name: row.name, columns: row.columns.map((name, position) => ({ name, nullsFirst: (row.options[position]! & 2) !== 0 })) };
      expect(row.options.every((option) => (option & 1) === 0), `${row.name} is ascending`).toBe(true);
      actual.set(row.table, [...(actual.get(row.table) ?? []), index]);
    }

    for (const [table, shape] of tableShapes()) expect((actual.get(table) ?? []).sort(byName), table).toEqual([...shape.indexes].sort(byName));
  });

  test("strings compare byte-wise, as Convex compares them", async () => {
    const { rows } = await database.pool.query<{ ordered: string[] }>(
      `select array_agg(s order by s) as ordered from (values ('b'::text collate "C"), ('B'), ('a'), ('é'), ('Z')) v(s)`,
    );
    expect(rows[0]!.ordered).toEqual(["B", "Z", "a", "b", "é"]);
  });
});

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}
