// The loader: every row of a Convex snapshot ZIP into the data model, as exported, by each column's kind.
// Root tables with a table in the data model load into it; every other table (Convex Auth's, the components',
// `_scheduled_functions`, a table the schema no longer has) goes to `archive` verbatim; `_storage` fills `files`.
// Each batch commits with its entry's checkpoint, so a load that stops resumes where it stopped.
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { getTableColumns, getTableName, is, type Column } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import type pg from "pg";
import { decodeStored, encodeStored, parseExport, type Value } from "../db/codec.ts";
import { fromDocument } from "../db/documents.ts";
import * as schema from "../db/schema/index.ts";
import { openSnapshot, type Snapshot } from "./snapshot.ts";

type Doc = { [field: string]: Value };

/** What stops a load: something in the snapshot. Its message names entries, tables, IDs and fields, never content. */
export class LoadError extends Error {}
type Report = { table: string; field: string; _id: string; value: "-0" | "NaN" };
interface Insert {
  table: PgTable;
  row: Record<string, unknown>;
  _id: string;
}

const loadTables = new Set<unknown>([schema.loadState, schema.loadChunks, schema.loadCheckpoints]);

/** Every table the load fills, and the reset empties: the data model and the service's tables, not the load's own. */
export const appTables: PgTable[] = (Object.values(schema) as unknown[]).filter(
  (table): table is PgTable => is(table, PgTable) && !loadTables.has(table),
);
/** The data model's tables by name: a root table loads into one of these; `archive` and `files` are the service's own. */
const serviceTables = new Set<unknown>([schema.archive, schema.files]);
const tablesByName = new Map(appTables.filter((table) => !serviceTables.has(table)).map((table) => [getTableName(table), table]));

/** A stored file is read whole into one row; one larger than this stops the load rather than the process. */
export const maxFileBytes = 32 * 1024 * 1024;

/** A batch commits after this many rows or bytes, whichever comes first, well inside the statement timeout. */
export interface BatchLimits {
  rows: number;
  bytes: number;
}

export async function loadSnapshot(pool: pg.Pool, client: pg.PoolClient, chunks: number, limits: BatchLimits): Promise<void> {
  const snapshot = await openSnapshot(pool, chunks);
  try {
    const plan = planEntries(snapshot);
    for (const step of plan) await loadEntry(client, snapshot, step, limits);
  } finally {
    snapshot.close();
  }
}

interface Step {
  path: string;
  /** Where the entry's namespace starts: empty for the root, such as `_components/posthog/` for a component. */
  prefix: string;
  /** The archive's source: `app` for the root, else the component's path in the export, such as `_components/posthog`. */
  source: string;
  root: boolean;
  table: string;
  /** For `_storage`: each file's entry by ID. */
  files?: Map<string, string>;
}

function planEntries(snapshot: Snapshot): Step[] {
  const steps: Step[] = [];
  const inventories: Step[] = [];
  for (const path of [...snapshot.entries.keys()].sort()) {
    if (path.endsWith("/")) continue;
    let rest = path;
    const components: string[] = [];
    while (rest.startsWith("_components/")) {
      const [, name, ...tail] = rest.split("/");
      components.push(name!);
      rest = tail.join("/");
    }
    const prefix = path.slice(0, path.length - rest.length);
    const root = components.length === 0;
    const source = root ? "app" : prefix.slice(0, -1);
    const [table, file, ...deeper] = rest.split("/");
    if (rest === "README.md" || (deeper.length === 0 && file === "generated_schema.jsonl")) continue;
    if (deeper.length > 0 || file === undefined) throw new LoadError(`The snapshot has an entry the loader doesn't know: ${path}`);
    if (table === "_storage" && file !== "documents.jsonl") continue;
    if (file !== "documents.jsonl") throw new LoadError(`The snapshot has an entry the loader doesn't know: ${path}`);
    const step: Step = { path, prefix, source, root, table: table! };
    if (table === "_storage") step.files = storedFiles(snapshot, prefix);
    (table === "_tables" ? inventories : steps).push(step);
  }
  return [...steps, ...inventories];
}

function storedFiles(snapshot: Snapshot, prefix: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const path of snapshot.entries.keys()) {
    const name = path.startsWith(`${prefix}_storage/`) ? path.slice(prefix.length + "_storage/".length) : undefined;
    if (name && name !== "documents.jsonl" && !name.includes("/")) files.set(name.split(".")[0]!, path);
  }
  return files;
}

async function loadEntry(client: pg.PoolClient, snapshot: Snapshot, step: Step, limits: BatchLimits): Promise<void> {
  const saved = await client.query<{ lines: number; done: boolean; reports: string }>(
    'select lines, done, reports from "loadCheckpoints" where entry = $1',
    [step.path],
  );
  const checkpoint = saved.rows[0];
  if (checkpoint?.done) return;
  let lines = checkpoint?.lines ?? 0;
  const reports = (checkpoint ? decodeStored(checkpoint.reports) : []) as Report[];

  const db = drizzle({ client });
  let batch: Insert[] = [];
  let batchBytes = 0;
  let read = 0;
  const commit = async (done: boolean) => {
    await client.query("begin");
    try {
      await insertAll(client, db, batch);
      lines = read;
      await client.query(
        `insert into "loadCheckpoints" (entry, lines, done, reports) values ($1, $2, $3, $4)
         on conflict (entry) do update set lines = excluded.lines, done = excluded.done, reports = excluded.reports`,
        [step.path, lines, done, encodeStored(reports as unknown as Value)],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    batch = [];
    batchBytes = 0;
  };

  const input = await snapshot.open(snapshot.entries.get(step.path)!);
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (line === "") continue;
    read += 1;
    if (read <= lines) continue;
    const doc = parseExport(line);
    if (step.table === "_tables") {
      checkInventory(snapshot, step.prefix, doc);
      continue;
    }
    if (doc === null || typeof doc !== "object" || Array.isArray(doc) || doc instanceof ArrayBuffer) {
      throw new LoadError(`Line ${read} of ${step.path} is not a document`);
    }
    refuseNul(doc, `${step.path} line ${read}`);
    const { inserts, weight } = step.files ? await storedFile(snapshot, step, doc) : { inserts: [documentInsert(step, doc, reports)], weight: 0 };
    batch.push(...inserts);
    batchBytes += line.length + weight;
    if (batch.length >= limits.rows || batchBytes >= limits.bytes) await commit(false);
  }
  await commit(true);
}

function documentInsert(step: Step, doc: Doc, reports: Report[]): Insert {
  const _id = doc._id;
  if (typeof _id !== "string" || typeof doc._creationTime !== "number") throw new LoadError(`A document of ${step.path} has no _id or _creationTime`);
  const table = step.root ? tablesByName.get(step.table) : undefined;
  if (!table) return archiveInsert(step.source, step.table, doc);
  checkKinds(table, doc);
  reports.push(...indexedSpecials(table, doc));
  return { table, row: fromDocument(table, doc), _id };
}

function archiveInsert(source: string, table: string, doc: Doc): Insert {
  const _id = doc._id as string;
  const row = fromDocument(schema.archive, { source, table, _id, _creationTime: doc._creationTime as number, document: doc } as Record<string, unknown>);
  return { table: schema.archive, row, _id };
}

/**
 * A `_storage` line: its document verbatim in the archive (it carries Convex's internal ID), and its bytes, checked
 * against the document's size and sha256, as a `files` row for the app, or in the archive for a component.
 */
async function storedFile(snapshot: Snapshot, step: Step, doc: Doc): Promise<{ inserts: Insert[]; weight: number }> {
  const _id = doc._id as string;
  const path = step.files!.get(_id);
  if (!path) throw new LoadError(`The snapshot has no bytes for stored file ${_id}`);
  const entry = snapshot.entries.get(path)!;
  if (entry.uncompressedSize > maxFileBytes) throw new LoadError(`Stored file ${_id} is larger than the loader takes (${maxFileBytes} bytes)`);
  const bytes = Buffer.alloc(entry.uncompressedSize);
  let at = 0;
  for await (const part of await snapshot.open(entry)) at += (part as Buffer).copy(bytes, at);
  const sha256 = createHash("sha256").update(bytes).digest("base64");
  if (doc.sha256 !== sha256 || BigInt(bytes.length) !== BigInt(doc.size as bigint)) {
    throw new LoadError(`Stored file ${_id} doesn't match its size or sha256`);
  }
  const metadata = archiveInsert(step.source, "_storage", doc);
  if (!step.root) {
    const content = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    // The archive stores the bytes in base64, so they weigh four bytes for every three toward the batch.
    const weight = Math.ceil(bytes.length / 3) * 4;
    return { inserts: [metadata, archiveInsert(step.source, "_storage/bytes", { _id, _creationTime: doc._creationTime!, bytes: content })], weight };
  }
  const file: Record<string, unknown> = { _id, _creationTime: doc._creationTime, sha256, size: bytes.length, bytes };
  if (doc.contentType !== null && doc.contentType !== undefined) file.contentType = doc.contentType;
  return { inserts: [metadata, { table: schema.files, row: fromDocument(schema.files, file), _id }], weight: bytes.length };
}

/** `_tables` lists every table of its namespace; each one needs its documents in the snapshot. */
function checkInventory(snapshot: Snapshot, prefix: string, doc: Value): void {
  const name = (doc as Doc).name;
  if (typeof name !== "string" || !snapshot.entries.has(`${prefix}${name}/documents.jsonl`)) {
    throw new LoadError(`The snapshot lists table ${String(name)} but has no documents for it`);
  }
}

const kinds: Record<string, string> = { 'text COLLATE "C"': "string", "double precision": "number", bigint: "bigint", boolean: "boolean" };

/** A typed column takes one kind; a value of another kind stops the load rather than being coerced. */
function checkKinds(table: PgTable, doc: Doc): void {
  for (const [field, column] of Object.entries(getTableColumns(table))) {
    const value = doc[field];
    const kind = kinds[column.getSQLType()];
    if (value === undefined || value === null || kind === undefined || typeof value === kind) continue;
    throw new LoadError(`${getTableName(table)} ${String(doc._id)}: ${field} holds a ${typeof value}, its column takes a ${kind}`);
  }
}

/** Postgres keeps no NUL character in text or jsonb, so a document holding one stops the load. */
function refuseNul(value: Value, where: string): void {
  if (typeof value === "string") {
    if (value.includes("\u0000")) throw new LoadError(`${where}: a string holds a NUL character, which Postgres can't store`);
  } else if (Array.isArray(value)) {
    for (const inner of value) refuseNul(inner, where);
  } else if (value !== null && typeof value === "object" && !(value instanceof ArrayBuffer)) {
    for (const [field, inner] of Object.entries(value)) refuseNul(field, where), refuseNul(inner, where);
  }
}

/** -0 and NaN in an indexed number field: Postgres orders them unlike Convex, so the load reports each one. */
function indexedSpecials(table: PgTable, doc: Doc): Report[] {
  const reports: Report[] = [];
  for (const column of indexedNumberColumns(table)) {
    let value: Value | undefined = doc;
    for (const part of column.name.split(".")) value = value && typeof value === "object" && !Array.isArray(value) && !(value instanceof ArrayBuffer) ? value[part] : undefined;
    if (typeof value !== "number") continue;
    if (Number.isNaN(value) || Object.is(value, -0)) {
      reports.push({ table: getTableName(table), field: column.name, _id: doc._id as string, value: Number.isNaN(value) ? "NaN" : "-0" });
    }
  }
  return reports;
}

const indexedNumbers = new WeakMap<PgTable, Column[]>();
function indexedNumberColumns(table: PgTable): Column[] {
  let columns = indexedNumbers.get(table);
  if (!columns) {
    const config = getTableConfig(table);
    const names = new Set(config.indexes.flatMap((index) => index.config.columns.map((column) => (column as { name?: string }).name)));
    columns = config.columns.filter((column) => names.has(column.name) && column.getSQLType() === "double precision");
    indexedNumbers.set(table, columns);
  }
  return columns;
}

/**
 * Inserts a batch, table by table. A row whose index key passes Postgres's B-tree limit (error 54000) stops the load
 * with its table and ID, found by trying the batch's rows one at a time, all rolled back.
 */
async function insertAll(client: pg.PoolClient, db: NodePgDatabase, batch: Insert[]): Promise<void> {
  const byTable = new Map<PgTable, Insert[]>();
  for (const insert of batch) byTable.set(insert.table, [...(byTable.get(insert.table) ?? []), insert]);
  for (const [table, inserts] of byTable) {
    await client.query("savepoint batch");
    try {
      await db.insert(table).values(inserts.map(({ row }) => row));
    } catch (error) {
      if (codeOf(error) !== "54000") throw error;
      await client.query("rollback to savepoint batch");
      for (const insert of inserts) {
        await client.query("savepoint row");
        try {
          await db.insert(table).values(insert.row);
        } catch (rowError) {
          if (codeOf(rowError) !== "54000") throw rowError;
          // Postgres's message names the index and the sizes, not the key.
          const cause = (rowError as { cause?: Error }).cause ?? (rowError as Error);
          throw new LoadError(`${getTableName(table)} ${insert._id}: ${cause.message}`);
        }
        await client.query("rollback to savepoint row");
      }
      throw error;
    }
  }
}

function codeOf(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return cause?.code ?? (error as { code?: string })?.code;
}
