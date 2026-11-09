// @vitest-environment node
// Convex's schema against the rewrite's Drizzle schema: the Drizzle tables were generated once and are owned by hand
// since, so this keeps every table, field and index of convex/schema.ts there, by the column rule.
import { describe, expect, test } from "vitest";
import schema from "../../convex/schema.ts";
import { tableShapes } from "../../service/testing/schemaShape.ts";
import { columnOf, fieldsOf, indexName, type ExportedSchema } from "./drizzle/generate.ts";
import { archivedTables } from "./drizzle/archivedTables.ts";

// `export()` is on the schema at runtime but not in its type.
const convex = JSON.parse((schema as unknown as { export(): string }).export()) as ExportedSchema;
const drizzle = tableShapes();
const kept = convex.tables.filter(({ tableName }) => !archivedTables.has(tableName));
const sqlTypes = { string: 'text COLLATE "C"', number: "double precision", bigint: "bigint", boolean: "boolean", value: "jsonb" };

describe("the Drizzle schema has every Convex table", () => {
  test("one table per Convex table, besides the archived ones and the service's own", () => {
    const names = new Set(kept.map(({ tableName }) => tableName));
    expect([...drizzle.keys()].filter((name) => !names.has(name)).sort(), "tables Convex lacks").toEqual(["archive", "files"]);
    expect([...names].filter((name) => !drizzle.has(name)), "Convex tables without one").toEqual([]);
  });

  test.each(kept.map((table) => [table.tableName, table] as const))("%s has every field, by the column rule", (name, table) => {
    const shape = drizzle.get(name)!;
    const expected = Object.entries(fieldsOf(table.documentType!)).map(([field, type]) => {
      const column = columnOf(field, type);
      return { name: field, sqlType: sqlTypes[column.kind], notNull: !column.nullable, generated: false };
    });
    const system = [
      { name: "_id", sqlType: 'text COLLATE "C"', notNull: true, generated: false },
      { name: "_creationTime", sqlType: "double precision", notNull: true, generated: false },
    ];
    const stored = shape.columns.filter(({ generated }) => !generated);
    expect(stored.sort(byName)).toEqual([...system, ...expected].sort(byName));
  });

  test.each(kept.map((table) => [table.tableName, table] as const))("%s has every index, ending in _creationTime and _id, nulls first", (name, table) => {
    const shape = drizzle.get(name)!;
    const notNull = new Set(shape.columns.filter((column) => column.notNull).map((column) => column.name));
    const expected = table.indexes.map(({ indexDescriptor, fields }) => ({
      name: indexName(name, indexDescriptor),
      columns: [...fields, "_creationTime", "_id"].map((field) => ({ name: field, nullsFirst: !notNull.has(field) })),
    }));
    expect(shape.indexes.sort(byName)).toEqual(expected.sort(byName));
  });

  test("a nested index field is a generated column of its own", () => {
    const nested = kept.flatMap(({ tableName, indexes }) => indexes.flatMap(({ fields }) => fields.filter((field) => field.includes(".")).map((field) => `${tableName}.${field}`)));
    expect(nested.length, "today's schema indexes a nested field").toBeGreaterThan(0);
    for (const path of nested) {
      const [table, ...field] = path.split(".");
      const column = drizzle.get(table!)!.columns.find(({ name }) => name === field.join("."));
      expect(column?.generated, path).toBe(true);
    }
  });
});

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}
