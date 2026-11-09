// The load's control: the hold, the one copy that owns a running load, and the `/admin/load` routes.
//
// The hold: once a load has started, until its phase is `done`, every app route answers 503 on every copy, across
// restarts. A deployment whose `HEDGEHUG_ADMIN_TOKEN` is set and that has never finished a load holds too, so it
// serves nothing before its data arrives. A database that never saw a load or a token serves as usual.
import { createHash, timingSafeEqual } from "node:crypto";
import { getTableName } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type pg from "pg";
import { errorFields, type Log } from "../log.ts";
import type { LoadPhase } from "../db/schema/load.ts";
import { appTables, LoadError, loadSnapshot, type BatchLimits } from "./loader.ts";

export interface LoadControl {
  held(): boolean;
  /** Reads the load's state; call once the migrations are done, before serving. */
  refresh(): Promise<void>;
  /** Resumes a load a stopped copy left running, now and whenever this copy can take it over. */
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
  /** How often a copy that doesn't own the load checks whether it ended, or was left behind by a stopped copy. */
  pollMs?: number;
}

interface State {
  phase: LoadPhase;
  tokenHash: string;
  chunks: number | null;
  sha256: string | null;
  error: string | null;
}

const maxChunkBytes = 16 * 1024 * 1024;
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest();

export function createLoadControl({ pool, token, log, limits = { rows: 500, bytes: 4 * 1024 * 1024 }, pollMs = 5_000 }: LoadOptions): LoadControl {
  let state: State | undefined | "unknown" = "unknown";
  let running: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;

  const readState = async (): Promise<State | undefined> => {
    const { rows } = await pool.query<State>(`select phase, "tokenHash", chunks, sha256, error from "loadState" where key = 'load'`);
    return rows[0];
  };
  const refresh = async () => {
    state = await readState();
  };

  /** Runs the load if no other copy owns it: an advisory lock, held on one connection for the whole load. */
  const run = async (): Promise<boolean> => {
    if (running) return true;
    const client = await pool.connect();
    // The lock's connection can drop between queries; its error then goes to the load, not out of the process.
    let lost: Error | undefined;
    const onError = (error: Error) => (lost = error);
    client.on("error", onError);
    const release = () => {
      client.off("error", onError);
      client.release(lost);
    };
    const lock = await lockKey(client);
    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1::bigint) as ok", [lock]);
    if (!rows[0]?.ok) {
      release();
      return false;
    }
    const current = await readState();
    if (current?.phase !== "loading" || current.error !== null) {
      await client.query("select pg_advisory_unlock($1::bigint)", [lock]);
      release();
      return false;
    }
    running = (async () => {
      try {
        log.info("load running");
        await loadSnapshot(pool, client, current.chunks!, limits);
        await client.query(`update "loadState" set phase = 'verifying' where key = 'load'`);
        log.info("load written");
      } catch (error) {
        // A lost connection is this copy's trouble, not the snapshot's: the load resumes from its checkpoints, here or
        // on another copy. Anything else stops it until `finish` is sent again or the load is reset.
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
        await client.query("select pg_advisory_unlock($1::bigint)", [lock]).catch(() => {});
        release();
        running = undefined;
        await refresh().catch(() => {});
      }
    })();
    return true;
  };

  const tick = async () => {
    try {
      await refresh();
      if (typeof state === "object" && state.phase === "loading" && state.error === null) await run();
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
        if (control.held()) void tick();
      }, pollMs).unref();
    },
    stop() {
      clearInterval(timer);
    },
  };
  if (token !== undefined) control.routes = adminRoutes(token);
  return control;

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
      return c.json({
        phase: current?.phase ?? "none",
        error: current?.error ?? null,
        stagedChunks: chunks.rows[0]!.count,
        entries: entries.rows,
        reports: reports.rows.flatMap((row) => JSON.parse(row.reports) as unknown[]),
      });
    });

    // One chunk of the snapshot ZIP, by number. Sending a chunk again is a no-op; sending different bytes is refused.
    admin.post("/", bodyLimit({ maxSize: maxChunkBytes }), async (c) => {
      const number = Number(c.req.query("chunk"));
      if (!Number.isSafeInteger(number) || number < 0) return c.text("Give the chunk number as ?chunk=<n>", 400);
      const current = state as State | undefined;
      if (current !== undefined && current.phase !== "staging") return c.text(`The load is ${current.phase}`, 409);
      if (current === undefined && (await anyAppRows())) return c.text("The database already holds data; load into an empty one", 409);
      const bytes = Buffer.from(await c.req.arrayBuffer());
      const hash = sha256(bytes).toString("hex");
      await pool.query(
        `insert into "loadState" (key, phase, "tokenHash") values ('load', 'staging', $1) on conflict (key) do nothing`,
        [tokenHash],
      );
      const { rows } = await pool.query<{ sha256: string }>(
        `insert into "loadChunks" (number, sha256, bytes) values ($1, $2, $3)
         on conflict (number) do update set number = excluded.number returning sha256`,
        [number, hash, bytes],
      );
      await refresh();
      if (rows[0]!.sha256 !== hash) return c.text(`Chunk ${number} was staged with other bytes`, 409);
      return c.json({ chunk: number, sha256: hash });
    });

    // Starts the load once every chunk is staged and the whole matches the sha256 (hex) the sender computed.
    // A load that stopped on an error resumes from its checkpoints when finished again.
    admin.post("/finish", async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { chunks?: unknown; sha256?: unknown };
      const current = state as State | undefined;
      const resuming = current?.phase === "loading" && current.error !== null;
      if (current?.phase !== "staging" && !resuming) return c.text(`The load is ${current?.phase ?? "not staged"}`, 409);
      if (!Number.isSafeInteger(body.chunks) || typeof body.sha256 !== "string") return c.text("Give { chunks, sha256 }", 400);
      if (resuming && (body.chunks !== current.chunks || body.sha256 !== current.sha256)) return c.text("A stopped load resumes only with its own snapshot", 409);
      const whole = await stagedHash(body.chunks as number);
      if (whole !== body.sha256) return c.text("The staged chunks don't match that sha256", 409);
      if (!resuming && (await anyAppRows())) return c.text("The database already holds data; load into an empty one", 409);
      await pool.query(`update "loadState" set phase = 'loading', chunks = $1, sha256 = $2, error = null where key = 'load'`, [body.chunks, whole]);
      await refresh();
      // This copy runs it, unless another copy's check took it first; either way it runs once.
      await run();
      return c.json({ phase: "loading" }, 202);
    });

    // Empties every table the load writes, to start over; only before a load is done and while none runs.
    admin.post("/reset", async (c) => {
      if (running) return c.text("The load is running", 409);
      const client = await pool.connect();
      try {
        const lock = await lockKey(client);
        const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1::bigint) as ok", [lock]);
        if (!rows[0]?.ok) return c.text("Another copy owns the load", 409);
        try {
          const current = await readState();
          if (current?.phase === "done") return c.text("The load is done", 409);
          const names = [...appTables.map(getTableName), "loadState", "loadChunks", "loadCheckpoints"];
          await client.query(`truncate ${names.map((name) => `"${name}"`).join(", ")}`);
        } finally {
          await client.query("select pg_advisory_unlock($1::bigint)", [lock]);
        }
      } finally {
        client.release();
      }
      await refresh();
      return c.json({ phase: "none" });
    });

    return admin;
  }

  async function anyAppRows(): Promise<boolean> {
    const checks = appTables.map((table) => `exists (select 1 from "${getTableName(table)}")`).join(" or ");
    const { rows } = await pool.query<{ any: boolean }>(`select ${checks} as any`);
    return rows[0]!.any;
  }

  async function stagedHash(chunks: number): Promise<string> {
    const hash = createHash("sha256");
    for (let number = 0; number < chunks; number++) {
      const { rows } = await pool.query<{ bytes: Buffer }>('select bytes from "loadChunks" where number = $1', [number]);
      if (!rows[0]) return `chunk ${number} missing`;
      hash.update(rows[0].bytes);
    }
    const extra = await pool.query<{ count: number }>('select count(*)::int as count from "loadChunks" where number >= $1', [chunks]);
    return extra.rows[0]!.count === 0 ? hash.digest("hex") : "more chunks staged";
  }
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
