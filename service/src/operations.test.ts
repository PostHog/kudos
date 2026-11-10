import { get as httpGet } from "node:http";
import https from "node:https";
import { eq, sql } from "drizzle-orm";
import { doublePrecision, integer, pgTable, text } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, test, vi } from "vitest";
import { useTestDatabase, withSearchPath } from "../testing/database.ts";
import { createClock } from "./clock.ts";
import { runMigrations } from "./db/migrate.ts";
import { createPool } from "./db/pool.ts";
import { errorFields, type Log, type LogFields } from "./log.ts";
import { createOperations, fence, type Database, type Operations } from "./operations.ts";

// A table of the test's own, in a schema of its own, so the service's schema stays exactly the migrations'.
const counters = pgTable("counters", { id: text().primaryKey(), n: integer().notNull(), at: doublePrecision() });

const database = useTestDatabase();
const schema = `${database.schema}_operations`;
let pool: pg.Pool;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: inject("databaseUrl") });
  await admin.connect();
  await admin.query(`drop schema if exists "${schema}" cascade; create schema "${schema}"`);
  await admin.query(`create table "${schema}".counters (id text primary key, n integer not null, at double precision)`);
  // A row of doomed ends its own session when its transaction commits, so COMMIT fails with the connection gone.
  await admin.query(`create table "${schema}".doomed (id text primary key)`);
  await admin.query(
    `create function "${schema}".end_session() returns trigger language plpgsql as $$ begin perform pg_terminate_backend(pg_backend_pid()); return null; end $$`,
  );
  await admin.query(
    `create constraint trigger doomed_at_commit after insert on "${schema}".doomed deferrable initially deferred for each row execute function "${schema}".end_session()`,
  );
  await admin.end();
  pool = createPool(withSearchPath(inject("databaseUrl"), schema), { max: 6 });
  await runMigrations(pool); // the runner keeps the creation order in the migrated schema
});
afterAll(async () => {
  await pool.end();
  const admin = new pg.Client({ connectionString: inject("databaseUrl") });
  await admin.connect();
  await admin.query(`drop schema if exists "${schema}" cascade`);
  await admin.end();
});
beforeEach(async () => {
  await pool.query(`truncate counters; select setval('"creationClock"', 0, false)`);
});

/** One runner: the operations of one process, on a clock of its own. `real` is its clock's reading at the start. */
function setUp({ real: start = 1_700_000_000_000, ...options }: { maxAttempts?: number; pool?: Pick<pg.Pool, "connect">; real?: number } = {}) {
  let real = start;
  const clock = createClock({ real: () => real });
  const lines: Array<{ level: string; message: string } & LogFields> = [];
  const log: Log = {
    info: (message, fields) => lines.push({ level: "info", message, ...fields }),
    error: (message, fields) => lines.push({ level: "error", message, ...fields }),
  };
  const operations = createOperations({ pool, clock, log, retryDelayMs: () => 1, ...options });
  return { operations, clock, lines, tick: (ms: number) => (real += ms) };
}

/** Whether the error, or one it wraps (Drizzle wraps a failed query), is named `name`. */
function causedBy(name: string): (error: unknown) => boolean {
  return (error) => {
    for (let cause = error; cause instanceof Error; cause = cause.cause) if (cause.name === name) return true;
    return false;
  };
}

async function setting(operations: Operations, name: string): Promise<string> {
  return operations.query("read setting", async ({ tx }) => {
    const { rows } = await tx.execute<{ value: string }>(sql`select current_setting(${name}) as value`);
    return rows[0]!.value;
  });
}

describe("mutations", () => {
  test("run in one SERIALIZABLE transaction", async () => {
    const { operations } = setUp();

    const level = await operations.mutation("read level", async ({ tx }) => {
      const { rows } = await tx.execute<{ value: string }>(sql`select current_setting('transaction_isolation') as value`);
      return rows[0]!.value;
    });

    expect(level).toBe("serializable");
  });

  test("two that read and write the same row both land: the one that conflicts re-runs whole, with the same now", async () => {
    const { operations, tick } = setUp();
    await pool.query("insert into counters (id, n) values ('wallet', 0)");
    const nows = new Map<string, number[]>();
    // Both first attempts read before either writes, so SERIALIZABLE must refuse one of them.
    let reads = 0;
    let bothRead: () => void;
    const barrier = new Promise<void>((resolve) => (bothRead = resolve));

    const spend = (name: string) =>
      operations.mutation(name, async ({ tx, now }) => {
        nows.set(name, [...(nows.get(name) ?? []), now]);
        const [row] = await tx.select().from(counters).where(eq(counters.id, "wallet"));
        if (++reads === 2) bothRead();
        if (reads <= 2) await barrier;
        tick(1_000); // real time passes between attempts; the operation's now must not
        await tx.update(counters).set({ n: row!.n + 1, at: now }).where(eq(counters.id, "wallet"));
      });
    await Promise.all([spend("spend a"), spend("spend b")]);

    const { rows } = await pool.query("select n from counters where id = 'wallet'");
    expect(rows[0].n, "both spends counted").toBe(2);
    const attempts = [...nows.values()];
    expect(attempts.map((list) => list.length).sort(), "one ran once, the other twice").toEqual([1, 2]);
    for (const list of attempts) expect(new Set(list).size, "every attempt of one operation saw one now").toBe(1);
  });

  test("a serialization failure or deadlock that keeps coming runs out of attempts, logged with the operation's name", async () => {
    const { operations, lines } = setUp({ maxAttempts: 3 });
    let attempts = 0;

    const failing = operations.mutation("give kudos", async () => {
      attempts += 1;
      throw Object.assign(new Error("could not serialize access"), { code: attempts % 2 ? "40001" : "40P01" });
    });

    await expect(failing).rejects.toThrow("could not serialize access");
    expect(attempts, "every attempt ran").toBe(3);
    expect(lines.filter((line) => line.level === "error"), "one log line, naming the operation").toEqual([
      { level: "error", message: "mutation retries exhausted", operation: "give kudos", attempts: 3, error: "Error", code: "40001" },
    ]);
  });

  test("any other error runs once, rolls the writes back, and is logged with the operation's name", async () => {
    const { operations, lines } = setUp();
    let attempts = 0;

    const failing = operations.mutation("open pack", async ({ tx }) => {
      attempts += 1;
      await tx.insert(counters).values({ id: "pack", n: 1 });
      throw new TypeError("no such pack");
    });

    await expect(failing).rejects.toThrow("no such pack");
    expect(attempts, "not retried").toBe(1);
    expect((await pool.query("select * from counters")).rows, "its insert rolled back").toEqual([]);
    expect(lines.filter((line) => line.level === "error")).toEqual([{ level: "error", message: "operation failed", operation: "open pack", kind: "mutation", error: "TypeError" }]);
  });

  test("new rows get a UUID and a creation time from the operation's instant, strictly increasing", async () => {
    const { operations, clock } = setUp();
    clock.advance(86_400_000);

    const stamps = await operations.mutation("insert three", async ({ now, newRow }) => ({ now, rows: [newRow(), newRow(), newRow()] }));
    const later = await operations.mutation("insert one more", async ({ newRow }) => newRow());

    const times = [...stamps.rows, later].map((row) => row._creationTime);
    expect(times[0], "the first row is stamped with the operation's now, test offset included").toBe(stamps.now);
    expect(stamps.now, "now includes the offset").toBe(1_700_000_000_000 + 86_400_000);
    for (let i = 1; i < times.length; i++) expect(times[i], `row ${i} after row ${i - 1}`).toBeGreaterThan(times[i - 1]!);
    expect(times.every((time) => time - stamps.now < 1), "every stamp stays within the operation's millisecond").toBe(true);
    for (const row of [...stamps.rows, later]) expect(row._id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

// Two runners on one database: the two copies of a deploy's overlap, or one whose clock is behind. Convex gave every
// table one creation order every reader saw; "the latest" by `_creationTime` must stay the row written last.
describe("_creationTime across runners", () => {
  const minute = 60_000;
  /** The row `at` stamps last: the latest by `_creationTime`, as `.order("desc").first()` read it. */
  const latest = async () => (await pool.query<{ id: string }>("select id from counters order by at desc, id desc limit 1")).rows[0]?.id;
  const insert = (operations: Operations, id: string) =>
    operations.mutation(`insert ${id}`, async ({ tx, newRow }) => {
      const { _creationTime } = newRow();
      await tx.insert(counters).values({ id, n: 0, at: _creationTime });
      return _creationTime;
    });

  test("a row written after another committed sorts after it, though its runner's clock is behind", async () => {
    const ahead = setUp({ real: 1_700_000_000_000 + minute });
    const behind = setUp({ real: 1_700_000_000_000 });

    const first = await insert(ahead.operations, "first");
    const second = await insert(behind.operations, "second");

    expect(second, "stamped after the row it could see").toBeGreaterThan(first);
    expect(await latest(), "the latest is the row written last").toBe("second");
    expect(second - first, "pushed only as far as the earlier row, not to a clock of its own").toBeLessThan(1);
  });

  test.each([
    ["on both sides of zero", 1, -1],
    ["before 1970", -1_000, -61_000],
    ["at zero and below", 0, -0.5],
  ])("the order holds for clocks %s", async (_, aheadAt, behindAt) => {
    const first = await insert(setUp({ real: aheadAt }).operations, "first");
    const second = await insert(setUp({ real: behindAt }).operations, "second");

    expect(first, "the first row keeps its runner's now").toBe(aheadAt);
    expect(second).toBeGreaterThan(first);
    expect(second - first, "just after it").toBeLessThan(1);
    expect(await latest()).toBe("second");
  });

  test("advances that race keep the highest stamp, and give their lock back", async () => {
    const keys = Array.from({ length: 40 }, (_, i) => BigInt((i * 7919) % 40) * 1_000_000_007n - 20_000_000_000n);

    await Promise.all(keys.map((key) => pool.query(`select "advanceCreationClock"($1::bigint)`, [key.toString()])));

    const { rows } = await pool.query<{ last_value: string }>(`select last_value from "creationClock"`);
    expect(BigInt(rows[0]!.last_value)).toBe(keys.reduce((a, b) => (a > b ? a : b)));
    const { rows: held } = await pool.query(
      `select pid from pg_locks where locktype = 'advisory' and classid = 'pg_class'::regclass and objid = '"creationClock"'::regclass and objsubid = 2`,
    );
    expect(held, "no session keeps the clock's lock").toEqual([]);
  });

  test("an attempt that re-runs after losing to another runner stamps after the row it lost to", async () => {
    const ahead = setUp({ real: 1_700_000_000_000 + minute });
    const behind = setUp({ real: 1_700_000_000_000 });
    await pool.query("insert into counters (id, n) values ('wallet', 0)");
    const stamps = new Map<string, number[]>();
    // Both first attempts read before either writes; the runner behind writes only once the one ahead has committed,
    // so SERIALIZABLE refuses it, and its second attempt sees the other's row.
    let reads = 0;
    let bothRead: () => void;
    const barrier = new Promise<void>((resolve) => (bothRead = resolve));
    let aheadCommitted: () => void;
    const committed = new Promise<void>((resolve) => (aheadCommitted = resolve));
    const spend = (operations: Operations, name: string) =>
      operations.mutation(name, async ({ tx, newRow }) => {
        const [row] = await tx.select().from(counters).where(eq(counters.id, "wallet"));
        if (++reads === 2) bothRead();
        if (reads <= 2) await barrier;
        if (name === "behind" && reads <= 2) await committed;
        const { _creationTime } = newRow();
        stamps.set(name, [...(stamps.get(name) ?? []), _creationTime]);
        await tx.update(counters).set({ n: row!.n + 1, at: _creationTime }).where(eq(counters.id, "wallet"));
      });

    await Promise.all([spend(ahead.operations, "ahead").then(() => aheadCommitted()), spend(behind.operations, "behind")]);

    const [once] = stamps.get("ahead")!;
    const [, retried] = stamps.get("behind")!;
    expect([stamps.get("ahead")!.length, stamps.get("behind")!.length], "the one behind ran twice").toEqual([1, 2]);
    expect(retried, "its second attempt stamps after the row it lost to").toBeGreaterThan(once!);
    const { rows } = await pool.query("select n, at from counters where id = 'wallet'");
    expect(rows, "both spends counted, the last write's stamp kept").toEqual([{ n: 2, at: retried }]);
  });

  test("runners writing rows of their own never wait on, nor conflict through, the creation order", async () => {
    const runners = [setUp({ real: 1_700_000_000_000 + minute }), setUp({ real: 1_700_000_000_000 })];
    const attempts = new Map<string, number>();
    const ids = Array.from({ length: 12 }, (_, i) => `row-${i}`);

    await Promise.all(
      ids.map((id, i) =>
        runners[i % 2]!.operations.mutation(`insert ${id}`, async ({ tx, newRow }) => {
          attempts.set(id, (attempts.get(id) ?? 0) + 1);
          await tx.insert(counters).values({ id, n: 0, at: newRow()._creationTime });
        }),
      ),
    );

    expect([...attempts.values()], "every insert ran once").toEqual(ids.map(() => 1));
    expect(Number((await pool.query("select count(*) from counters")).rows[0].count)).toBe(ids.length);
  });
});

describe("the transaction", () => {
  test("lets go of a connection lost before it begins, so the next operation still gets one", async () => {
    // One connection, so a leaked one would leave the next operation waiting until the connect timeout.
    const single = createPool(withSearchPath(inject("databaseUrl"), schema), { max: 1, connectTimeoutMs: 2_000 });
    let loseNext = true;
    const losing = Object.assign(Object.create(single) as pg.Pool, {
      async connect() {
        const client = await single.connect();
        if (loseNext) {
          loseNext = false;
          // The server ends the session after the pool hands it out and before the runner's BEGIN. Until the runner
          // holds the client, its error is this override's to catch.
          const meanwhile = () => {};
          client.on("error", meanwhile);
          await pool.query("select pg_terminate_backend($1, 5000)", [(client as pg.PoolClient & { processID: number }).processID]);
          client.removeListener("error", meanwhile);
        }
        return client;
      },
    });
    try {
      const { operations, lines } = setUp({ pool: losing });

      await expect(operations.mutation("first", async () => "ran")).rejects.toThrow();
      expect(await operations.mutation("second", async () => "ran"), "the next operation gets a connection").toBe("ran");
      expect(lines.filter((line) => line.level === "error").map((line) => line.operation)).toEqual(["first"]);
    } finally {
      await single.end();
    }
  });

  test("drops a connection whose session ended at COMMIT, so the next operation gets a working one", async () => {
    // One connection, so the dead one handed back would be the next operation's.
    const single = createPool(withSearchPath(inject("databaseUrl"), schema), { max: 1, connectTimeoutMs: 2_000 });
    try {
      const { operations } = setUp({ pool: single });

      await expect(operations.mutation("doomed", ({ tx }) => tx.execute(sql`insert into doomed values ('x')`))).rejects.toMatchObject({ code: "57P01" });
      const next = await operations.mutation("next", async ({ tx }) => (await tx.execute<{ one: number }>(sql`select 1 as one`)).rows);
      expect(next, "the next operation runs").toEqual([{ one: 1 }]);
    } finally {
      await single.end();
    }
  });

  test("a handler can't end or start the runner's transaction: Drizzle's own transaction, a raw statement, or one behind a comment or another statement", async () => {
    const { operations } = setUp();
    const escapes: Array<(tx: Database) => Promise<unknown>> = [
      (tx) => tx._.session.transaction((inner) => inner.insert(counters).values({ id: "inner", n: 1 })),
      (tx) => tx.execute(sql`commit`),
      (tx) => tx.execute(sql`  END`),
      (tx) => tx.execute(sql`rollback`),
      (tx) => (tx as unknown as { $client: pg.ClientBase }).$client.query("start transaction"),
      (tx) => tx.execute(sql.raw("/* trace */ COMMIT")),
      (tx) => tx.execute(sql.raw("/* a /* nested */ comment */ commit")),
      (tx) => tx.execute(sql.raw("-- trace\nCOMMIT")),
      (tx) => tx.execute(sql.raw("SELECT 1; COMMIT")),
      (tx) => tx.execute(sql.raw("select 'it''s'; commit")),
      (tx) => tx.execute(sql.raw("select $q$ $$ $q$; commit")),
      (tx) => tx.execute(sql.raw("-- trace\rCOMMIT")),
      (tx) => tx.execute(sql.raw("SELECT E'abc'\n'\\''; COMMIT")),
      (tx) => tx.execute(sql.raw("SELECT 1 AS é$$; COMMIT")),
      (tx) => tx.execute(sql.raw("start /* a */ transaction")),
      (tx) => tx.execute(sql.raw("rollback /* not to a savepoint */")),
      (tx) => tx.execute(sql.raw("; COMMIT")),
      (tx) => tx.execute(sql.raw(";; /* empty statements */ END")),
      (tx) => tx.execute(sql.raw("; ROLLBACK")),
    ];

    for (const [index, escape] of escapes.entries()) {
      const run = operations.mutation("escape", async ({ tx }) => {
        await tx.insert(counters).values({ id: "outer", n: 1 });
        await escape(tx as unknown as Database);
        throw new Error("the handler fails after it");
      });
      // Refused by the runner, or by Postgres, which takes one statement per text from it.
      await expect(run, `escape ${index}`).rejects.not.toThrow("the handler fails after it");
      expect((await pool.query("select * from counters")).rows, `escape ${index}: nothing it wrote stays`).toEqual([]);
    }
    const savepoint = await operations.mutation("savepoint", async ({ tx }) => {
      await tx.execute(sql`savepoint mine`);
      await tx.insert(counters).values({ id: "undone", n: 1 });
      await tx.execute(sql`rollback to savepoint mine`);
      return "kept";
    });
    expect(savepoint, "a savepoint stays the handler's").toBe("kept");
    const lookalikes = await operations.mutation("lookalikes", async ({ tx }) => {
      await tx.execute(sql`savepoint mine`);
      await tx.execute(sql.raw("do $$ begin perform 1; end $$"));
      await tx.execute(sql.raw("select 'x; commit' as quoted, $body$; end$body$ as dollar /* ; commit */"));
      await tx.execute(sql.raw("SELECT E'abc'\n'\\'; commit' AS value"));
      await tx.execute(sql.raw("SELECT $é$; commit; rollback$é$ AS value"));
      await tx.execute(sql.raw("rollback /* to */ to savepoint mine"));
      return (await tx.execute<{ commit: number }>(sql.raw(`select 1 as "commit" -- ; rollback`))).rows;
    });
    expect(lookalikes, "commit inside a string, a body, a name or a comment is no statement").toEqual([{ commit: 1 }]);
    expect((await pool.query("select * from counters")).rows, "nothing it wrote stays").toEqual([]);
  });

  test("a client error of pg's own before a swallowed serialization failure still retries it", async () => {
    const { operations } = setUp();
    let attempts = 0;

    const result = await operations.mutation("retried", async ({ tx }) => {
      attempts += 1;
      const client = (tx as unknown as { $client: pg.ClientBase }).$client;
      const name = `twice-${attempts}-${Math.random()}`;
      await client.query({ name, text: "select 1" });
      // pg refuses a second text under one name before sending it; the transaction is unharmed
      await client.query({ name, text: "select 2" }).catch(() => {});
      if (attempts === 1) await tx.execute(sql`do $$ begin raise exception using errcode = '40001'; end $$`).catch(() => {});
      return "done";
    });

    expect(result).toBe("done");
    expect(attempts).toBe(2);
  });

  test("a serialization failure swallowed after a rollback to a savepoint still retries, whatever failed before it", async () => {
    const { operations } = setUp();
    let attempts = 0;

    const result = await operations.mutation("recovered", async ({ tx }) => {
      attempts += 1;
      await tx.execute(sql`savepoint mine`);
      await tx.execute(sql`do $$ begin raise exception using errcode = '23505'; end $$`).catch(() => {});
      await tx.execute(sql`rollback to savepoint mine`);
      if (attempts === 1) await tx.execute(sql`do $$ begin raise exception using errcode = '40001'; end $$`).catch(() => {});
      return "done";
    });

    expect(result).toBe("done");
    expect(attempts).toBe(2);
  });

  test("a statement after a swallowed failure answers with that failure's code, so a hidden serialization failure retries at once", async () => {
    const { operations } = setUp();
    let attempts = 0;
    let seen: unknown;

    const result = await operations.mutation("went on", async ({ tx }) => {
      attempts += 1;
      if (attempts === 1) {
        await tx.execute(sql`do $$ begin raise exception using errcode = '40001'; end $$`).catch(() => {});
        await tx.insert(counters).values({ id: "after", n: 1 }).catch((error: unknown) => {
          seen = error;
          throw error;
        });
      }
      return "done";
    });

    expect(result).toBe("done");
    expect(attempts).toBe(2);
    expect(errorFields(seen).code, "not 25P02, the code of every statement after a failed one").toBe("40001");
  });

  test("work a handler left behind can't use its transaction once the handler has ended", async () => {
    const { operations } = setUp();
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let later!: Promise<unknown>;

    await expect(
      operations.mutation("parent", async ({ tx }) => {
        later = released.then(() => tx.insert(counters).values({ id: "late", n: 1 }));
        throw new Error("the parent failed");
      }),
    ).rejects.toThrow("the parent failed");
    release();

    await expect(later).rejects.toSatisfy(causedBy("OperationEndedError"));
    expect((await pool.query("select * from counters")).rows, "nothing it wrote stays").toEqual([]);
  });

  test("fails an operation that caught a database error and went on, keeping the error's code, and keeps none of its writes", async () => {
    const { operations, lines } = setUp();
    let attempts = 0;

    const swallowing = operations.mutation("give twice", async ({ tx }) => {
      attempts += 1;
      await tx.insert(counters).values({ id: "give", n: 1 });
      try {
        await tx.insert(counters).values({ id: "give", n: 2 });
      } catch {
        // the handler hides the unique violation; Postgres has aborted the transaction all the same
      }
      return "done";
    });

    await expect(swallowing).rejects.toMatchObject({ code: "23505" });
    expect(attempts, "a unique violation is not retried").toBe(1);
    expect((await pool.query("select * from counters")).rows, "nothing it wrote stays").toEqual([]);
    expect(lines.filter((line) => line.level === "error")).toEqual([
      { level: "error", message: "operation failed", operation: "give twice", kind: "mutation", error: "Error", code: "23505" },
    ]);
  });

  test("a mutation or query can't run inside another, whose writes then roll back", async () => {
    const { operations } = setUp();

    const nested = [
      () =>
        operations.mutation("outer", async ({ tx }) => {
          await tx.insert(counters).values({ id: "outer", n: 1 });
          await operations.mutation("inner", ({ tx: inner }) => inner.insert(counters).values({ id: "inner", n: 1 }));
        }),
      () => operations.mutation("outer query", () => operations.query("inner", async () => 1)),
      () => operations.query("outer", () => operations.mutation("inner", async () => 1)),
      () => operations.query("outer action", () => operations.action("inner", async () => 1)),
    ];

    for (const run of nested) await expect(run()).rejects.toMatchObject({ name: "NestedOperationError" });
    expect((await pool.query("select * from counters")).rows, "neither the outer nor the inner write stays").toEqual([]);
  });

  test("work an operation leaves behind may start operations once it has ended", async () => {
    const { operations } = setUp();
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let later!: Promise<string>;

    await operations.mutation("parent", async () => {
      later = released.then(() => operations.mutation("later", async () => "ran"));
    });
    release();

    expect(await later).toBe("ran");
  });
});

describe("queries", () => {
  test("run in one REPEATABLE READ READ ONLY transaction", async () => {
    const { operations } = setUp();

    expect(await setting(operations, "transaction_isolation")).toBe("repeatable read");
    expect(await setting(operations, "transaction_read_only")).toBe("on");
  });

  test("see one snapshot, whatever commits meanwhile", async () => {
    const { operations } = setUp();
    await pool.query("insert into counters (id, n) values ('board', 1)");

    const [first, second] = await operations.query("read the board twice", async ({ tx }) => {
      const read = async () => (await tx.select().from(counters).where(eq(counters.id, "board")))[0]!.n;
      const before = await read();
      await pool.query("update counters set n = 2 where id = 'board'");
      return [before, await read()];
    });

    expect(first).toBe(1);
    expect(second, "the second read sees the first's snapshot").toBe(1);
  });

  test("can't write", async () => {
    const { operations } = setUp();

    await expect(operations.query("sneak a write", ({ tx }) => tx.insert(counters).values({ id: "x", n: 1 }))).rejects.toThrow();
    expect((await pool.query("select * from counters")).rows).toEqual([]);
  });
});

describe("actions", () => {
  test("read the clock live and run mutations and queries", async () => {
    const { operations, clock, tick } = setUp();

    const seen = await operations.action("hold for a rate limit", async (ctx) => {
      const before = ctx.clock.now();
      tick(30_000); // a Slack call and its wait
      clock.advance(5_000);
      await ctx.run.mutation("count", ({ tx }) => tx.insert(counters).values({ id: "action", n: 1 }));
      const n = await ctx.run.query("read", async ({ tx }) => (await tx.select().from(counters))[0]!.n);
      return { before, after: ctx.clock.now(), n };
    });

    expect(seen.after - seen.before, "the action sees real time and the offset move").toBe(35_000);
    expect(seen.n).toBe(1);
  });

  test("an action that throws before its first await is logged like any other failure", async () => {
    const { operations, lines } = setUp();
    const throwsAtOnce = (() => {
      throw new TypeError("no channel");
    }) as () => Promise<never>;

    await expect(operations.action("post the board", throwsAtOnce)).rejects.toThrow("no channel");
    expect(lines.filter((line) => line.level === "error")).toEqual([{ level: "error", message: "operation failed", operation: "post the board", kind: "action", error: "TypeError" }]);
  });
});

describe("no network inside a mutation or query", () => {
  afterEach(() => vi.unstubAllGlobals());

  // A data: URL never leaves the process, so the real fetch answers it wherever it is allowed.
  const fetchesOk = async () => (await fetch("data:,ok")).text();

  test("a fetch inside a mutation throws, naming the operation, and fails the mutation even when the handler catches it", async () => {
    const { operations, lines } = setUp();

    await expect(operations.mutation("decide the board", fetchesOk)).rejects.toMatchObject({ name: "NetworkInOperationError", message: expect.stringContaining('"decide the board"') });
    await expect(
      operations.mutation("hide a fetch", async ({ tx }) => {
        await tx.insert(counters).values({ id: "hidden", n: 1 });
        await fetchesOk().catch(() => "swallowed");
      }),
    ).rejects.toMatchObject({ name: "NetworkInOperationError" });
    expect((await pool.query("select * from counters")).rows, "its writes roll back").toEqual([]);
    expect(lines.filter((line) => line.level === "error").map(({ operation, error }) => [operation, error])).toEqual([
      ["decide the board", "NetworkInOperationError"],
      ["hide a fetch", "NetworkInOperationError"],
    ]);
  });

  test("a handler can't launder a refused fetch through a savepoint of its own: nothing it wrote, before or after, commits", async () => {
    const { operations } = setUp();

    await expect(
      operations.mutation("launder a fetch", async ({ tx }) => {
        await tx.insert(counters).values({ id: "before", n: 1 });
        await tx.execute(sql`savepoint own`);
        await fetchesOk().catch(() => "swallowed");
        await tx.execute(sql`rollback to savepoint own`).catch(() => "swallowed too");
        await tx.insert(counters).values({ id: "after", n: 1 }).catch(() => "and this");
      }),
    ).rejects.toMatchObject({ name: "NetworkInOperationError" });
    expect((await pool.query("select * from counters")).rows, "its writes roll back").toEqual([]);
  });

  test("behind the fence, a refused fetch undoes only what the fence ran, and the mutation goes on to commit", async () => {
    const { operations } = setUp();

    const answer = await operations.mutation("fail a job", async ({ tx }) => {
      await tx.insert(counters).values({ id: "claim", n: 1 });
      const refused = await fence(async () => {
        await tx.insert(counters).values({ id: "behind", n: 1 });
        await tx.execute(sql`savepoint own`); // a savepoint of the fenced code's own launders nothing either
        await fetchesOk().catch(() => "swallowed");
        await tx.execute(sql`rollback to savepoint own`).catch(() => "swallowed too");
      }).catch((error: unknown) => error);
      await tx.insert(counters).values({ id: "marked", n: 1 });
      return refused;
    });

    expect(answer).toMatchObject({ name: "NetworkInOperationError" });
    expect((await pool.query("select id from counters order by id")).rows).toEqual([{ id: "claim" }, { id: "marked" }]);
  });

  test("work the fence left running writes nothing once the fence undid it, and a fetch it makes later fails the mutation", async () => {
    const { operations } = setUp();
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let stray!: Promise<unknown>;

    await operations.mutation("fail a job", async ({ tx }) => {
      await fence(async () => {
        stray = released.then(() => tx.insert(counters).values({ id: "stray", n: 1 }));
        throw new Error("the job failed");
      }).catch(() => "marked failed");
      release();
      await expect(stray).rejects.toSatisfy(causedBy("OperationEndedError"));
    });
    expect((await pool.query("select * from counters")).rows).toEqual([]);

    let fetchLater!: () => void;
    let later!: Promise<string>;
    await expect(
      operations.mutation("fail a job", async () => {
        await fence(async () => {
          later = new Promise<void>((resolve) => (fetchLater = resolve)).then(fetchesOk);
          throw new Error("the job failed");
        }).catch(() => "marked failed");
        fetchLater();
        await later.catch(() => "swallowed");
      }),
    ).rejects.toMatchObject({ name: "NetworkInOperationError" });
  });

  test("a fence taken after a swallowed serialization failure answers with it, so the mutation retries", async () => {
    const { operations } = setUp();
    let attempts = 0;

    const result = await operations.mutation("went on", async ({ tx }) => {
      attempts += 1;
      if (attempts === 1) await tx.execute(sql`do $$ begin raise exception using errcode = '40001'; end $$`).catch(() => {});
      return fence(async () => "fenced");
    });

    expect(result).toBe("fenced");
    expect(attempts).toBe(2);
  });

  test("a fence left running past its operation never touches the connection the next operation gets", async () => {
    const single = createPool(withSearchPath(inject("databaseUrl"), schema), { max: 1, connectTimeoutMs: 2_000 });
    try {
      const { operations } = setUp({ pool: single });
      let fail!: () => void;
      const failing = new Promise<void>((_, reject) => (fail = () => reject(new Error("the job failed"))));
      let left!: Promise<unknown>;

      await operations.mutation("leaves a fence behind", async () => {
        left = fence(() => failing).catch((error: unknown) => error);
      });
      const next = operations.mutation("next", async ({ tx }) => {
        fail();
        await left;
        await tx.insert(counters).values({ id: "next", n: 1 });
      });

      await next;
      expect((await pool.query("select id from counters")).rows, "the next operation's write commits").toEqual([{ id: "next" }]);
    } finally {
      await single.end();
    }
  });

  test("a refusal outside the fence fails the mutation even while the fence undoes its own", async () => {
    const { operations } = setUp();
    let refuseOutside!: () => void;
    const outsideRefused = new Promise<void>((resolve) => (refuseOutside = resolve));
    let insideRefused!: () => void;
    const refusedInside = new Promise<void>((resolve) => (insideRefused = resolve));

    await expect(
      operations.mutation("both refused", async ({ tx }) => {
        await tx.insert(counters).values({ id: "before", n: 1 });
        const fenced = fence(async () => {
          await fetchesOk().catch(() => "swallowed");
          insideRefused();
          await outsideRefused; // the call outside is refused while the fence is still pending
        }).catch(() => "marked failed");
        await refusedInside;
        await fetchesOk().catch(() => "swallowed outside");
        refuseOutside();
        await fenced;
        await tx.insert(counters).values({ id: "after", n: 1 }).catch(() => "swallowed too");
      }),
    ).rejects.toMatchObject({ name: "NetworkInOperationError" });
    expect((await pool.query("select * from counters")).rows, "nothing commits").toEqual([]);
  });

  test("one fence per attempt: never twice, never nested, never outside an operation", async () => {
    const { operations } = setUp();

    await expect(fence(async () => "outside")).rejects.toMatchObject({ name: "FenceTakenError" });
    await expect(operations.mutation("twice", async () => {
      await fence(async () => "first");
      await fence(async () => "second");
    })).rejects.toMatchObject({ name: "FenceTakenError" });
    await expect(operations.mutation("nested", () => fence(() => fence(async () => "inner")))).rejects.toMatchObject({ name: "FenceTakenError" });
  });

  test("a fetch inside a query throws too", async () => {
    const { operations } = setUp();

    await expect(operations.query("read the board", fetchesOk)).rejects.toMatchObject({ name: "NetworkInOperationError", message: expect.stringContaining('"read the board"') });
  });

  test("a fetch put in place later, as a test or a library does, is refused the same", async () => {
    const { operations } = setUp();
    const before = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => (calls++, new Response("ok"));

      await expect(operations.mutation("decide", fetchesOk)).rejects.toMatchObject({ name: "NetworkInOperationError" });
      expect(calls, "the replacement never ran").toBe(0);
      expect(await fetchesOk(), "outside an operation it runs").toBe("ok");
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = before;
    }
  });

  test("an http or https request inside an operation throws before it connects", async () => {
    const { operations } = setUp();

    await expect(operations.mutation("call out", async () => void httpGet("http://127.0.0.1:9/").on("error", () => {}))).rejects.toMatchObject({ name: "NetworkInOperationError" });
    await expect(operations.query("call out", async () => void https.request("https://127.0.0.1:9/").on("error", () => {}).end())).rejects.toMatchObject({ name: "NetworkInOperationError" });
  });

  test("an action's own fetch, outside its mutations and queries, still works", async () => {
    const { operations } = setUp();

    const answered = await operations.action("refresh", async (ctx) => {
      const before = await fetchesOk();
      await ctx.run.mutation("store", ({ tx }) => tx.insert(counters).values({ id: "stored", n: 1 }));
      return [before, await fetchesOk()];
    });

    expect(answered).toEqual(["ok", "ok"]);
  });

  test("work a mutation left behind may fetch once the mutation has ended", async () => {
    const { operations } = setUp();
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let later!: Promise<string>;

    await operations.mutation("parent", async () => {
      later = released.then(fetchesOk);
    });
    release();

    expect(await later).toBe("ok");
  });
});
