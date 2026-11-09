// Seed helpers: documents into tables and back by table name, the way today's tests do
// `t.run(ctx => ctx.db.insert("items", {...}))`. Each runs through the app's operation runner, so a new document's
// `_id` and `_creationTime` are stamped from the app's clock exactly as a mutation stamps them, and rows go through
// `fromDocument`/`toDocument`, so a missing field stays missing and int64s and values keep their kind.
import { asc, eq, getTableColumns, getTableName, is, type Column } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { Id } from "../src/db/columns.ts";
import { fromDocument, toDocument } from "../src/db/documents.ts";
import * as schema from "../src/db/schema/index.ts";
import type { Doc, TableName } from "../src/db/schema/index.ts";
import type { Operations, Transaction } from "../src/operations.ts";

const tables = new Map<string, PgTable>(
  (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).map((table) => [getTableName(table), table]),
);

/** A document's own fields, each variant of a union kept apart. */
type Fields<Document> = Document extends unknown ? Omit<Document, "_id" | "_creationTime"> : never;

/** What `insert` takes: the document's fields, and `_id` and `_creationTime` only when it brings its own, as a loaded one does. */
export type NewDocument<Table extends TableName> = Fields<Doc<Table>> & { _id?: string; _creationTime?: number };

/** A patch: each field it names is set, and one set to `undefined` is removed, as Convex's `patch` does. */
export type Patch<Table extends TableName> = { [Field in keyof Fields<Doc<Table>>]?: Fields<Doc<Table>>[Field] | undefined };

function tableNamed(name: string): { table: PgTable; id: Column } {
  const table = tables.get(name);
  if (!table) throw new Error(`No table is named ${name}`);
  return { table, id: getTableColumns(table)._id! };
}

async function read(tx: Transaction, name: string, id: string): Promise<Record<string, unknown> | null> {
  const { table, id: idColumn } = tableNamed(name);
  const [row] = await tx.select().from(table).where(eq(idColumn, id));
  return row ? toDocument(table, row) : null;
}

export function seeder(operations: Operations) {
  return {
    /** Inserts the document and answers its ID. */
    insert: <Table extends TableName>(name: Table, document: NewDocument<Table>): Promise<Id<Table>> =>
      operations.mutation("test.seed.insert", async ({ tx, newRow }) => {
        const { table } = tableNamed(name);
        const stamped = { ...newRow(), ...document };
        await tx.insert(table).values(fromDocument(table, stamped));
        return stamped._id as Id<Table>;
      }),

    /** The document with this ID, or `null`. */
    get: <Table extends TableName>(name: Table, id: string): Promise<Doc<Table> | null> =>
      operations.query("test.seed.get", ({ tx }) => read(tx, name, id) as Promise<Doc<Table> | null>),

    /** Every document of the table, in creation order, as Convex's default order lists them. */
    all: <Table extends TableName>(name: Table): Promise<Array<Doc<Table>>> =>
      operations.query("test.seed.all", async ({ tx }) => {
        const { table, id } = tableNamed(name);
        const columns = getTableColumns(table);
        const rows = await tx.select().from(table).orderBy(asc(columns._creationTime!), asc(id));
        return rows.map((row) => toDocument<Doc<Table>>(table, row));
      }),

    /** Sets the fields the patch names, removes those it sets to `undefined`, and keeps the rest. */
    patch: <Table extends TableName>(name: Table, id: string, patch: Patch<Table>): Promise<void> =>
      operations.mutation("test.seed.patch", async ({ tx }) => {
        const { table, id: idColumn } = tableNamed(name);
        const document = await read(tx, name, id);
        if (!document) throw new Error(`There is no ${name} document ${id}`);
        const patched: Record<string, unknown> = { ...document, ...patch };
        for (const field of Object.keys(patched)) if (patched[field] === undefined) delete patched[field];
        await tx.update(table).set(fromDocument(table, patched)).where(eq(idColumn, id));
      }),

    delete: (name: TableName, id: string): Promise<void> =>
      operations.mutation("test.seed.delete", async ({ tx }) => {
        const { table, id: idColumn } = tableNamed(name);
        await tx.delete(table).where(eq(idColumn, id));
      }),
  };
}

export type Seeder = ReturnType<typeof seeder>;
