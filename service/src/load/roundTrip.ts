// The round trip: proof that the loaded copy equals the snapshot, table by table, before anything else touches it.
// The exporter writes the copy back out in Convex's JSONL shape, by the inverse of the loader's mapping, from one
// `REPEATABLE READ` read-only transaction. The comparator reads the staged snapshot the same way and matches each
// table's row count and the hash of its sorted canonical rows, plus each stored file's sha256. Its answer names tables
// and counts, never row content.
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { asc, eq, and, getTableColumns, getTableName, gt } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import type pg from "pg";
import { decodeStored, parseExport, printExport, type Value } from "../db/codec.ts";
import { toDocument } from "../db/documents.ts";
import { archive } from "../db/schema/index.ts";
import { dataModelTables, planEntries } from "./loader.ts";
import { openSnapshot } from "./snapshot.ts";

/** One side of a table: how many rows, and the sha256 (hex) of their sorted canonical digests. */
export interface Tally {
  rows: number;
  hash: string;
}

/** A table, such as `members` or `_components/posthog/flags`, or a namespace's stored files, such as `_storage/files`. */
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

/** What the exporter writes: a document line of a table, or a stored file's sha256 (base64) in a namespace. */
export type Exported = { table: string; line: string } | { files: string; _id: string; sha256: string };

const pageRows = 500;

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
  const left = snapshot.summary();
  const right = copy.summary();
  const empty = { rows: 0, hash: sortedHash([]) };
  const tables = [...new Set([...left.keys(), ...right.keys()])].sort().map((table): TableAnswer => {
    const [a, b] = [left.get(table) ?? empty, right.get(table) ?? empty];
    return { table, snapshot: a, copy: b, equal: a.rows === b.rows && a.hash === b.hash };
  });
  return { equal: tables.every((answer) => answer.equal), tables };
}

/** The copy as Convex's export lines: the data model's tables, the archive by source and table, every stored file. */
export async function* exportCopy(client: pg.PoolClient): AsyncGenerator<Exported> {
  const db = drizzle({ client });
  for (const table of dataModelTables) {
    const name = getTableName(table);
    for await (const row of pages(db, table)) yield { table: name, line: printExport(toDocument<Value>(table, row)) };
  }
  const sources = await db.selectDistinct({ source: archive.source, table: archive.table }).from(archive).orderBy(archive.source, archive.table);
  for (const { source, table } of sources) {
    const namespace = source === "app" ? "" : `${source}/`;
    const where = and(eq(archive.source, source), eq(archive.table, table));
    // A component's file bytes, archived beside its `_storage` documents, come out as files; one per page, as they're large.
    const bytes = table === "_storage/bytes";
    for await (const row of pages(db, archive, where, bytes ? 1 : pageRows)) {
      const doc = decodeStored(row.document as string) as { _id: string; bytes: ArrayBuffer };
      if (bytes) yield { files: `${namespace}_storage/files`, _id: doc._id, sha256: sha256Base64(Buffer.from(doc.bytes)) };
      else yield { table: `${namespace}${table}`, line: printExport(doc) };
    }
  }
  // The app's files: each hash taken by Postgres from the stored bytes, so no file crosses the connection.
  let after = "";
  for (;;) {
    const { rows } = await client.query<{ _id: string; sha256: string }>(
      `select "_id", encode(sha256(bytes), 'base64') as sha256 from files where "_id" > $1 order by "_id" collate "C" limit ${pageRows}`,
      [after],
    );
    for (const row of rows) yield { files: "_storage/files", ...row };
    if (rows.length < pageRows) return;
    after = rows.at(-1)!._id;
  }
}

/** The snapshot's documents and stored files, as the exporter writes them. `_tables` the loader checked already. */
async function* readSnapshot(pool: pg.Pool, chunks: number): AsyncGenerator<Exported> {
  const snapshot = await openSnapshot(pool, chunks);
  try {
    for (const step of planEntries(snapshot)) {
      if (step.table === "_tables") continue;
      const table = `${step.prefix}${step.table}`;
      const input = await snapshot.open(snapshot.entries.get(step.path)!);
      for await (const line of createInterface({ input, crlfDelay: Infinity })) if (line !== "") yield { table, line };
      for (const [_id, path] of step.files ?? []) {
        const hash = createHash("sha256");
        for await (const part of await snapshot.open(snapshot.entries.get(path)!)) hash.update(part as Buffer);
        yield { files: `${step.prefix}_storage/files`, _id, sha256: hash.digest("base64") };
      }
    }
  } finally {
    snapshot.close();
  }
}

/** Each table's digests: a row's is the sha256 of its canonical line, a file's of its ID and sha256. */
class Tallies {
  private readonly digests = new Map<string, Buffer[]>();

  add(item: Exported): void {
    const [key, text] = "table" in item ? [item.table, canonical(parseExport(item.line))] : [item.files, `${item._id} ${item.sha256}`];
    const list = this.digests.get(key) ?? [];
    list.push(createHash("sha256").update(text).digest());
    this.digests.set(key, list);
  }

  summary(): Map<string, Tally> {
    return new Map([...this.digests].map(([key, list]) => [key, { rows: list.length, hash: sortedHash(list) }]));
  }
}

/** Hashes digests in sorted order, so neither side's row order matters; a digest is 32 bytes, a row can be megabytes. */
function sortedHash(digests: Buffer[]): string {
  const hash = createHash("sha256");
  for (const digest of digests.sort(Buffer.compare)) hash.update(digest);
  return hash.digest("hex");
}

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

function sha256Base64(bytes: Buffer): string {
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
