import { createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterEach, describe, expect, inject, test } from "vitest";
import { chunksOf, zip } from "../../testing/zip.ts";
import { useTestDatabase, withSearchPath } from "../../testing/database.ts";
import { decodeStored, encodeStored, printExport, type Value } from "../db/codec.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import { albumHistory, archive, files, hypeReactions, kudosMessages, members, wordDeletionRequests } from "../db/schema/index.ts";
import { eq } from "drizzle-orm";
import { createPool } from "../db/pool.ts";
import { createApp, type Migrations } from "../http/app.ts";
import { createClock } from "../clock.ts";
import { createOperations } from "../operations.ts";
import type { Log } from "../log.ts";
import { createLoadControl, type LoadControl } from "./control.ts";
import { maxFileBytes } from "./loader.ts";
import { z } from "zod";
import { actionJob, jobRegistry, mutationJob, type JobRegistry } from "../jobs/define.ts";
import { sweepJob as unlocksSweep } from "../unlocks/sweep.ts";
import { sweepJob as newWeekSweep } from "../quests/newWeek.ts";
import { recheckSomeoneNewJob } from "../quests/journey.ts";
import { ensureMondayDmsJob } from "../mondayDm/mondayDm.ts";
import { ensureMondayDmsOfHugWeeksJob } from "../mondayDm/hugWeeks.ts";
import { republishAdminsInJob } from "../feedback/homes.ts";
import { nudgeTheHuggedJob } from "../feedback/welcomeNudge.ts";
import { payHugPeopleJob } from "../hugs/people.ts";
import { catchUpJob } from "../analytics/person.map.ts";
import { backfillWordsJob } from "../slack/backfill.ts";
import { tellBatchSummariesJob } from "../feedback/tierNotices.ts";
import { forgetWorkspaceWordsJob } from "../engine/kudosText.ts";
import { recordMilestonesInWorkspaceJob } from "../album/milestones.ts";
import { fillItemsJob } from "../album/items/fill.ts";
import { listSlackMembersJob } from "../slack/directory.ts";
import { argRestarts } from "./restarts.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const token = "a-load-token";
/** The jobs recovery maps scheduled functions to, as the registry hands them to the load. */
const jobs = jobRegistry([
  mutationJob("slack.delivery.sendReply", z.strictObject({ attempt: z.bigint() }), async () => {}),
  actionJob("slack.delivery.send", z.strictObject({ text: z.string() }), async () => {}),
]);

type Doc = { [field: string]: Value };
const printStored = (doc: Doc) => encodeStored(doc).replaceAll("'", "''");
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
  options: { adminToken?: string | undefined; rows?: number; bytes?: number; off?: boolean; migrations?: Migrations; registry?: JobRegistry } = {},
): Promise<Copy> {
  const { rows = 500, bytes = 1 << 20, off = false, migrations = "done", registry = jobs } = options;
  const adminToken = "adminToken" in options ? options.adminToken : token;
  const logs: string[] = [];
  const log: Log = { info: (message) => logs.push(message), error: (message) => logs.push(message) };
  const load = createLoadControl({ pool: database.pool, token: adminToken, log, jobs: registry, limits: { rows, bytes }, pollMs: 50 });
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
  roundTrip: { equal: boolean; tables: Array<{ table: string; snapshot: { rows: number; hash: string }; copy: { rows: number; hash: string }; equal: boolean }> } | null;
}

async function status(service: Copy): Promise<Status> {
  return (await (await service.request("/admin/load")).json()) as Status;
}

/** Waits until the load is written, round-tripped and recovered, or stops on an error. */
async function settled(service: Copy): Promise<Status> {
  for (let tries = 0; tries < 600; tries++) {
    const now = await status(service);
    if ((now.phase !== "loading" && now.phase !== "verifying" && now.phase !== "recovering") || now.error !== null) return now;
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

    expect(done, "the load wrote every entry, its round trip is equal, and recovery is next").toMatchObject({ phase: "done", error: null });
    expect(
      done.roundTrip?.tables.map(({ table, snapshot, copy, equal }) => [table, snapshot.rows, copy.rows, equal]),
      "every table and each namespace's files, counted on both sides",
    ).toStrictEqual([
      ["_components/app/hypeReactions", 1, 1, true],
      ["_components/posthog/_storage", 1, 1, true],
      ["_components/posthog/_storage/files", 1, 1, true],
      ["_components/posthog/flags", 1, 1, true],
      ["_scheduled_functions", 1, 1, true],
      ["_storage", 2, 2, true],
      ["_storage/files", 2, 2, true],
      ["authAccounts", 1, 1, true],
      ["hypeReactions", 3, 3, true],
      ["kudosMessages", 2, 2, true],
      ["retiredTable", 1, 1, true],
      ["wordDeletionRequests", 2, 2, true],
    ]);
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
    expect((await service.request("/anything", { token: null })).status, "recovered, the load is done and the app serves").toBe(404);
  });

  test("a row written after the load sorts after every loaded row, though its runner's clock is behind them", async () => {
    // Convex's stamps from later than the runner's clock, in a data-model table and in an archived one.
    const latest = 1_900_000_000_000.25;
    const deletions: Doc[] = [
      { _id: "w1", _creationTime: 1_800_000_000_000, workspace: "T1", author: null },
      { _id: "w2", _creationTime: latest - 1, workspace: "T1", author: "U2" },
    ];
    const retired: Doc = { _id: "r1", _creationTime: latest, kept: true };
    const archive = zip({
      "_tables/documents.jsonl": jsonl([
        { name: "wordDeletionRequests", id: 10001n },
        { name: "retiredTable", id: 10002n },
      ]),
      "wordDeletionRequests/documents.jsonl": jsonl(deletions),
      "retiredTable/documents.jsonl": jsonl([retired]),
    });
    const service = await copy();

    expect((await finish(service, archive)).status).toBe(202);
    expect(await settled(service), "loaded").toMatchObject({ phase: "done", error: null });

    const behind = createOperations({ pool: database.pool, clock: createClock({ real: () => 1_700_000_000_000 }), log: { info: () => {}, error: () => {} } });
    const stamp = await behind.mutation("write after the load", async ({ newRow }) => newRow()._creationTime);
    expect(stamp, "after the newest loaded row, archived ones included").toBeGreaterThan(latest);
    expect(stamp - latest, "just after it").toBeLessThan(1);
    expect(await documents(wordDeletionRequests), "the loaded rows keep their stamps").toStrictEqual(deletions);
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

    expect(done, "the load finishes").toMatchObject({ phase: "done", error: null });
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

    expect(done, "the load finishes").toMatchObject({ phase: "done", error: null });
    expect([...first.logs, ...second.logs].filter((line) => line === "load running"), "one copy ran it, once").toStrictEqual(["load running"]);
    expect((await documents(hypeReactions)).length, "every row once").toBe(reactions.length);
  });
});

describe("the round trip", () => {
  test("a copy that differs from its snapshot fails it, named by table and never by content", async () => {
    const asset = Buffer.from("<svg/>");
    const sha256 = createHash("sha256").update(asset).digest("base64");
    const stored = (id: string): Doc => ({ _id: id, _creationTime: 1, sha256, size: BigInt(asset.length), contentType: null, internalId: `i-${id}` });
    const service = await copy();
    await finish(
      service,
      zip({
        "hypeReactions/documents.jsonl": jsonl([reaction("h1"), reaction("h2")]),
        "kudosMessages/documents.jsonl": jsonl([message("k1")]),
        "_storage/documents.jsonl": jsonl([stored("st1")]),
        "_storage/st1": asset,
        "_components/c1/_storage/documents.jsonl": jsonl([stored("cs1")]),
        "_components/c1/_storage/cs1": asset,
      }),
    );
    expect(await settled(service), "the untouched copy is equal").toMatchObject({ phase: "done", roundTrip: { equal: true } });

    // The copy drifts from the snapshot, then the load is back at its round trip, as after a restart while verifying.
    await database.pool.query(`update "hypeReactions" set emoji = 'a-secret-emoji' where _id = 'h1'`);
    await database.pool.query(`update files set bytes = '\\x00'`);
    await database.pool.query(`update archive set document = '{"_id":"cs1","_creationTime":1,"bytes":{"$bytes":"AA=="}}' where "table" = '_storage/bytes'`);
    await database.pool.query(`update "loadState" set phase = 'verifying', "roundTrip" = null`);
    await waitFor(async () => (await status(service)).error !== null);

    const failed = await status(service);
    expect(failed, "the load stops before recovery").toMatchObject({
      phase: "verifying",
      error: "The round trip differs on _components/c1/_storage/files, _storage/files, hypeReactions",
    });
    expect(
      failed.roundTrip?.tables.filter((table) => !table.equal).map(({ table, snapshot, copy }) => [table, snapshot.rows, copy.rows]),
      "each differing table, with its counts",
    ).toStrictEqual([
      ["_components/c1/_storage/files", 1, 1],
      ["_storage/files", 1, 1],
      ["hypeReactions", 2, 2],
    ]);
    expect(JSON.stringify(failed), "no row content").not.toMatch(/a-secret-emoji|tada|svg/);
    expect((await service.request("/anything", { token: null })).status, "the app still holds").toBe(503);
  });

  /** Sends the load back to its round trip, as after a restart while verifying, and waits for the answer. */
  const reverify = async (service: Copy): Promise<Status> => {
    await database.pool.query(`update "loadState" set phase = 'verifying', "roundTrip" = null, error = null`);
    await service.load.refresh(); // a copy stops reading the state once the load is done
    // Settled, not only answered: an equal round trip goes on into recovery, which must end before the test changes more.
    await waitFor(async () => (await status(service)).roundTrip !== null);
    return settled(service);
  };
  const differing = (answer: Status) => answer.roundTrip?.tables.filter((table) => !table.equal).map((table) => table.table);

  test("each stored file's metadata in files counts, not only its bytes", async () => {
    const asset = Buffer.from("<svg/>");
    const doc: Doc = { _id: "st1", _creationTime: 1, sha256: createHash("sha256").update(asset).digest("base64"), size: BigInt(asset.length), contentType: "image/svg+xml", internalId: "i1" };
    const service = await copy();
    await finish(service, zip({ "_storage/documents.jsonl": jsonl([doc]), "_storage/st1": asset }));
    expect(await settled(service), "equal as loaded").toMatchObject({ phase: "done" });

    for (const change of [`size = 7`, `"contentType" = 'text/plain'`, `"contentType" = null`, `sha256 = 'AAAA'`, `"_creationTime" = 2`]) {
      await database.pool.query(`update files set ${change}`);
      expect(differing(await reverify(service)), change).toStrictEqual(["_storage/files"]);
      await database.pool.query(`delete from files`);
      await database.pool.query(`insert into files ("_id", "_creationTime", sha256, size, "contentType", bytes) values ('st1', 1, $1, $2, 'image/svg+xml', $3)`, [doc.sha256, asset.length, asset]);
    }
    expect(differing(await reverify(service)), "restored").toStrictEqual([]);
  });

  test("an archive row's key columns count, and so does any row in the service's own tables", async () => {
    const service = await copy();
    await finish(service, zip({ "authAccounts/documents.jsonl": jsonl([{ _id: "a1", _creationTime: 5, provider: "slack" }]) }));
    await settled(service);

    await database.pool.query(`update archive set "_id" = 'a2'`);
    expect(differing(await reverify(service)), "the archive's _id column").toStrictEqual(["authAccounts"]);
    await database.pool.query(`update archive set "_id" = 'a1', "_creationTime" = 6`);
    expect(differing(await reverify(service)), "the archive's _creationTime column").toStrictEqual(["authAccounts"]);
    await database.pool.query(`update archive set "_creationTime" = 5`);
    await database.pool.query(`insert into crons (id, "nextRun") values ('a-cron', 1)`);
    const answer = await reverify(service);
    expect(differing(answer), "a service table that should be empty").toStrictEqual(["(service) crons"]);
    expect(answer.error, "named in the stop").toBe("The round trip differs on (service) crons");
  });

  test("an empty table is answered with its zero counts, and stored bytes without a document count as a file the copy lacks", async () => {
    const service = await copy();
    await finish(service, zip({ "hypeReactions/documents.jsonl": "", "_storage/documents.jsonl": "", "_storage/st9": "orphan" }));
    const answer = await settled(service);

    expect(
      answer.roundTrip?.tables.map(({ table, snapshot, copy, equal }) => [table, snapshot.rows, copy.rows, equal]),
      "every table of the snapshot is answered",
    ).toStrictEqual([
      ["_storage", 0, 0, true],
      ["_storage/files", 1, 0, false],
      ["hypeReactions", 0, 0, true],
    ]);
  });

  test("a NaN with its own sign or payload equals the one NaN the copy keeps", async () => {
    // Convex's export keeps a NaN's bits; the stored form keeps one NaN on purpose, in a column or an archived document.
    const nan = Buffer.from("010000000000f8ff", "hex").toString("base64");
    const at = printExport(reaction("h1")).replace(/"at":[^,}]+/, `"at":{"$float":"${nan}"}`);
    const service = await copy();
    await finish(service, zip({ "hypeReactions/documents.jsonl": `${at}\n`, "retired/documents.jsonl": `{"_id":"r1","_creationTime":1.0,"n":{"$float":"${nan}"}}\n` }));
    expect(await settled(service), "both tables are equal").toMatchObject({ phase: "done", roundTrip: { equal: true } });
  });

  test("a database migrated before the round trip's column still reads the load's state", async () => {
    const schema = `load_older_${process.env.VITEST_POOL_ID ?? "0"}`;
    const admin = new pg.Client({ connectionString: inject("databaseUrl") });
    await admin.connect();
    await admin.query(`drop schema if exists "${schema}" cascade; create schema "${schema}"`);
    await admin.query(`create table "${schema}"."loadState" (key text primary key, phase text not null, "tokenHash" text not null, chunks integer, sha256 text, error text)`);
    await admin.query(`insert into "${schema}"."loadState" values ('load', 'loading', 'x', 3, 'y', null)`);
    await admin.end();
    const pool = createPool(withSearchPath(inject("databaseUrl"), schema));
    try {
      const load = createLoadControl({ pool, token: undefined, log: { info: () => {}, error: () => {} }, jobs });
      await load.refresh();
      expect(load.held(), "a load is under way, so the copy holds while it migrates").toBe(true);
    } finally {
      await pool.end();
    }
  });

  test("where a row is stored and under which key counts, not only its document", async () => {
    const asset = Buffer.from("<svg/>");
    const stored: Doc = { _id: "cs1", _creationTime: 1, sha256: createHash("sha256").update(asset).digest("base64"), size: BigInt(asset.length), contentType: null, internalId: "i1" };
    const service = await copy();
    await finish(
      service,
      zip({
        "hypeReactions/documents.jsonl": jsonl([reaction("h1")]),
        "authAccounts/documents.jsonl": jsonl([{ _id: "a1", _creationTime: 5, archiveKey: ["a2", 6] }]),
        "_components/c1/flags/documents.jsonl": jsonl([{ _id: "f1", _creationTime: 1 }]),
        "_components/c1/_storage/documents.jsonl": jsonl([stored]),
        "_components/c1/_storage/cs1": asset,
      }),
    );
    expect(await settled(service), "equal as loaded").toMatchObject({ phase: "done" });
    const changes: Array<[string, string, string]> = [
      [`delete from "hypeReactions"; insert into archive select 'app', 'hypeReactions', a._id, a."_creationTime", a.document from (select '${reaction("h1")._id}' as _id, 1700000000001::float8 as "_creationTime", '${printStored(reaction("h1"))}'::jsonb as document) a`, "hypeReactions", "a live row moved into the archive"],
      [`update archive set "_id" = 'a2', "_creationTime" = 6 where "table" = 'authAccounts'`, "authAccounts", "keys changed to what a field of the document holds"],
      [`update archive set source = '_components', "table" = 'c1/flags' where "table" = 'flags'`, "_components/c1/flags", "a source and table that flatten to the same path"],
      [`update archive set document = jsonb_set(document, '{_id}', '"cs2"') where "table" = '_storage/bytes'`, "_components/c1/_storage/files", "the _id inside a component's bytes document"],
      [`update archive set document = jsonb_set(document, '{_creationTime}', '2') where "table" = '_storage/bytes'`, "_components/c1/_storage/files", "the _creationTime inside it"],
      [`insert into files ("_id", "_creationTime", sha256, size, bytes) values ('', 1, 'x', 0, '')`, "_storage/files", "a file whose _id is empty"],
    ];
    const restore = await database.pool.query<{ source: string; table: string; _id: string; _creationTime: number; document: string }>("select * from archive");
    for (const [change, table, why] of changes) {
      await database.pool.query(change);
      expect(differing(await reverify(service)), why).toContain(table);
      await database.pool.query(`delete from archive; delete from files; delete from "hypeReactions"`);
      for (const row of restore.rows) {
        await database.pool.query(`insert into archive values ($1, $2, $3, $4, $5)`, [row.source, row.table, row._id, row._creationTime, row.document]);
      }
      await db.insert(hypeReactions).values(fromDocument(hypeReactions, reaction("h1")) as never);
      expect(differing(await reverify(service)), `restored after: ${why}`).toStrictEqual([]);
    }
  });

  test("a row missing from the copy, or one it gained, counts on its table", async () => {
    const service = await copy();
    await finish(service, zip({ "hypeReactions/documents.jsonl": jsonl([reaction("h1"), reaction("h2")]) }));
    await settled(service);

    await database.pool.query(`delete from "hypeReactions" where _id = 'h2'`);
    await database.pool.query(`insert into archive (source, "table", _id, "_creationTime", document) values ('app', 'extra', 'x1', 1, '{"_id":"x1","_creationTime":1}')`);
    await database.pool.query(`update "loadState" set phase = 'verifying', "roundTrip" = null`);
    await waitFor(async () => (await status(service)).error !== null);

    expect(
      (await status(service)).roundTrip?.tables.map(({ table, snapshot, copy, equal }) => [table, snapshot.rows, copy.rows, equal]),
      "the snapshot's and the copy's counts",
    ).toStrictEqual([
      ["extra", 0, 1, false],
      ["hypeReactions", 2, 1, false],
    ]);
  });
});

describe("tables the data model doesn't own", () => {
  test("a retired table named like one of the service's own is archived verbatim, not loaded into it", async () => {
    const service = await copy();
    const retired = { _id: "r1", _creationTime: 1, oldField: "kept" };
    await finish(
      service,
      zip({
        "files/documents.jsonl": jsonl([retired]),
        "archive/documents.jsonl": jsonl([{ ...retired, _id: "r2" }]),
        "jobs/documents.jsonl": jsonl([{ ...retired, _id: "r3" }]),
      }),
    );

    expect(await settled(service), "the load writes them").toMatchObject({ phase: "done", error: null });
    expect(await documents(files), "no stored file").toStrictEqual([]);
    expect(await documents(archive), "both archived").toStrictEqual([
      { source: "app", table: "files", _id: "r1", _creationTime: 1, document: retired },
      { source: "app", table: "archive", _id: "r2", _creationTime: 1, document: { ...retired, _id: "r2" } },
      { source: "app", table: "jobs", _id: "r3", _creationTime: 1, document: { ...retired, _id: "r3" } },
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

describe("recovery", () => {
  const scheduled = (_id: string, name: string, state: Doc, args: Doc = {}, extra: Doc = {}): Doc => ({ _id, _creationTime: 7, name, args: [args], scheduledTime: 1_000, state, ...extra });
  const jobsNow = async () =>
    (await database.pool.query(`select _id, "_creationTime", name, args, "runAt", kind, state, error, "completedAt", "sweptAt" from jobs order by _id`)).rows.map((row) => ({
      ...row,
      args: decodeStored(row.args),
    }));

  test("every scheduled function becomes a job with its state, and done lifts the hold", async () => {
    const service = await copy();
    await finish(
      service,
      zip({
        "_scheduled_functions/documents.jsonl": jsonl([
          scheduled("j1", "slack/delivery:sendReply", { kind: "pending" }, { attempt: 3n }),
          scheduled("j2", "slack/delivery.js:sendReply", { kind: "inProgress" }, { attempt: 1n }),
          scheduled("j3", "slack/delivery:send", { kind: "inProgress" }, { text: "hi" }),
          scheduled("j4", "slack/delivery:send", { kind: "success" }, { text: "hi" }, { completedTime: 2_000 }),
          scheduled("j5", "slack/delivery:send", { kind: "failed", error: "Slack said no" }, { text: "hi" }, { completedTime: 2_000 }),
          scheduled("j6", "slack/delivery:sendReply", { kind: "canceled" }, { attempt: 1n }, { completedTime: 2_000 }),
        ]),
        "_components/posthog/_scheduled_functions/documents.jsonl": jsonl([scheduled("j7", "lib:refreshLoop", { kind: "pending" })]),
      }),
    );
    expect(await settled(service), "the load is done").toMatchObject({ phase: "done", error: null });

    const jobs = await jobsNow();
    const kept = { _creationTime: 7, runAt: 1_000 };
    // A job Convex failed arrives swept: Convex's sweep reported it. An action the move fails arrives unswept: nobody has
    // seen that failure yet, so the service's sweep reports it once.
    expect(jobs.map(({ completedAt, sweptAt, ...job }) => ({ ...job, completed: completedAt !== null, swept: sweptAt !== null }))).toStrictEqual([
      { ...kept, _id: "j1", name: "slack.delivery.sendReply", args: { attempt: 3n }, kind: "mutation", state: "pending", error: null, completed: false, swept: false },
      { ...kept, _id: "j2", name: "slack.delivery.sendReply", args: { attempt: 1n }, kind: "mutation", state: "pending", error: null, completed: false, swept: false },
      { ...kept, _id: "j3", name: "slack.delivery.send", args: { text: "hi" }, kind: "action", state: "failed", error: "Running when Convex stopped: an action runs at most once", completed: true, swept: false },
      { ...kept, _id: "j4", name: "slack.delivery.send", args: { text: "hi" }, kind: "action", state: "success", error: null, completed: true, swept: false },
      { ...kept, _id: "j5", name: "slack.delivery.send", args: { text: "hi" }, kind: "action", state: "failed", error: "Slack said no", completed: true, swept: true },
      { ...kept, _id: "j6", name: "slack.delivery.sendReply", args: { attempt: 1n }, kind: "mutation", state: "canceled", error: null, completed: true, swept: false },
      { ...kept, _id: "j7", name: "_components/posthog/lib.refreshLoop", args: {}, kind: "mutation", state: "canceled", error: "Retired at the move", completed: true, swept: false },
    ]);
    expect(jobs.find((job) => job._id === "j4")!.completedAt, "a finished job keeps when it finished").toBe(2_000);
    expect((await service.request("/anything", { token: null })).status, "done releases the hold").toBe(404);
  });

  test("a scheduled function no job or retirement maps blocks recovery, named with its count", async () => {
    const service = await copy();
    await finish(
      service,
      zip({
        "_scheduled_functions/documents.jsonl": jsonl([
          scheduled("j1", "old/gone:fn", { kind: "success" }),
          scheduled("j2", "old/gone:fn", { kind: "pending" }),
          scheduled("j3", "slack/delivery:sendReply", { kind: "pending" }, { attempt: 1n }),
        ]),
        "_components/c1/_scheduled_functions/documents.jsonl": jsonl([scheduled("j4", "lib:tick", { kind: "pending" })]),
      }),
    );
    expect(await settled(service), "recovery stops").toMatchObject({
      phase: "recovering",
      error: "Recovery found scheduled functions no job or retirement maps: _components/c1/lib.tick (1), old.gone.fn (2)",
    });
    expect(await jobsNow(), "nothing is written").toStrictEqual([]);
    expect((await service.request("/anything", { token: null })).status, "the app still holds").toBe(503);
  });

  test("pending args that don't match their job's schema block recovery, by ID and field, never by value", async () => {
    const service = await copy();
    await finish(
      service,
      zip({
        "_scheduled_functions/documents.jsonl": jsonl([
          scheduled("j1", "slack/delivery:sendReply", { kind: "pending" }, { attempt: "a-secret" }),
          scheduled("j2", "slack/delivery:sendReply", { kind: "success" }, { attempt: "finished, not checked" }),
          { _id: "j3", _creationTime: 7, name: "slack/delivery:sendReply", args: [], scheduledTime: 1_000, state: { kind: "pending" } },
        ]),
      }),
    );
    const stopped = await settled(service);
    expect(stopped, "recovery stops").toMatchObject({
      phase: "recovering",
      error: "Recovery found pending args their job refuses: j1 slack.delivery.sendReply (attempt: invalid_type), j3 slack.delivery.sendReply (args: not one object)",
    });
    expect(JSON.stringify(stopped)).not.toContain("a-secret");
    expect(await jobsNow(), "nothing is written").toStrictEqual([]);
  });

  test("flag definitions are seeded from the PostHog component's own", async () => {
    const definitions = { flags: [{ key: "a-flag", active: true, filters: { groups: [{ properties: [{ key: "$device_id", value: "x" }] }] } }], groupTypeMapping: {}, cohorts: {} };
    const service = await copy();
    await finish(
      service,
      zip({ "_components/posthog/flagDefinitions/documents.jsonl": jsonl([{ _id: "d1", _creationTime: 5, data: JSON.stringify(definitions), fetchedAt: 6_000, etag: "e1" }]) }),
    );
    expect(await settled(service), "the load is done").toMatchObject({ phase: "done", error: null });
    const rows = (await database.pool.query(`select key, definitions, "fetchedAt" from "flagDefinitions"`)).rows;
    expect(rows.map((row) => ({ ...row, definitions: JSON.parse(row.definitions) })), "the one row, as the component kept it").toStrictEqual([
      { key: "posthog", definitions, fetchedAt: 6_000 },
    ]);
  });

  test("each workflow carrying a Convex paging cursor starts over, in its args and in its row; other cursors stay", async () => {
    const ref = { workspace: "T1", conversation: "C1", message: "1.0" };
    const hug = { type: "hugGiven", workspace: "T1", giver: "m1", message: ref, onKudos: true, at: 5, day: "2026-11-09" };
    // Each restarted workflow's args as Convex scheduled them, mid-run, and as the job runs them after the move.
    const fixtures: Array<[string, Doc, Doc]> = [
      ["unlocks.sweep.sweep", { cursor: "convex-c" }, {}],
      ["quests.newWeek.sweep", { cursor: "convex-c" }, {}],
      ["quests.journey.recheckSomeoneNew", { event: { type: "memberLeft", workspace: "T1", member: "m1", at: 5 }, cursor: "convex-c" }, { event: { type: "memberLeft", workspace: "T1", member: "m1", at: 5 } }],
      ["mondayDm.mondayDm.ensureMondayDms", { cursor: "convex-c" }, {}],
      ["mondayDm.hugWeeks.ensureMondayDmsOfHugWeeks", { cursor: "convex-c" }, {}],
      ["feedback.homes.republishAdminsIn", { workspace: "T1", cursor: "convex-c" }, { workspace: "T1" }],
      ["feedback.welcomeNudge.nudgeTheHugged", { event: hug, cursor: "convex-c" }, { event: hug }],
      ["hugs.people.payHugPeople", { event: hug, cursor: "convex-c" }, { event: hug }],
      ["analytics.person.catchUp", { cursor: "convex-c" }, {}],
      ["slack.backfill.backfillWords", { cursor: "convex-c", queue: [ref] }, { queue: [ref] }],
      ["feedback.tierNotices.tellBatchSummaries", { batch: "b1", cursor: "convex-c" }, { batch: "b1", cursor: null }],
      ["engine.kudosText.forgetWorkspaceWords", { workspace: "T1", cursor: "convex-c" }, { workspace: "T1", cursor: null }],
      ["album.milestones.recordMilestonesInWorkspace", { workspace: "T1", cursor: "convex-c" }, { workspace: "T1", cursor: null }],
      ["album.items.fill.fillItems", { step: { member: "m1", kind: "packs", cursor: "convex-c" } }, { step: { member: "m1", kind: "packs" } }],
    ];
    expect(fixtures.map(([name]) => name).sort(), "a fixture for every restarted workflow").toStrictEqual([...argRestarts.keys()].sort());
    const kept: Array<[string, Doc]> = [["slack.directory.listSlackMembers", { cursor: "a-slack-cursor" }]];
    const path = (name: string) => `${name.split(".").slice(0, -1).join("/")}:${name.split(".").at(-1)}`;
    const rows = [...fixtures.map(([name, args]) => [name, args] as const), ...kept].map(([name, args], at) => scheduled(`j${String(at).padStart(2, "0")}`, path(name), { kind: "pending" }, args));

    // The jobs as their modules define them, schemas and all; not every domain registers its jobs yet.
    const workflows = [unlocksSweep, newWeekSweep, recheckSomeoneNewJob, ensureMondayDmsJob, ensureMondayDmsOfHugWeeksJob, republishAdminsInJob, nudgeTheHuggedJob, payHugPeopleJob];
    const more = [catchUpJob, backfillWordsJob, tellBatchSummariesJob, forgetWorkspaceWordsJob, recordMilestonesInWorkspaceJob, fillItemsJob, listSlackMembersJob];
    const service = await copy({ registry: jobRegistry([...workflows, ...more]) });
    await finish(
      service,
      zip({
        "_scheduled_functions/documents.jsonl": jsonl(rows),
        "effectsBackfill/documents.jsonl": jsonl([
          { _id: "e1", _creationTime: 1, before: 100, cursor: "convex-c", isDone: false },
          { _id: "e2", _creationTime: 2, before: 100, cursor: "convex-c", isDone: true },
        ]),
        "stickerBackfills/documents.jsonl": jsonl([{ _id: "s1", _creationTime: 1, workspace: "T1", cursor: "convex-c", isDone: false }]),
        "albumHistory/documents.jsonl": jsonl([{ _id: "a1", _creationTime: 1, workspace: "T1", startedAt: 3, phase: "hugs", cursor: "convex-c", hug: "h1", hugPeopleAfter: "m2", done: false }]),
        "bookReplays/documents.jsonl": jsonl([
          { _id: "r1", _creationTime: 1, workspace: "T1", batch: "b1", ladder: "generosity", tiers: [], countsLadder: true, isDone: false },
          { _id: "r2", _creationTime: 2, workspace: "T1", batch: "b1", ladder: "generosity", tiers: [], countsLadder: true, isDone: true },
        ]),
        "bookReplayCursors/documents.jsonl": jsonl([
          { _id: "c1", _creationTime: 1, replay: "r1", cursor: "convex-c" },
          { _id: "c2", _creationTime: 2, replay: "r2", cursor: "convex-c" },
        ]),
      }),
    );
    expect(await settled(service), "the load is done").toMatchObject({ phase: "done", error: null });

    const recovered = new Map((await jobsNow()).map((job) => [job.name as string, job.args]));
    for (const [name, , after] of fixtures) expect(recovered.get(name), name).toStrictEqual(after);
    expect(recovered.get("slack.directory.listSlackMembers"), "a Slack cursor stays").toStrictEqual({ cursor: "a-slack-cursor" });

    const cursorsOf = async (table: string) => (await database.pool.query(`select _id, cursor from "${table}" order by _id`)).rows.map((row) => [row._id, row.cursor]);
    expect(await cursorsOf("effectsBackfill"), "an unfinished run starts over, a finished one stays").toStrictEqual([["e1", null], ["e2", "convex-c"]]);
    expect(await cursorsOf("stickerBackfills")).toStrictEqual([["s1", null]]);
    expect((await documents(albumHistory))[0], "the history keeps its phase and inner bookmark").toMatchObject({ phase: "hugs", hug: "h1", hugPeopleAfter: "m2", done: false });
    expect(await cursorsOf("albumHistory")).toStrictEqual([["a1", null]]);
    expect(await cursorsOf("bookReplayCursors"), "an unfinished replay starts with no cursor row").toStrictEqual([["c2", "convex-c"]]);
    const archived = await db.select({ table: archive.table, document: archive.document }).from(archive).where(eq(archive.source, "recovery")).orderBy(archive.table, archive._id);
    expect(
      archived.map(({ table, document }) => [table, decodeStored(document)]),
      "each row recovery changed, kept whole as loaded",
    ).toStrictEqual([
      ["albumHistory", { _id: "a1", _creationTime: 1, workspace: "T1", startedAt: 3, phase: "hugs", cursor: "convex-c", hug: "h1", hugPeopleAfter: "m2", done: false }],
      ["bookReplayCursors", { _id: "c1", _creationTime: 1, replay: "r1", cursor: "convex-c" }],
      ["effectsBackfill", { _id: "e1", _creationTime: 1, before: 100, cursor: "convex-c", isDone: false }],
      ["stickerBackfills", { _id: "s1", _creationTime: 1, workspace: "T1", cursor: "convex-c", isDone: false }],
    ]);
  });

  test("more unfinished runs than one statement's parameters take restart all the same", async () => {
    const count = 13_200; // five archive columns a row: past Postgres's 65,535 parameters in one insert
    const rows = Array.from({ length: count }, (_, at): Doc => ({ _id: `s${String(at).padStart(5, "0")}`, _creationTime: 1, workspace: "T1", cursor: "convex-c", isDone: false }));
    const service = await copy();
    await finish(service, zip({ "stickerBackfills/documents.jsonl": jsonl(rows) }));
    expect(await settled(service), "the load is done").toMatchObject({ phase: "done", error: null });
    const counts = await database.pool.query(`select (select count(*)::int from "stickerBackfills" where cursor is null) as reset, (select count(*)::int from archive where source = 'recovery') as kept`);
    expect(counts.rows[0], "every run restarted, every one kept").toStrictEqual({ reset: count, kept: count });
   }, 120_000);

  test("flag definitions the evaluator can't read stop recovery, nested fields too", async () => {
    const service = await copy();
    const data = JSON.stringify({ flags: [null], groupTypeMapping: {}, cohorts: {} });
    await finish(service, zip({ "_components/posthog/flagDefinitions/documents.jsonl": jsonl([{ _id: "d1", _creationTime: 5, data, fetchedAt: 6_000 }]) }));
    expect(await settled(service), "recovery stops").toMatchObject({
      phase: "recovering",
      error: "Recovery found the PostHog component's flag definitions in a shape the evaluator doesn't take",
    });
  });

  test("a copy that finds a load recovering, as after a restart, finishes it", async () => {
    const service = await copy();
    await finish(service, zip({ "_scheduled_functions/documents.jsonl": jsonl([scheduled("j1", "old/gone:fn", { kind: "pending" })]) }));
    expect((await settled(service)).error, "stopped on the unmapped name").toMatch(/^Recovery found/);

    await database.pool.query(`update archive set document = jsonb_set(document, '{name}', '"slack/delivery:sendReply"') where _id = 'j1'`);
    await database.pool.query(`update archive set document = jsonb_set(document, '{args}', '[{"attempt": {"$integer": "AQAAAAAAAAA="}}]') where _id = 'j1'`);
    await database.pool.query(`update "loadState" set error = null`);
    await waitFor(async () => (await status(service)).phase === "done");
    expect((await jobsNow()).map((job) => [job._id, job.name, job.state]), "recovered").toStrictEqual([["j1", "slack.delivery.sendReply", "pending"]]);
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

  test("a _creationTime of -0, which Convex never stamps and the creation order doesn't place", async () => {
    const stopped = await stops({ "hypeReactions/documents.jsonl": jsonl([reaction("h1", { _creationTime: -0 })]) });
    expect(stopped, "the load stops at the line").toMatchObject({ phase: "loading", error: "hypeReactions/documents.jsonl line 1: a _creationTime of -0, which Convex never stamps" });
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

  test("stored bytes in a namespace without _storage documents", async () => {
    expect((await stops({ "_storage/f1": "orphan" })).error, "bytes the loader would drop").toBe("The snapshot has stored bytes without a _storage document: _storage/f1");
  });

  test("two stored bytes entries for one file, which the loader would read only one of", async () => {
    const doc: Doc = { _id: "st1", _creationTime: 1, sha256: createHash("sha256").update("abc").digest("base64"), size: 3n, contentType: null, internalId: "i1" };
    expect((await stops({ "_storage/documents.jsonl": jsonl([doc]), "_storage/st1.png": "lost", "_storage/st1.jpg": "abc" })).error, "in the app").toBe(
      "The snapshot has two stored bytes entries for file st1: _storage/st1.jpg and _storage/st1.png",
    );
    await copies[0]!.request("/admin/load/reset", { method: "POST" });
    expect((await stops({ "_components/c1/_storage/documents.jsonl": jsonl([doc]), "_components/c1/_storage/st1": "abc", "_components/c1/_storage/st1.txt": "lost" })).error, "in a component").toBe(
      "The snapshot has two stored bytes entries for file st1: _components/c1/_storage/st1 and _components/c1/_storage/st1.txt",
    );
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
    expect(await settled(service), "a new load").toMatchObject({ phase: "done", error: null });
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
      const without = createLoadControl({ pool, token: undefined, log, jobs });
      await without.refresh();
      expect(without.held(), "no token, no load table").toBe(false);
      const withToken = createLoadControl({ pool, token, log, jobs });
      await withToken.refresh();
      expect(withToken.held(), "the token, no load table").toBe(true);
    } finally {
      await pool.end();
    }
  });

  test("the hold outlives a restart, token or not, and a finished load refuses its token", async () => {
    const service = await copy();
    // A scheduled function nothing maps stops recovery, so the load is not done.
    await finish(service, zip({ "_scheduled_functions/documents.jsonl": jsonl([{ _id: "j1", _creationTime: 1, name: "old:gone", args: [{}], scheduledTime: 1, state: { kind: "pending" } }]) }));
    expect(await settled(service), "stopped in recovery").toMatchObject({ phase: "recovering" });
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
