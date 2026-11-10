// Convex gave every table an implicit index in creation order, `by_creation_time`: `_creationTime`, then `_id`.
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { expect, test } from "vitest";
import * as schema from "./schema/index.ts";

const tables = (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable));

test("every table of documents has Convex's creation-order index, on exactly _creationTime then _id", () => {
  const missing = tables
    .filter((table) => "_creationTime" in getTableColumns(table))
    .filter((table) => {
      const index = getTableConfig(table).indexes.find(({ config }) => config.name === `${getTableName(table)}_by_creation_time`);
      const columns = index?.config.columns.map((column) => ("name" in column ? column.name : undefined));
      return JSON.stringify(columns) !== JSON.stringify(["_creationTime", "_id"]) || index!.config.unique;
    })
    .map(getTableName);

  expect(missing).toEqual([]);
});

test("the only tables without a _creationTime are the service's own bookkeeping, keyed by name", () => {
  const without = tables.filter((table) => !("_creationTime" in getTableColumns(table))).map(getTableName);

  expect(without.sort()).toEqual(["crons", "flagDefinitions", "flagRefreshes", "loadCheckpoints", "loadChunks", "loadState"]);
});
