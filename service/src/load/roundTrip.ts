// The round trip: proof that the loaded copy equals the snapshot, table by table, before anything else touches it.
// The exporter writes the copy back out in Convex's JSONL shape, by the inverse of the loader's mapping, from one
// `REPEATABLE READ` read-only transaction. The comparator reads the staged snapshot the same way and matches each
// table's row count and an order-free hash of its canonical rows, plus each stored file: its metadata and the sha256 of
// its bytes. Its answer names tables and counts, never row content. Memory stays bounded: pages of a few rows, one
// stored file at a time, and a running hash per table.
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { and, asc, eq, getTableColumns, getTableName, gt } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import type pg from "pg";
import { decodeStored, encodeStored, parseExport, printExport, type Value } from "../db/codec.ts";
import { toDocument } from "../db/documents.ts";
import { archive, files } from "../db/schema/index.ts";
import * as service from "../db/schema/service.ts";
import { dataModelTable, dataModelTables, planEntries } from "./loader.ts";
import { openSnapshot } from "./snapshot.ts";

/** One side of a table: how many rows, and their order-free hash (hex). */
export interface Tally {
  rows: number;
  hash: string;
}

/**
 * A table, such as `members` or `_components/posthog/flags`; a namespace's stored files, such as `_storage/files`; or a
 * service table that should still be empty, such as `(service) jobs`.
 */
export interface TableAnswer {
  table: string;
  snapshot: Tally;
  copy: Tally;
  equal: boolean;
}

export interface RoundTrip {
  equal: boolean;
  tables: TableAnswer[];
}

/**
 * What either side yields under a table's answer: the table seen; a row, as where it is stored (a data-model table or
 * the archive's source and table) with its key columns, and its document; or a number of rows a table holds unexpectedly.
 */
type Item = { table: string; row?: { at: string; value: Value }; rows?: number };

/** Where a row is stored and under which key, as the comparison sees it: both count, beside the document. */
const at = (where: { table: string } | { archive: [string, string] } | { orphan: string }, _id?: Value, _creationTime?: Value) =>
  JSON.stringify([where, _id ?? null, typeof _creationTime === "number" ? printExport(_creationTime) : null]);

/** Rows per page: a document can be near 1 MiB, so a page stays within tens of MiB. */
const pageRows = 64;
/** The service's own tables that must still be empty before recovery: all but the archive and the files. */
const serviceTables = (Object.values(service) as PgTable[]).filter((table) => table !== archive && table !== files);

/** Compares the copy in Postgres with the staged snapshot of `chunks` chunks. */
export async function roundTrip(pool: pg.Pool, client: pg.PoolClient, chunks: number): Promise<RoundTrip> {
  const snapshot = new Tallies();
  for await (const item of readSnapshot(pool, chunks)) snapshot.add(item);
  const copy = new Tallies();
  await client.query("begin isolation level repeatable read read only");
  try {
    for await (const item of exportCopy(client)) copy.add(item);
  } finally {
    await client.query("rollback");
  }
  const empty: Tally = { rows: 0, hash: hex(0n) };
  const names = [...new Set([...snapshot.names(), ...copy.names()])].sort();
  const tables = names.map((table): TableAnswer => {
    const [a, b] = [snapshot.tally(table) ?? empty, copy.tally(table) ?? empty];
    return { table, snapshot: a, copy: b, equal: a.rows === b.rows && a.hash === b.hash };
  });
  return { equal: tables.every((answer) => answer.equal), tables };
}

/** The copy as Convex's export lines: the data model's tables, the archive by source and table, every stored file. */
async function* exportCopy(client: pg.PoolClient): AsyncGenerator<Item> {
  const db = drizzle({ client });
  for (const table of dataModelTables) {
    const name = getTableName(table);
    for await (const row of pages(db, table)) yield { table: name, row: { at: at({ table: name }, row._id as string, row._creationTime as number), value: toDocument<Value>(table, row) } };
  }
  const sources = await db.selectDistinct({ source: archive.source, table: archive.table }).from(archive).orderBy(archive.source, archive.table);
  for (const { source, table } of sources) {
    const namespace = source === "app" ? "" : `${source}/`;
    const where = and(eq(archive.source, source), eq(archive.table, table));
    // A component's file bytes, archived beside its `_storage` documents, come out as its files, one per page.
    const bytes = table === "_storage/bytes";
    for await (const row of pages(db, archive, where, bytes ? 1 : pageRows)) {
      const doc = decodeStored(row.document as string) as { [field: string]: Value };
      const where = at({ archive: [source, table] }, row._id as string, row._creationTime as number);
      if (bytes) {
        const file = { _id: doc._id!, _creationTime: doc._creationTime!, bytes: sha256(Buffer.from(doc.bytes as ArrayBuffer)) };
        yield { table: `${namespace}_storage/files`, row: { at: where, value: file } };
      } else {
        yield { table: `${namespace}${table}`, row: { at: where, value: doc } };
      }
    }
  }
  // The app's files, metadata and all: each bytes hash taken by Postgres, so no file crosses the connection.
  let after: string | undefined;
  for (;;) {
    const { rows } = await client.query<{ _id: string; _creationTime: number; sha256: string; size: number; contentType: string | null; bytes: string }>(
      `select "_id", "_creationTime", sha256, size, "contentType", encode(sha256(bytes), 'base64') as bytes
       from files ${after === undefined ? "" : `where "_id" > $1`} order by "_id" collate "C" limit ${pageRows}`,
      after === undefined ? [] : [after],
    );
    for (const { contentType, ...file } of rows) {
      const value = contentType === null ? file : { ...file, contentType };
      yield { table: "_storage/files", row: { at: at({ table: "files" }, file._id, file._creationTime), value } };
    }
    if (rows.length < pageRows) break;
    after = rows.at(-1)!._id;
  }
  for (const table of serviceTables) {
    const { rows } = await client.query<{ count: number }>(`select count(*)::int as count from "${getTableName(table)}"`);
    if (rows[0]!.count > 0) yield { table: `(service) ${getTableName(table)}`, rows: rows[0]!.count };
  }
}

/** The snapshot's documents and stored files, as the exporter writes them. `_tables` the loader checked already. */
async function* readSnapshot(pool: pg.Pool, chunks: number): AsyncGenerator<Item> {
  const snapshot = await openSnapshot(pool, chunks);
  const hashOf = async (path: string) => {
    const hash = createHash("sha256");
    for await (const part of await snapshot.open(snapshot.entries.get(path)!)) hash.update(part as Buffer);
    return hash.digest("base64");
  };
  try {
    for (const step of planEntries(snapshot)) {
      if (step.table === "_tables") continue;
      const table = `${step.prefix}${step.table}`;
      const filesTable = `${step.prefix}_storage/files`;
      yield { table };
      if (step.files) yield { table: filesTable };
      const unseen = new Map(step.files);
      const input = await snapshot.open(snapshot.entries.get(step.path)!);
      // Where the loader stores this table's rows, by its own rule.
      const where = dataModelTable(step) ? { table: step.table } : { archive: [step.source, step.table] as [string, string] };
      for await (const line of createInterface({ input, crlfDelay: Infinity })) {
        if (line === "") continue;
        // As the copy keeps it: the stored form makes every NaN one NaN, on purpose.
        const doc = decodeStored(encodeStored(parseExport(line))) as { [field: string]: Value };
        yield { table, row: { at: at(where, doc._id, doc._creationTime), value: doc } };
        if (!step.files) continue;
        // A stored file as the loader keeps it: the app's in `files` with its metadata, a component's bytes archived.
        const path = step.files.get(doc._id as string);
        unseen.delete(doc._id as string);
        const file: { [field: string]: Value } = { _id: doc._id!, _creationTime: doc._creationTime! };
        if (step.root) {
          Object.assign(file, { sha256: doc.sha256!, size: Number(doc.size) });
          if (doc.contentType !== null && doc.contentType !== undefined) file.contentType = doc.contentType;
        }
        if (path) file.bytes = await hashOf(path);
        const fileAt = step.root ? at({ table: "files" }, doc._id, doc._creationTime) : at({ archive: [step.source, "_storage/bytes"] }, doc._id, doc._creationTime);
        yield { table: filesTable, row: { at: fileAt, value: file } };
      }
      // Bytes without a document: the loader keeps none of them, so each counts as a file the copy lacks.
      for (const [_id, path] of unseen) yield { table: filesTable, row: { at: at({ orphan: path }), value: { _id, bytes: await hashOf(path) } } };
    }
  } finally {
    snapshot.close();
  }
}

/**
 * Each table's count and hash: the sum, modulo 2^256, of each row's sha256 over where it is stored, its key columns and
 * its canonical text. A sum doesn't
 * depend on order, so neither side sorts, and a table costs one number however many rows it has.
 */
class Tallies {
  private readonly tallies = new Map<string, { rows: number; sum: bigint }>();

  add({ table, row, rows }: Item): void {
    const tally = this.tallies.get(table) ?? { rows: 0, sum: 0n };
    this.tallies.set(table, tally);
    if (row !== undefined) {
      tally.rows += 1;
      const digest = createHash("sha256").update(row.at).update("\n").update(canonical(row.value)).digest("hex");
      tally.sum = (tally.sum + BigInt(`0x${digest}`)) & mask;
    }
    if (rows !== undefined) {
      tally.rows += rows;
      tally.sum = (tally.sum + BigInt(rows)) & mask;
    }
  }

  names(): string[] {
    return [...this.tallies.keys()];
  }

  tally(table: string): Tally | undefined {
    const tally = this.tallies.get(table);
    return tally && { rows: tally.rows, hash: hex(tally.sum) };
  }
}

const mask = (1n << 256n) - 1n;
const hex = (sum: bigint) => sum.toString(16).padStart(64, "0");

/** A value's export text with every object's fields sorted, so field order doesn't count. */
function canonical(value: Value): string {
  return printExport(sortFields(value));
}

function sortFields(value: Value): Value {
  if (Array.isArray(value)) return value.map(sortFields);
  if (value === null || typeof value !== "object" || value instanceof ArrayBuffer) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((field) => [field, sortFields(value[field]!)]),
  );
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("base64");
}

/** A table's rows in `_id` order, page by page, inside the caller's transaction. */
async function* pages(db: NodePgDatabase, table: PgTable, where?: ReturnType<typeof and>, size = pageRows): AsyncGenerator<Record<string, unknown>> {
  const id = getTableColumns(table)._id!;
  let after: string | undefined;
  for (;;) {
    const rows = (await db
      .select()
      .from(table)
      .where(and(where, after === undefined ? undefined : gt(id, after)))
      .orderBy(asc(id))
      .limit(size)) as Record<string, unknown>[];
    yield* rows;
    if (rows.length < size) return;
    after = rows.at(-1)!._id as string;
  }
}
