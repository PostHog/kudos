import { createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterEach, describe, expect, inject, test } from "vitest";
import { chunksOf, zip } from "../../testing/zip.ts";
import { useTestDatabase, withSearchPath } from "../../testing/database.ts";
import { decodeStored, printExport, type Value } from "../db/codec.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { archive, files, hypeReactions, kudosMessages, members, wordDeletionRequests } from "../db/schema/index.ts";
import { createPool } from "../db/pool.ts";
import { createApp, type Migrations } from "../http/app.ts";
import { createClock } from "../clock.ts";
import type { Log } from "../log.ts";
import { createLoadControl, type LoadControl } from "./control.ts";
import { maxFileBytes } from "./loader.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const token = "a-load-token";

type Doc = { [field: string]: Value };
const jsonl = (docs: Doc[]) => docs.map((doc) => printExport(doc)).join("\n") + (docs.length ? "\n" : "");

interface Copy {
  load: LoadControl;
  request(path: string, init?: RequestInit & { token?: string | null }): Promise<Response>;
  logs: string[];
}

const copies: Copy[] = [];
afterEach(() => copies.splice(0).forEach((copy) => copy.load.stop()));

/** One copy of the service: the app over the test database with the load's control, as boot wires them. */
async function copy(
  options: { adminToken?: string | undefined; rows?: number; bytes?: number; off?: boolean; migrations?: Migrations } = {},
): Promise<Copy> {
  const { rows = 500, bytes = 1 << 20, off = false, migrations = "done" } = options;
  const adminToken = "adminToken" in options ? options.adminToken : token;
  const logs: string[] = [];
  const log: Log = { info: (message) => logs.push(message), error: (message) => logs.push(message) };
  const load = createLoadControl({ pool: database.pool, token: adminToken, log, limits: { rows, bytes }, pollMs: 50 });
  await load.refresh();
  load.resume();
  const app = createApp({ commit: "test", readiness: { migrations: () => migrations }, off, log, clock: createClock(), load });
  const request: Copy["request"] = (path, { token: given = token, ...init } = {}) =>
    Promise.resolve(app.request(path, { ...init, headers: { ...(given === null ? {} : { "x-hedgehug-admin-token": given }), ...init.headers } }));
  const made = { load, request, logs };
  copies.push(made);
  return made;
}

async function stage(service: Copy, archive: Buffer, count = 3): Promise<string> {
  for (const [number, chunk] of chunksOf(archive, count).entries()) {
    const response = await service.request(`/admin/load?chunk=${number}`, { method: "POST", body: new Uint8Array(chunk) });
    expect(response.status, `chunk ${number} is staged`).toBe(200);
  }
  return createHash("sha256").update(archive).digest("hex");
}

async function finish(service: Copy, archive: Buffer, count = 3): Promise<Response> {
  const sha256 = await stage(service, archive, count);
  return service.request("/admin/load/finish", { method: "POST", body: JSON.stringify({ chunks: count, sha256 }) });
}

interface Status {
  phase: string;
  error: string | null;
  stagedChunks: number;
  entries: Array<{ entry: string; lines: number; done: boolean }>;
  reports: Array<Record<string, string>>;
}

async function status(service: Copy): Promise<Status> {
  return (await (await service.request("/admin/load")).json()) as Status;
}

/** Waits until the load leaves `loading` or stops on an error. */
async function settled(service: Copy): Promise<Status> {
  for (let tries = 0; tries < 600; tries++) {
    const now = await status(service);
    if (now.phase !== "loading" || now.error !== null) return now;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The load didn't settle");
}

async function documents(table: PgTable): Promise<Doc[]> {
  const rows = await db.select().from(table);
  return rows.map((row) => toDocument<Doc>(table, row as Record<string, unknown>)).sort((a, b) => String(a._id).localeCompare(String(b._id)));
}

const message = (id: string, extra: Doc = {}): Doc => ({
  _id: id,
  _creationTime: 1_700_000_000_000.5,
  workspace: "T1",
  conversation: "C1",
  message: "1.0",
  author: "U1",
  revision: 2n ** 60n,
  state: "given",
  attempt: 0n,
  content: { mentions: [], emoji: ["kudos"] },
  annotations: {},
  spendsAt: 1_700_000_000_000,
  checks: 0,
  ...extra,
});

const reaction = (id: string, extra: Doc = {}): Doc => ({
  _id: id,
  _creationTime: 1_700_000_000_001,
  workspace: "T1",
  giver: "m1",
  owner: "m2",
  author: "m3",
  emoji: "tada",
  conversation: "C1",
  message: "1.0",
  at: 5,
  ...extra,
});

describe("loading a Convex snapshot", () => {
  test("every row lands as exported: app tables by column kind, the rest archived, stored files with their bytes", async () => {
    const card = randomBytes(300);
    const asset = Buffer.from("<svg/>");
    const base64 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("base64");
    const messages = [message("k1", { threadRoot: "0.9", retry: true, nextCheckAt: 2.5 }), message("k2")];
    const deletions: Doc[] = [
      { _id: "w1", _creationTime: 3, workspace: "T1", author: null },
      { _id: "w2", _creationTime: 4, workspace: "T1", author: "U2" },
    ];
    const reactions = [reaction("h1", { at: -0 }), reaction("h2", { at: Number.NaN }), reaction("h3")];
    const account: Doc = { _id: "a1", _creationTime: 5, provider: "slack", providerAccountId: "U1", userId: "u1" };
    const retired: Doc = { _id: "r1", _creationTime: 6, anything: { nested: [1n, 2.5, null] } };
    const scheduled: Doc = { _id: "s1", _creationTime: 7, name: "slack/delivery:sendReply", args: [{ attempt: 3n }], scheduledTime: 8, state: { kind: "pending" } };
    const flag: Doc = { _id: "f1", _creationTime: 9, key: "a-flag", definition: { active: true } };
    const storage: Doc[] = [
      { _id: "st1", _creationTime: 10, sha256: base64(card), size: BigInt(card.length), contentType: "image/png", internalId: "i1" },
      { _id: "st2", _creationTime: 11, sha256: base64(asset), size: BigInt(asset.length), contentType: null, internalId: "i2" },
    ];
    const componentFile: Doc = { _id: "cs1", _creationTime: 12, sha256: base64(asset), size: BigInt(asset.length), contentType: "image/svg+xml", internalId: "i3" };
    const tablesOf = (names: string[]) => jsonl(names.map((name, at) => ({ name, id: BigInt(at + 10001) })));

    const archive = zip({
      "README.md": "An export.",
      "_tables/documents.jsonl": tablesOf(["kudosMessages", "wordDeletionRequests", "hypeReactions", "authAccounts", "retiredTable"]),
      "kudosMessages/documents.jsonl": jsonl(messages),
      "kudosMessages/generated_schema.jsonl": '"any"\n',
      "wordDeletionRequests/documents.jsonl": jsonl(deletions),
      "hypeReactions/documents.jsonl": jsonl(reactions),
      "authAccounts/documents.jsonl": jsonl([account]),
      "retiredTable/documents.jsonl": jsonl([retired]),
      "_scheduled_functions/documents.jsonl": jsonl([scheduled]),
      "_storage/documents.jsonl": jsonl(storage),
      "_storage/st1.png": card,
      "_storage/st2": asset,
      "_components/posthog/_tables/documents.jsonl": tablesOf(["flags"]),
      "_components/app/_tables/documents.jsonl": tablesOf(["hypeReactions"]),
      "_components/app/hypeReactions/documents.jsonl": jsonl([reaction("c1")]),
      "_components/posthog/flags/documents.jsonl": jsonl([flag]),
      "_components/posthog/_storage/documents.jsonl": jsonl([componentFile]),
      "_components/posthog/_storage/cs1.svg": asset,
    });
    const service = await copy();

    const started = await finish(service, archive);
    expect(started.status, "finish starts the load").toBe(202);
    const done = await settled(service);

    expect(done, "the load wrote every entry and waits for its round trip").toMatchObject({ phase: "verifying", error: null });
    expect(await documents(kudosMessages), "messages keep _id, _creationTime, int64 and optional fields").toStrictEqual(messages);
    expect(await documents(wordDeletionRequests), "a null author stays null").toStrictEqual(deletions);
    expect((await documents(hypeReactions)).map((doc) => doc.at), "-0 and NaN are stored").toStrictEqual([-0, Number.NaN, 5]);
    expect(done.reports, "-0 and NaN in an indexed number field are reported").toStrictEqual([
      { table: "hypeReactions", field: "at", _id: "h1", value: "-0" },
      { table: "hypeReactions", field: "at", _id: "h2", value: "NaN" },
    ]);

    const archived = await database.pool.query<{ source: string; table: string; _id: string; document: string }>(
      'select source, "table", _id, document from archive order by source, "table", _id',
    );
    expect(
      archived.rows.map((row) => ({ ...row, document: decodeStored(row.document) })),
      "everything without a table is archived verbatim, the _storage documents with their internal IDs",
    ).toStrictEqual([
      { source: "_components/app", table: "hypeReactions", _id: "c1", document: reaction("c1") },
      { source: "_components/posthog", table: "_storage", _id: "cs1", document: componentFile },
      { source: "_components/posthog", table: "_storage/bytes", _id: "cs1", document: { _id: "cs1", _creationTime: 12, bytes: bufferOf(asset) } },
      { source: "_components/posthog", table: "flags", _id: "f1", document: flag },
      { source: "app", table: "_scheduled_functions", _id: "s1", document: scheduled },
      { source: "app", table: "_storage", _id: "st1", document: storage[0] },
      { source: "app", table: "_storage", _id: "st2", document: storage[1] },
      { source: "app", table: "authAccounts", _id: "a1", document: account },
      { source: "app", table: "retiredTable", _id: "r1", document: retired },
    ]);
    expect(await documents(files), "stored files keep their metadata and bytes; a null content type is missing").toStrictEqual([
      { _id: "st1", _creationTime: 10, sha256: base64(card), size: card.length, contentType: "image/png", bytes: card },
      { _id: "st2", _creationTime: 11, sha256: base64(asset), size: asset.length, bytes: asset },
    ]);
    expect((await service.request("/anything", { token: null })).status, "the app holds until the load is done").toBe(503);
  });

  test("a restarted copy resumes from the checkpoints without writing a row twice", async () => {
    const reactions = Array.from({ length: 300 }, (_, at) => reaction(`h${String(at).padStart(3, "0")}`));
    const archive = zip({ "hypeReactions/documents.jsonl": jsonl(reactions) });
    const first = await copy({ rows: 1 });
    const second = await copy({ rows: 1 });

    expect((await finish(first, archive)).status, "the first copy starts the load").toBe(202);
    await waitFor(async () => ((await status(first)).entries[0]?.lines ?? 0) >= 20);
    // The owner's connection drops, as when its process dies: the lock goes with it.
    await database.pool.query(
      "select pg_terminate_backend(pid) from pg_locks where locktype = 'advisory' and classid = $1 and objid = $2 and pid <> pg_backend_pid()",
      lockParts(database.schema),
    );
    const done = await settled(second);

    expect(done, "the load finishes").toMatchObject({ phase: "verifying", error: null });
    const logs = [...first.logs, ...second.logs];
    expect(logs, "the owner's load was interrupted, not stopped").toContain("load interrupted");
    expect(logs.filter((line) => line === "load running").length, "a copy took it over").toBeGreaterThanOrEqual(2);
    expect((await documents(hypeReactions)).map((doc) => doc._id), "every row once").toStrictEqual(reactions.map((doc) => doc._id));
  });

  test("one copy owns a load: the other, checking all along, never runs it too", async () => {
    const reactions = Array.from({ length: 200 }, (_, at) => reaction(`h${String(at).padStart(3, "0")}`));
    const first = await copy({ rows: 1 });
    const second = await copy({ rows: 1 });

    await finish(first, zip({ "hypeReactions/documents.jsonl": jsonl(reactions) }));
    const done = await settled(first);

    expect(done, "the load finishes").toMatchObject({ phase: "verifying", error: null });
    expect([...first.logs, ...second.logs].filter((line) => line === "load running"), "one copy ran it, once").toStrictEqual(["load running"]);
    expect((await documents(hypeReactions)).length, "every row once").toBe(reactions.length);
  });
});

describe("tables the data model doesn't own", () => {
  test("a retired table named like one of the service's own is archived verbatim, not loaded into it", async () => {
    const service = await copy();
    const retired = { _id: "r1", _creationTime: 1, oldField: "kept" };
    await finish(service, zip({ "files/documents.jsonl": jsonl([retired]), "archive/documents.jsonl": jsonl([{ ...retired, _id: "r2" }]) }));

    expect(await settled(service), "the load writes them").toMatchObject({ phase: "verifying", error: null });
    expect(await documents(files), "no stored file").toStrictEqual([]);
    expect(await documents(archive), "both archived").toStrictEqual([
      { source: "app", table: "files", _id: "r1", _creationTime: 1, document: retired },
      { source: "app", table: "archive", _id: "r2", _creationTime: 1, document: { ...retired, _id: "r2" } },
    ]);
  });

  test("a component's file bytes count toward the batch limit as the archive stores them", async () => {
    const bytes = randomBytes(3000);
    const stored = (id: string, sha256: string): Doc => ({ _id: id, _creationTime: 1, sha256, size: 3000n, contentType: null, internalId: `i-${id}` });
    // Raw, the first file fits the 3600-byte batch; as the archive stores it, in base64, it doesn't, so it commits alone.
    const service = await copy({ bytes: 3600 });
    await finish(
      service,
      zip({
        "_components/c1/_storage/documents.jsonl": jsonl([stored("f1", createHash("sha256").update(bytes).digest("base64")), stored("f2", "AAAA")]),
        "_components/c1/_storage/f1": bytes,
        "_components/c1/_storage/f2": bytes,
      }),
    );

    const stopped = await settled(service);
    expect(stopped.error, "the second file stops the load").toBe("Stored file f2 doesn't match its size or sha256");
    expect(stopped.entries, "the first file committed before it").toStrictEqual([{ entry: "_components/c1/_storage/documents.jsonl", lines: 1, done: false }]);
  });
});

describe("what stops a load", () => {
  const stops = async (entries: Record<string, string>) => {
    const service = await copy();
    await finish(service, zip(entries));
    return settled(service);
  };

  test("a NUL character in any string, which Postgres can't store", async () => {
    const stopped = await stops({ "kudosMessages/documents.jsonl": jsonl([message("k1", { annotations: { "a\u0000": "b" } })]) });
    expect(stopped, "the load stops at the line").toMatchObject({ phase: "loading", error: "kudosMessages/documents.jsonl line 1: a string holds a NUL character, which Postgres can't store" });
  });

  test("an index key past Postgres's B-tree limit, named by table and ID", async () => {
    const stopped = await stops({ "hypeReactions/documents.jsonl": jsonl([reaction("h1"), reaction("h2", { giver: randomBytes(4000).toString("base64") })]) });
    expect(stopped.error, "the load names the row").toMatch(/^hypeReactions h2: index row size \d+ exceeds btree version \d maximum \d+ for index "hypeReactions_by_giver/);
    expect(await documents(hypeReactions), "the batch that held it is not written").toStrictEqual([]);
  });

  test("a value of another kind than its column's", async () => {
    const stopped = await stops({ "hypeReactions/documents.jsonl": jsonl([reaction("h1", { at: "five" })]) });
    expect(stopped.error, "the load names the field").toBe("hypeReactions h1: at holds a string, its column takes a number");
  });

  test("a table the inventory lists without documents, and an entry the loader doesn't know", async () => {
    expect((await stops({ "_tables/documents.jsonl": jsonl([{ name: "members", id: 10001n }]) })).error, "a missing table").toBe(
      "The snapshot lists table members but has no documents for it",
    );
    await copies[0]!.request("/admin/load/reset", { method: "POST" });
    expect((await stops({ "notes.txt": "hello" })).error, "an unknown entry").toBe("The snapshot has an entry the loader doesn't know: notes.txt");
  });

  test("a stored file larger than the loader takes, before it is read", async () => {
    const big = Buffer.alloc(maxFileBytes + 1);
    const doc: Doc = { _id: "st1", _creationTime: 1, sha256: "x", size: BigInt(big.length), contentType: null, internalId: "i1" };
    const service = await copy();
    await finish(service, zip({ "_storage/documents.jsonl": jsonl([doc]), "_storage/st1": big }));
    expect((await settled(service)).error, "too large").toBe(`Stored file st1 is larger than the loader takes (${maxFileBytes} bytes)`);
  });

  test("a stored file whose bytes don't match its document", async () => {
    const doc: Doc = { _id: "st1", _creationTime: 1, sha256: "AAAA", size: 3n, contentType: null, internalId: "i1" };
    expect((await stops({ "_storage/documents.jsonl": jsonl([doc]), "_storage/st1": "abc" })).error, "a bad hash").toBe(
      "Stored file st1 doesn't match its size or sha256",
    );
  });
});

describe("the admin path and the hold", () => {
  test("without a token there is no admin path and no hold", async () => {
    const service = await copy({ adminToken: undefined });
    expect((await service.request("/admin/load")).status, "no admin path").toBe(404);
    expect((await service.request("/anything", { token: null })).status, "the app serves").toBe(404);
  });

  test("with a token the app holds before any load, and the admin path wants the token", async () => {
    const service = await copy();
    expect((await service.request("/anything", { token: null })).status, "held before a load").toBe(503);
    expect((await service.request("/admin/load", { token: null })).status, "no token").toBe(401);
    expect((await service.request("/admin/load", { token: "wrong" })).status, "a wrong token").toBe(401);
    expect(await status(service), "nothing staged yet").toMatchObject({ phase: "none", stagedChunks: 0 });
  });

  test("it loads only into an empty database", async () => {
    await db.insert(members).values(fromDocument(members, { _id: "m1", _creationTime: 1, workspace: "T1", user: "U1", kind: "member" }) as typeof members.$inferInsert);
    const service = await copy();
    const response = await service.request("/admin/load?chunk=0", { method: "POST", body: "zip" });
    expect(response.status, "refused").toBe(409);
  });

  test("a chunk sent again with the same bytes is a no-op, with other bytes refused; finish checks the chunks and the whole", async () => {
    const service = await copy();
    const send = (body: string) => service.request("/admin/load?chunk=0", { method: "POST", body });
    expect((await send("one")).status, "first send").toBe(200);
    expect((await send("one")).status, "the same bytes again").toBe(200);
    expect((await send("two")).status, "other bytes").toBe(409);
    const finishWith = (chunks: number, sha256: string) => service.request("/admin/load/finish", { method: "POST", body: JSON.stringify({ chunks, sha256 }) });
    expect((await finishWith(2, "x")).status, "a missing chunk").toBe(409);

    expect((await finishWith(1, "0".repeat(64))).status, "the chunks are all there").toBe(202);
    expect(await settled(service), "the load checks the whole before it writes").toMatchObject({
      phase: "loading",
      error: "The staged chunks don't match the sha256 sent with finish",
      entries: [],
    });
  });

  test("a reset before the load is done empties every table it wrote, and the load can start over", async () => {
    const service = await copy();
    await finish(service, zip({ "hypeReactions/documents.jsonl": jsonl([reaction("h1"), reaction("h2", { at: "x" })]) }));
    await settled(service);

    const reset = await service.request("/admin/load/reset", { method: "POST" });
    expect(reset.status, "reset").toBe(200);
    expect(await status(service), "nothing left, back to staging").toMatchObject({ phase: "staging", error: null, stagedChunks: 0, entries: [] });
    expect((await copy({ adminToken: undefined })).load.held(), "a copy without the token still holds after the reset").toBe(true);
    await finish(service, zip({ "hypeReactions/documents.jsonl": jsonl([reaction("h1")]) }));
    expect(await settled(service), "a new load").toMatchObject({ phase: "verifying", error: null });
  });

  test("a stopped load resumes from its checkpoint when finished again, and only with its own snapshot", async () => {
    const service = await copy({ rows: 1 });
    const archive = zip({ "hypeReactions/documents.jsonl": jsonl([reaction("h1"), reaction("h2", { at: "x" })]) });
    await finish(service, archive);
    const stopped = await settled(service);
    const sha256 = createHash("sha256").update(archive).digest("hex");

    const other = await service.request("/admin/load/finish", { method: "POST", body: JSON.stringify({ chunks: 3, sha256: "f".repeat(64) }) });
    expect(other.status, "another snapshot can't resume it").toBe(409);
    const again = await service.request("/admin/load/finish", { method: "POST", body: JSON.stringify({ chunks: 3, sha256 }) });
    expect(again.status, "the same snapshot resumes it").toBe(202);
    const resumed = await settled(service);

    expect(resumed.error, "it stops on the same row, not on h1 written twice").toBe(stopped.error);
    expect(resumed.entries, "from the checkpoint").toStrictEqual([{ entry: "hypeReactions/documents.jsonl", lines: 1, done: false }]);
    expect((await documents(hypeReactions)).map((doc) => doc._id), "h1 once").toStrictEqual(["h1"]);
  });

  test("a copy that was serving holds once another copy starts a load", async () => {
    const serving = await copy({ adminToken: undefined });
    expect((await serving.request("/anything", { token: null })).status, "serving before").toBe(404);
    const loading = await copy();
    await loading.request("/admin/load?chunk=0", { method: "POST", body: "zip" });

    await waitFor(async () => (await serving.request("/anything", { token: null })).status === 503);
  });

  test("the hold wins over HEDGEHUG_OFF: Slack hears 503, not an acknowledgement", async () => {
    const service = await copy({ off: true });
    const slack = await service.request("/slack/events", { method: "POST", body: "{}", token: null });
    expect(slack.status, "Slack while held and off").toBe(503);
  });

  test("before the migrations are done the hold wins over HEDGEHUG_OFF too, and without a hold Slack is acknowledged", async () => {
    const held = await copy({ off: true, migrations: "pending" });
    expect((await held.request("/slack/events", { method: "POST", body: "{}", token: null })).status, "Slack while held, off and migrating").toBe(503);
    expect((await held.request("/admin/load", { token })).status, "the admin path waits for the migrations").toBe(503);

    const free = await copy({ adminToken: undefined, off: true, migrations: "pending" });
    expect((await free.request("/slack/events", { method: "POST", body: "{}", token: null })).status, "Slack while off and migrating").toBe(200);
  });

  test("a database the migrations haven't reached holds only for a copy with the token", async () => {
    const schema = `load_fresh_${process.env.VITEST_POOL_ID ?? "0"}`;
    const admin = new pg.Client({ connectionString: inject("databaseUrl") });
    await admin.connect();
    await admin.query(`drop schema if exists "${schema}" cascade; create schema "${schema}"`);
    await admin.end();
    const pool = createPool(withSearchPath(inject("databaseUrl"), schema));
    try {
      const log: Log = { info: () => {}, error: () => {} };
      const without = createLoadControl({ pool, token: undefined, log });
      await without.refresh();
      expect(without.held(), "no token, no load table").toBe(false);
      const withToken = createLoadControl({ pool, token, log });
      await withToken.refresh();
      expect(withToken.held(), "the token, no load table").toBe(true);
    } finally {
      await pool.end();
    }
  });

  test("the hold outlives a restart, token or not, and a finished load refuses its token", async () => {
    const service = await copy();
    await finish(service, zip({ "hypeReactions/documents.jsonl": jsonl([reaction("h1")]) }));
    await settled(service);
    const restarted = await copy({ adminToken: undefined });
    expect(restarted.load.held(), "a copy without the token still holds while the load is not done").toBe(true);

    await database.pool.query(`update "loadState" set phase = 'done'`);
    await restarted.load.refresh();
    expect((await restarted.request("/anything", { token: null })).status, "done releases the hold").toBe(404);
    expect((await service.request("/admin/load?chunk=0", { method: "POST", body: "zip" })).status, "the token that finished").toBe(409);
    expect((await service.request("/admin/load/reset", { method: "POST" })).status, "no reset after done").toBe(409);
    expect((await service.request("/admin/load")).status, "progress still answers").toBe(200);
  });
});

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 500; tries++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out");
}

/** The load's advisory lock key, split as pg_locks shows a bigint key. */
function lockParts(schema: string): [number, number] {
  const key = createHash("sha256").update(`hedgehug load ${schema}`).digest();
  return [key.readUInt32BE(0), key.readUInt32BE(4)];
}

function bufferOf(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
