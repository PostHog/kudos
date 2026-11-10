// The load's control: the hold, the one copy that owns a running load, and the `/admin/load` routes.
//
// The hold: once a load has started, until its phase is `done`, every app route answers 503 on every copy, across
// restarts; a reset keeps it. A deployment whose `HEDGEHUG_ADMIN_TOKEN` is set and that has never started a load
// holds too, so it serves nothing before its data arrives. A database that never saw a token or a load serves as
// usual. Each copy reads the load's state every `pollMs` until it is done, so a copy that was serving holds within
// that time once another copy starts a load; a load starts only into empty tables, so nothing it could serve is lost.
//
// Every change of phase happens in a transaction that locks the state row, so staging, finish and reset never
// interleave; the load itself runs under an advisory lock, which reset takes too.
//
// The phases: `staging` takes chunks; `loading` writes every row; `verifying` runs the round trip on the untouched
// copy; `recovering` turns what Convex had pending into jobs; `done` releases the hold. A round trip that differs stops
// the load in `verifying`, and only a reset starts it over.
import { createHash, timingSafeEqual } from "node:crypto";
import { getTableName } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type pg from "pg";
import { errorFields, type Log } from "../log.ts";
import type { LoadPhase } from "../db/schema/load.ts";
import { decodeStored, encodeStored, type Value } from "../db/codec.ts";
import { appTables, LoadError, loadSnapshot, type BatchLimits } from "./loader.ts";
import { roundTrip, type RoundTrip } from "./roundTrip.ts";

export interface LoadControl {
  held(): boolean;
  /** Reads the load's state; call once the migrations are done, before serving. */
  refresh(): Promise<void>;
  /** Watches the load's state until it is done, and resumes a load a stopped copy left, now and whenever it can. */
  resume(): void;
  stop(): void;
  /** The `/admin/load` routes, only while `HEDGEHUG_ADMIN_TOKEN` is set. */
  routes?: Hono;
}

export interface LoadOptions {
  pool: pg.Pool;
  token: string | undefined;
  log: Log;
  limits?: BatchLimits;
  /** How often a copy reads the load's state while it isn't done. */
  pollMs?: number;
}

interface State {
  phase: LoadPhase;
  tokenHash: string;
  chunks: number | null;
  sha256: string | null;
  error: string | null;
}

type Queryable = Pick<pg.Pool, "query"> | pg.PoolClient;

const maxChunkBytes = 16 * 1024 * 1024;
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest();
// Only 0001's columns: boot reads the state before it migrates, so a later column would fail on an older database.
const selectState = `select phase, "tokenHash", chunks, sha256, error from "loadState" where key = 'load'`;

/** A load this copy can take on: written or verifying, and not stopped. */
function runnable(current: State | undefined): boolean {
  return (current?.phase === "loading" || current?.phase === "verifying") && current.error === null;
}

async function readState(db: Queryable, forUpdate = false): Promise<State | undefined> {
  const { rows } = await db.query<State>(forUpdate ? `${selectState} for update` : selectState);
  return rows[0];
}

export function createLoadControl({ pool, token, log, limits = { rows: 500, bytes: 4 * 1024 * 1024 }, pollMs = 5_000 }: LoadOptions): LoadControl {
  let state: State | undefined | "unknown" = "unknown";
  let running: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;

  const refresh = async () => {
    try {
      state = await readState(pool);
    } catch (error) {
      // Before the first migration there is no load table, so no load has started.
      if ((error as { code?: string }).code !== "42P01") throw error;
      state = undefined;
    }
  };

  /** Runs the load if no other copy owns it: an advisory lock, held on one connection for the whole load. */
  const run = async (): Promise<boolean> => {
    if (running) return true;
    const client = await pool.connect();
    // The lock's connection can drop between queries; its error then goes to the load, not out of the process.
    let lost: Error | undefined;
    const onError = (error: Error) => (lost = error);
    client.on("error", onError);
    let lock: string | undefined;
    let started = false;
    const release = async () => {
      if (lock) await client.query("select pg_advisory_unlock($1::bigint)", [lock]).catch(() => {});
      client.off("error", onError);
      client.release(lost);
    };
    try {
      const key = await lockKey(client);
      const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1::bigint) as ok", [key]);
      if (!rows[0]?.ok) return false;
      lock = key;
      const current = await readState(client);
      if (!runnable(current)) return false;
      started = true;
      running = (async () => {
        try {
          log.info("load running");
          if (current!.phase === "loading") {
            if ((await stagedHash(client, current!.chunks!)) !== current!.sha256) {
              throw new LoadError("The staged chunks don't match the sha256 sent with finish");
            }
            await loadSnapshot(pool, client, current!.chunks!, limits);
            await client.query(`update "loadState" set phase = 'verifying' where key = 'load'`);
            log.info("load written");
          }
          // The round trip runs on the untouched copy: only when it is equal does recovery (`recovering`) start.
          const answer = await roundTrip(pool, client, current!.chunks!);
          const differs = answer.tables.filter((table) => !table.equal).map((table) => table.table);
          await client.query(`update "loadState" set "roundTrip" = $1, phase = $2, error = $3 where key = 'load'`, [
            encodeStored(answer as unknown as Value),
            answer.equal ? "recovering" : "verifying",
            answer.equal ? null : `The round trip differs on ${differs.join(", ")}`,
          ]);
          log.info(answer.equal ? "round trip equal" : "round trip differs", { tables: answer.tables.length, differs: differs.length });
        } catch (error) {
          // A lost connection is this copy's trouble, not the snapshot's: the load resumes from its checkpoints, here
          // or on another copy. Anything else stops it until `finish` is sent again or the load is reset.
          const fields = errorFields(error);
          if (!(error instanceof LoadError) && connectionLost(error, fields.code)) {
            lost ??= error as Error;
            log.error("load interrupted", fields);
          } else {
            log.error("load stopped", fields);
            const reason = error instanceof LoadError ? error.message : `${fields.error} ${fields.code ?? ""}`.trim();
            await pool.query(`update "loadState" set error = $1 where key = 'load'`, [reason]).catch(() => {});
          }
        } finally {
          await release();
          running = undefined;
          await refresh().catch(() => {});
        }
      })();
      return true;
    } finally {
      if (!started) await release();
    }
  };

  const tick = async () => {
    try {
      await refresh();
      if (typeof state === "object" && runnable(state)) await run();
    } catch (error) {
      log.error("load check failed", errorFields(error));
    }
  };

  const control: LoadControl = {
    held: () => (state === "unknown" ? true : state === undefined ? token !== undefined : state.phase !== "done"),
    refresh,
    resume() {
      void tick();
      timer ??= setInterval(() => {
        if (typeof state !== "object" || state.phase !== "done") void tick();
      }, pollMs).unref();
    },
    stop() {
      clearInterval(timer);
    },
  };
  if (token !== undefined) control.routes = adminRoutes(token);
  return control;

  async function inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
      await refresh();
    }
  }

  function adminRoutes(adminToken: string): Hono {
    const admin = new Hono();
    const expected = sha256(adminToken);
    const tokenHash = expected.toString("hex");

    // HostHog strips `Authorization` on public paths, so the token comes in a header of its own.
    admin.use(async (c, next) => {
      if (!timingSafeEqual(sha256(c.req.header("x-hedgehug-admin-token") ?? ""), expected)) return c.text("Unauthorized", 401);
      await refresh();
      const current = state as State | undefined;
      if (c.req.method !== "GET" && current?.phase === "done" && current.tokenHash === tokenHash) {
        return c.text("This token finished a load. Set a new token to load again.", 409);
      }
      return next();
    });

    admin.get("/", async (c) => {
      const current = state as State | undefined;
      const chunks = await pool.query<{ count: number }>('select count(*)::int as count from "loadChunks"');
      const entries = await pool.query('select entry, lines, done from "loadCheckpoints" order by entry');
      const reports = await pool.query<{ reports: string }>('select reports from "loadCheckpoints" where reports <> \'[]\'::jsonb');
      const answer = await pool.query<{ roundTrip: string | null }>(`select "roundTrip" from "loadState" where key = 'load'`);
      return c.json({
        phase: current?.phase ?? "none",
        error: current?.error ?? null,
        stagedChunks: chunks.rows[0]!.count,
        entries: entries.rows,
        reports: reports.rows.flatMap((row) => JSON.parse(row.reports) as unknown[]),
        roundTrip: answer.rows[0]?.roundTrip ? (decodeStored(answer.rows[0].roundTrip) as unknown as RoundTrip) : null,
      });
    });

    // One chunk of the snapshot ZIP, by number. Sending a chunk again is a no-op; sending different bytes is refused.
    admin.post("/", bodyLimit({ maxSize: maxChunkBytes }), async (c) => {
      const number = Number(c.req.query("chunk"));
      if (!Number.isSafeInteger(number) || number < 0) return c.text("Give the chunk number as ?chunk=<n>", 400);
      const bytes = Buffer.from(await c.req.arrayBuffer());
      const hash = sha256(bytes).toString("hex");
      return inTransaction(async (client) => {
        let current = await readState(client, true);
        if (!current) {
          if (await anyAppRows(client)) return c.text("The database already holds data; load into an empty one", 409);
          await client.query(`insert into "loadState" (key, phase, "tokenHash") values ('load', 'staging', $1) on conflict (key) do nothing`, [tokenHash]);
          current = (await readState(client, true))!;
        }
        if (current.phase !== "staging") return c.text(`The load is ${current.phase}`, 409);
        const { rows } = await client.query<{ sha256: string }>(
          `insert into "loadChunks" (number, sha256, bytes) values ($1, $2, $3)
           on conflict (number) do update set number = excluded.number returning sha256`,
          [number, hash, bytes],
        );
        if (rows[0]!.sha256 !== hash) return c.text(`Chunk ${number} was staged with other bytes`, 409);
        return c.json({ chunk: number, sha256: hash });
      });
    });

    // Starts the load once chunks 0..n-1, and no others, are staged. The load checks the whole against the sha256
    // (hex) the sender computed before it writes a row. A load that stopped resumes from its checkpoints when
    // finished again with the same snapshot.
    admin.post("/finish", async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { chunks?: unknown; sha256?: unknown };
      const chunks = body.chunks as number;
      if (!Number.isSafeInteger(chunks) || chunks < 1 || typeof body.sha256 !== "string") return c.text("Give { chunks, sha256 }", 400);
      const refused = await inTransaction(async (client) => {
        const current = await readState(client, true);
        const resuming = current?.phase === "loading" && current.error !== null;
        if (current?.phase !== "staging" && !resuming) return `The load is ${current?.phase ?? "not staged"}`;
        if (resuming && (chunks !== current.chunks || body.sha256 !== current.sha256)) return "A stopped load resumes only with its own snapshot";
        const { rows } = await client.query<{ count: number; last: number | null }>('select count(*)::int as count, max(number) as last from "loadChunks"');
        if (rows[0]!.count !== chunks || rows[0]!.last !== chunks - 1) return `Stage chunks 0 to ${chunks - 1}, and no others, first`;
        if (!resuming && (await anyAppRows(client))) return "The database already holds data; load into an empty one";
        await client.query(`update "loadState" set phase = 'loading', chunks = $1, sha256 = $2, error = null where key = 'load'`, [chunks, body.sha256]);
        return undefined;
      });
      if (refused) return c.text(refused, 409);
      // This copy runs it, unless another copy's check took it first; either way it runs once.
      await run();
      return c.json({ phase: "loading" }, 202);
    });

    // Empties every table the load writes and its staged chunks, to start over; only before a load is done and while
    // none runs. The state row stays, back at `staging`, so the hold stays too.
    admin.post("/reset", async (c) => {
      if (running) return c.text("The load is running", 409);
      const client = await pool.connect();
      let lock: string | undefined;
      try {
        const key = await lockKey(client);
        const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1::bigint) as ok", [key]);
        if (!rows[0]?.ok) return c.text("Another copy owns the load", 409);
        lock = key;
        await client.query("begin");
        const current = await readState(client, true);
        if (current?.phase === "done") {
          await client.query("rollback");
          return c.text("The load is done", 409);
        }
        const names = [...appTables.map(getTableName), "loadChunks", "loadCheckpoints"];
        await client.query(`truncate ${names.map((name) => `"${name}"`).join(", ")}`);
        await client.query(`update "loadState" set phase = 'staging', chunks = null, sha256 = null, error = null, "roundTrip" = null where key = 'load'`);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        if (lock) await client.query("select pg_advisory_unlock($1::bigint)", [lock]).catch(() => {});
        client.release();
      }
      await refresh();
      return c.json({ phase: (state as State | undefined)?.phase ?? "none" });
    });

    return admin;
  }
}

async function anyAppRows(db: Queryable): Promise<boolean> {
  const checks = appTables.map((table) => `exists (select 1 from "${getTableName(table)}")`).join(" or ");
  const { rows } = await db.query<{ any: boolean }>(`select ${checks} as any`);
  return rows[0]!.any;
}

/** The sha256 (hex) of chunks 0..n-1 in order, read one at a time. */
async function stagedHash(db: Queryable, chunks: number): Promise<string> {
  const hash = createHash("sha256");
  for (let number = 0; number < chunks; number++) {
    const { rows } = await db.query<{ bytes: Buffer }>('select bytes from "loadChunks" where number = $1', [number]);
    if (!rows[0]) throw new LoadError(`Chunk ${number} is missing`);
    hash.update(rows[0].bytes);
  }
  return hash.digest("hex");
}

function connectionLost(error: unknown, code: string | undefined): boolean {
  if (code) return /^(08|57P|DB_|E[A-Z]+$)/.test(code);
  return /not queryable/.test((error as Error).message);
}

/** The load's advisory lock, keyed by the schema, as the migrations' is. */
async function lockKey(client: pg.ClientBase): Promise<string> {
  const { rows } = await client.query<{ schema: string }>("select current_schema() as schema");
  return createHash("sha256").update(`hedgehug load ${rows[0]!.schema}`).digest().readBigInt64BE(0).toString();
}
