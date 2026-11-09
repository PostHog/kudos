// The shape of the Drizzle schema, as plain data: what the parity tests compare with Convex's schema and with the
// migrated database.
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema/index.ts";

export interface ColumnShape {
  name: string;
  sqlType: string;
  notNull: boolean;
  generated: boolean;
}

export interface IndexShape {
  name: string;
  columns: Array<{ name: string; nullsFirst: boolean }>;
}

export interface TableShape {
  name: string;
  columns: ColumnShape[];
  indexes: IndexShape[];
}

/** Every table of the schema, by name. */
export function tableShapes(): Map<string, TableShape> {
  const shapes = new Map<string, TableShape>();
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable)) continue;
    const config = getTableConfig(table);
    shapes.set(config.name, {
      name: config.name,
      columns: config.columns.map((column) => ({
        name: column.name,
        sqlType: column.getSQLType(),
        notNull: column.notNull,
        generated: column.generated !== undefined,
      })),
      indexes: config.indexes.map((index) => ({
        name: index.config.name!,
        columns: index.config.columns.map((column) => {
          if (!("indexConfig" in column)) throw new Error(`${config.name}.${index.config.name} indexes an expression`);
          return { name: column.name!, nullsFirst: column.indexConfig?.nulls === "first" };
        }),
      })),
    });
  }
  return shapes;
}
