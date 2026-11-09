import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { createClock } from "../clock.ts";
import { decodeStored } from "../db/codec.ts";
import { archive, crons, jobs } from "../db/schema/service.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext, type Operations } from "../operations.ts";
import { retiredCrons } from "./crons.ts";
import { actionJob, jobRegistry, mutationJob, type Job } from "./define.ts";
import { createWorker, type WorkerOptions } from "./worker.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };

// A job's lasting effect: a row in the archive table, which no job here otherwise touches.
async function effect({ tx, newRow }: MutationContext, what: string): Promise<void> {
  const { _id, _creationTime } = newRow();
  await tx.insert(archive).values({ source: "test", table: what, _id, _creationTime, document: "{}" });
}
async function effects(what: string): Promise<number> {
  return (await db.select().from(archive).where(eq(archive.table, what))).length;
}
async function jobRows() {
  return db.select({ name: jobs.name, state: jobs.state, error: jobs.error }).from(jobs).orderBy(jobs._creationTime);
}

function setUp(registered: Job[], options: Partial<WorkerOptions> = {}) {
  const clock = createClock({ real: () => 1_800_000_000_000 });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
  const registry = jobRegistry(registered);
  const worker = (more: Partial<WorkerOptions> = {}) => createWorker({ operations, log: quiet, registry, pollMs: 3_600_000, ...options, ...more });
  const enqueue = <Args, Input>(job: Job<Args, Input>, args: Input, when?: { at: number } | { after: number }) =>
    operations.mutation("enqueue", ({ jobs: scheduler }) => scheduler.enqueue(job, args, when));
  return { clock, operations, worker, enqueue };
}

/** The operations, with a hook before every operation starts and after every mutation ends, by its name. */
function around(operations: Operations, hooks: { before?: (name: string) => unknown; after?: (name: string) => unknown }): Operations {
  return {
    ...operations,
    async query(name, handler) {
      await hooks.before?.(name);
      return operations.query(name, handler);
    },
    async mutation(name, handler) {
      await hooks.before?.(name);
      try {
        return await operations.mutation(name, handler);
      } finally {
        await hooks.after?.(name);
      }
    },
  };
}

/** What Postgres answers a SERIALIZABLE transaction that lost a conflict. */
function serializationFailure(): Error {
  return Object.assign(new pg.DatabaseError("could not serialize access due to read/write dependencies", 0, "error"), { code: "40001" });
}

/** A promise a test resolves by hand, and one that says the handler got there. */
function gate() {
  let open!: () => void;
  let reached!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const arrived = new Promise<void>((resolve) => (reached = resolve));
  return { open, opened, reached, arrived };
}

describe("mutation jobs", () => {
  test("run once, in the transaction that marks them done; a job scheduled by a transaction that rolls back never exists", async () => {
    const give = mutationJob("engine.give.award", z.object({ who: z.string() }), (ctx, { who }) => effect(ctx, who));
    const { worker, operations, enqueue } = setUp([give]);

    await expect(
      operations.mutation("rolls back", async ({ jobs: scheduler }) => {
        await scheduler.enqueue(give, { who: "nobody" });
        throw new Error("the give failed");
      }),
    ).rejects.toThrow();
    expect(await jobRows(), "the rolled-back job was never written").toEqual([]);

    await enqueue(give, { who: "ada" });
    const first = await worker().settle(5_000);
    const second = await worker().settle(5_000);

    expect(first).toEqual({ ran: ["engine.give.award"], done: true });
    expect(second, "a done job doesn't run again").toEqual({ ran: [], done: true });
    expect(await effects("ada")).toBe(1);
    expect(await jobRows()).toEqual([{ name: "engine.give.award", state: "success", error: null }]);
  });

  test("two workers on one due job run it once", async () => {
    const give = mutationJob("engine.give.award", z.object({}), (ctx) => effect(ctx, "give"));
    const { worker, enqueue } = setUp([give]);
    await enqueue(give, {});

    const [a, b] = await Promise.all([worker().settle(5_000), worker().settle(5_000)]);

    expect([...a.ran, ...b.ran]).toEqual(["engine.give.award"]);
    expect(await effects("give")).toBe(1);
  });

  test("an app error rolls the job's writes back, marks it failed, and it never runs again", async () => {
    let runs = 0;
    const open = mutationJob("album.packs.open", z.object({}), async (ctx) => {
      runs += 1;
      await effect(ctx, "pack");
      throw new TypeError("no such pack");
    });
    const { worker, enqueue } = setUp([open]);
    await enqueue(open, {});

    expect(await worker().settle(5_000)).toEqual({ ran: ["album.packs.open"], done: true });
    expect(await worker().settle(5_000)).toEqual({ ran: [], done: true });

    expect(runs).toBe(1);
    expect(await effects("pack"), "its write rolled back").toBe(0);
    expect(await jobRows()).toEqual([{ name: "album.packs.open", state: "failed", error: "TypeError: no such pack" }]);
  });

  test("an app error is marked failed before the job's claim ends: a copy that looks the moment it ends never runs it", async () => {
    let runs = 0;
    const open = mutationJob("album.packs.open", z.object({}), async (ctx) => {
      runs += 1;
      await effect(ctx, "pack");
      throw new TypeError("no such pack");
    });
    const { worker, operations, enqueue } = setUp([open]);
    await enqueue(open, {});
    const other = worker();
    let looked = false;
    // Once the first copy's handler has run, its next step waits until the other copy has looked for work.
    const first = worker({
      operations: around(operations, {
        after: async () => {
          if (runs === 0 || looked) return;
          looked = true;
          await other.settle(5_000);
        },
      }),
    });

    await first.settle(5_000);

    expect(looked).toBe(true);
    expect(runs).toBe(1);
    expect(await jobRows()).toEqual([{ name: "album.packs.open", state: "failed", error: "TypeError: no such pack" }]);
  });

  test("the database's trouble is not the job's: past the runner's retries it stays pending, runs later, and never fails for it", async () => {
    let calls = 0;
    const give = mutationJob("engine.give.award", z.object({}), async (ctx) => {
      calls += 1;
      if (calls <= 12) throw serializationFailure(); // the runner tries 10 times per run
      await effect(ctx, "give");
    });
    const { worker, enqueue } = setUp([give]);
    await enqueue(give, {});

    expect(await worker().settle(5_000)).toEqual({ ran: ["engine.give.award"], done: true });
    expect(calls).toBe(13);
    expect(await effects("give")).toBe(1);
    expect(await jobRows()).toEqual([{ name: "engine.give.award", state: "success", error: null }]);
  });

  test("a statement the database cancelled is not the job's failure: the job stays pending and runs later", async () => {
    let calls = 0;
    const slow = mutationJob("engine.give.award", z.object({}), async (ctx) => {
      calls += 1;
      if (calls === 1) {
        // A statement timeout of this transaction's own, standing for an operator's or a client's cancel.
        await ctx.tx.execute(sql`set local statement_timeout = '30ms'`);
        await ctx.tx.execute(sql`select pg_sleep(0.15)`);
      }
      await effect(ctx, "give");
    });
    const { worker, enqueue } = setUp([slow]);
    await enqueue(slow, {});

    expect(await worker().settle(5_000)).toEqual({ ran: ["engine.give.award"], done: true });
    expect(calls).toBe(2);
    expect(await jobRows()).toEqual([{ name: "engine.give.award", state: "success", error: null }]);
  });

  test("a database error of the job's own, such as a duplicate key, fails it", async () => {
    const twice = mutationJob("album.packs.open", z.object({}), async ({ tx }) => {
      const row = { source: "test", table: "pack", _id: "same", _creationTime: 1, document: "{}" };
      await tx.insert(archive).values(row);
      await tx.insert(archive).values(row);
    });
    const { worker, enqueue } = setUp([twice]);
    await enqueue(twice, {});

    expect(await worker().settle(5_000)).toEqual({ ran: ["album.packs.open"], done: true });
    expect((await jobRows())[0]!.state).toBe("failed");
    expect(await effects("pack"), "its first write rolled back too").toBe(0);
  });

  test("a job that swallows a database error of its own and goes on fails, and the next job runs", async () => {
    const swallowing = mutationJob("album.packs.open", z.object({}), async ({ tx }) => {
      const row = { source: "test", table: "pack", _id: "same", _creationTime: 1, document: "{}" };
      await tx.insert(archive).values(row);
      await tx.insert(archive).values(row).catch(() => {}); // hides the duplicate key; Postgres aborted all the same
    });
    const next = mutationJob("website.clock.tick", z.object({}), (ctx) => effect(ctx, "next"));
    const { worker, enqueue } = setUp([swallowing, next], { concurrency: 1 });
    await enqueue(swallowing, {});
    await enqueue(next, {});

    expect(await worker().settle(5_000)).toEqual({ ran: ["album.packs.open", "website.clock.tick"], done: true });
    expect((await jobRows()).map((row) => row.state)).toEqual(["failed", "success"]);
    expect(await effects("pack")).toBe(0);
  });

  test("a job that swallows a serialization failure and goes on runs again", async () => {
    let calls = 0;
    const give = mutationJob("engine.give.award", z.object({}), async (ctx) => {
      calls += 1;
      if (calls === 1) await ctx.tx.execute(sql`do $$ begin raise exception using errcode = '40001'; end $$`).catch(() => {});
      await effect(ctx, "give");
    });
    const { worker, enqueue } = setUp([give]);
    await enqueue(give, {});

    expect(await worker().settle(5_000)).toEqual({ ran: ["engine.give.award"], done: true });
    expect(calls).toBe(2);
    expect(await effects("give")).toBe(1);
  });

  test("jobs another copy holds never block the next one", async () => {
    let holding = 0;
    const bothHeld = gate();
    const release = gate();
    const slow = mutationJob("slack.delivery.slow", z.object({}), async () => {
      if (++holding === 2) bothHeld.reached();
      await release.opened;
    });
    const quick = mutationJob("slack.delivery.quick", z.object({}), (ctx) => effect(ctx, "quick"));
    const { worker, enqueue } = setUp([slow, quick]);
    await enqueue(slow, {});
    await enqueue(slow, {});
    await enqueue(quick, {});
    const holder = worker();
    const held = holder.settle(5_000);
    await bothHeld.arrived;

    expect(await worker().settle(300), "the other copy takes the third job").toEqual({ ran: ["slack.delivery.quick"], done: false });
    release.open();
    await held;
    expect(await effects("quick")).toBe(1);
  });
});

describe("scheduling", () => {
  test("a job waits for its time by the app's clock", async () => {
    const tick = mutationJob("website.clock.tick", z.object({}), (ctx) => effect(ctx, "tick"));
    const { worker, clock, enqueue } = setUp([tick]);
    await enqueue(tick, {}, { after: 60_000 });
    await enqueue(tick, {}, { at: clock.now() + 120_000 });

    expect((await worker().settle(5_000)).ran, "nothing due yet").toEqual([]);
    clock.advance(60_000);
    expect((await worker().settle(5_000)).ran).toEqual(["website.clock.tick"]);
    clock.advance(60_000);
    expect((await worker().settle(5_000)).ran).toEqual(["website.clock.tick"]);
  });

  test("settle runs due jobs in due order, and the jobs they make due", async () => {
    const order: string[] = [];
    const named = (name: string, then?: Job) =>
      mutationJob(name, z.object({}), async (ctx) => {
        order.push(name);
        if (then) await ctx.jobs.enqueue(then, {});
      });
    const d = named("d");
    const [a, b, c] = [named("a", d), named("b"), named("c")];
    const { worker, clock, enqueue } = setUp([a, b, c, d], { concurrency: 1 });
    await enqueue(c, {}, { after: 2_000 });
    await enqueue(a, {});
    await enqueue(b, {}, { after: 1_000 });
    clock.advance(2_000);

    const settled = await worker().settle(5_000);

    expect(order).toEqual(["a", "b", "c", "d"]);
    expect(settled).toEqual({ ran: ["a", "b", "c", "d"], done: true });
  });

  test("a canceled job never runs; cancel leaves a job that ran as it was", async () => {
    const job = mutationJob("slack.delivery.sendReply", z.object({}), (ctx) => effect(ctx, "reply"));
    const { worker, operations, enqueue } = setUp([job]);
    const canceled = await enqueue(job, {});
    const ran = await enqueue(job, {}, { after: 0 });

    await operations.mutation("cancel", ({ jobs: scheduler }) => scheduler.cancel(canceled));
    await worker().settle(5_000);
    await operations.mutation("cancel too late", ({ jobs: scheduler }) => scheduler.cancel(ran));

    expect((await jobRows()).map((row) => row.state)).toEqual(["canceled", "success"]);
    expect(await effects("reply")).toBe(1);
  });

  test("args are checked by the job's schema when it is scheduled and before it runs; bigints survive", async () => {
    const seen: bigint[] = [];
    const check = mutationJob("slack.directory.check", z.object({ attempt: z.bigint() }), async (_ctx, { attempt }) => {
      seen.push(attempt);
    });
    const { worker, enqueue } = setUp([check]);

    await expect(enqueue(check, { attempt: 1 as unknown as bigint })).rejects.toThrow();
    await enqueue(check, { attempt: 2n ** 62n });
    // A loaded row whose args the schema refuses.
    await db.insert(jobs).values({ _id: "loaded", _creationTime: 1, name: "slack.directory.check", args: '{"attempt":"x"}', runAt: 0, kind: "mutation", state: "pending" });

    await worker().settle(5_000);

    expect(new Set(seen), "a retry may run the handler again; it always sees the same args").toEqual(new Set([2n ** 62n]));
    const states = await db.select({ _id: jobs._id, state: jobs.state, error: jobs.error }).from(jobs).where(eq(jobs._id, "loaded"));
    expect(states).toEqual([{ _id: "loaded", state: "failed", error: expect.stringMatching(/^ZodError/) }]);
  });

  test("a schema's transform runs once, when the job runs; the row keeps the args as given", async () => {
    const seen: number[] = [];
    const bump = mutationJob("slack.directory.check", z.object({ n: z.number().transform((n) => n + 1) }), async (_ctx, { n }) => {
      seen.push(n);
    });
    const { worker, enqueue } = setUp([bump]);
    await enqueue(bump, { n: 1 });

    expect((await db.select({ args: jobs.args }).from(jobs)).map(({ args }) => decodeStored(args))).toEqual([{ n: 1 }]);
    await worker().settle(5_000);
    expect(new Set(seen)).toEqual(new Set([2]));
  });

  test("a job no handler is registered for is marked failed", async () => {
    const { worker } = setUp([]);
    await db.insert(jobs).values({ _id: "orphan", _creationTime: 1, name: "gone.away", args: "{}", runAt: 0, kind: "action", state: "pending" });

    expect(await worker().settle(5_000)).toEqual({ ran: ["gone.away"], done: true });
    expect(await jobRows()).toEqual([{ name: "gone.away", state: "failed", error: "Error: No job is registered as gone.away" }]);
  });

  test("at most `concurrency` jobs run at once", async () => {
    const hold = gate();
    let running = 0;
    let most = 0;
    const slow = actionJob("slack.delivery.send", z.object({}), async () => {
      most = Math.max(most, ++running);
      await hold.opened;
      running -= 1;
    });
    const { worker, enqueue } = setUp([slow]);
    for (let i = 0; i < 3; i++) await enqueue(slow, {});

    const settling = worker().settle(5_000);
    await new Promise((resolve) => setTimeout(resolve, 200));
    hold.open();

    expect((await settling).ran).toHaveLength(3);
    expect(most).toBe(2);
  });
});

describe("action jobs", () => {
  test("run at most once: one whose copy died stays running, no other copy starts it, and the sweep fails it past its deadline", async () => {
    const hold = gate();
    let starts = 0;
    const send = actionJob("slack.delivery.send", z.object({}), async () => {
      starts += 1;
      hold.reached();
      await hold.opened;
    });
    const { worker, clock, enqueue } = setUp([send], { actionDeadlineMs: 600_000 });
    await enqueue(send, {});

    const dying = worker();
    const unfinished = dying.settle(5_000);
    await hold.arrived;
    // The first copy is gone as far as the database knows: its job stays `running`.
    const survivor = worker();
    expect(await survivor.settle(300), "the survivor waits on the running job and never starts it").toEqual({ ran: [], done: false });

    clock.advance(600_000);
    expect(await survivor.settle(5_000), "settle fails it before it answers done").toEqual({ ran: [], done: true });
    expect(await jobRows()).toEqual([{ name: "slack.delivery.send", state: "failed", error: "The action ran past its deadline" }]);

    hold.open(); // the first copy's action ends after the sweep: the job stays failed
    await unfinished;
    expect(starts).toBe(1);
    expect((await jobRows())[0]!.state).toBe("failed");
  });

  test("one that throws is marked failed with its error", async () => {
    const send = actionJob("slack.delivery.send", z.object({}), async () => {
      throw new Error("channel_not_found");
    });
    const { worker, enqueue } = setUp([send]);
    await enqueue(send, {});

    expect(await worker().settle(5_000)).toEqual({ ran: ["slack.delivery.send"], done: true });
    expect(await jobRows()).toEqual([{ name: "slack.delivery.send", state: "failed", error: "Error: channel_not_found" }]);
  });

  test("settle answers within its budget while a job still runs", async () => {
    const hold = gate();
    const send = actionJob("slack.delivery.send", z.object({}), () => hold.opened);
    const { worker, enqueue } = setUp([send]);
    await enqueue(send, {});
    const copy = worker();
    const started = performance.now();

    expect(await copy.settle(200)).toEqual({ ran: [], done: false });
    expect(performance.now() - started).toBeLessThan(2_000);
    hold.open();
    await copy.stop(5_000);
  });
});

describe("crons", () => {
  const tickJob = (onRun: () => void) =>
    mutationJob("website.clock.tick", z.object({}), async (ctx) => {
      onRun();
      await effect(ctx, "tick");
    });

  test("start writes each cron's first run once; a retired cron has none", async () => {
    const { worker, clock } = setUp([]);
    await worker().start();
    const first = await db.select().from(crons);
    clock.advance(60_000); // less than any cron's interval, so the second start's tick fires none
    await worker().start();

    expect(first).toHaveLength(15);
    expect(first.some((row) => retiredCrons.has(row.id as never))).toBe(false);
    expect(first.find((row) => row.id === "website.clock.tick")!.nextRun).toBe(1_800_000_000_000 + 15 * 60_000);
    expect(await db.select().from(crons), "a second start moves nothing").toEqual(first);
  });

  test("two workers fire a due cron once, and its next run moves forward", async () => {
    let fired = 0;
    const { worker, clock } = setUp([tickJob(() => (fired += 1))]);
    const [a, b] = [worker(), worker()];
    await a.start();
    await b.start();
    clock.advance(15 * 60_000);

    await Promise.all([a.tick(), b.tick()]);
    await Promise.all([a.settle(5_000), b.settle(5_000)]);

    expect(fired).toBe(1);
    const [row] = await db.select().from(crons).where(eq(crons.id, "website.clock.tick"));
    expect(row!.nextRun).toBe(clock.now() + 15 * 60_000);
  });

  test("runs missed while no copy ran fire once, not as a backlog", async () => {
    let fired = 0;
    const { worker, clock } = setUp([tickJob(() => (fired += 1))]);
    const copy = worker();
    await copy.start();
    clock.advance(10 * 3_600_000); // forty runs missed

    await copy.tick();
    await copy.settle(5_000);
    await copy.tick();
    await copy.settle(5_000);

    expect(fired).toBe(1);
  });

  test("runCron runs the cron's job now and settles; a retired one runs nothing; one with no job yet is undefined", async () => {
    let fired = 0;
    const { worker } = setUp([tickJob(() => (fired += 1))]);
    const copy = worker();

    expect(await copy.runCron("website.clock.tick", 5_000)).toEqual({ ran: ["website.clock.tick"], done: true });
    expect(await copy.runCron("website.abandonedHandshakes.deleteAbandoned", 5_000)).toEqual({ ran: [], done: true });
    expect(await copy.runCron("analytics.drain.recover", 5_000)).toBeUndefined();
    expect(fired).toBe(1);
  });

  test("runCron answers within its budget when scheduling the job is slow", async () => {
    const slowEnqueue = gate();
    const { worker, operations } = setUp([tickJob(() => {})]);
    const copy = worker({ operations: around(operations, { before: (name) => (name === "crons.run" ? slowEnqueue.opened : undefined) }) });
    const started = performance.now();

    const answer = await copy.runCron("website.clock.tick", 100);
    const took = performance.now() - started;
    slowEnqueue.open();

    expect(answer).toEqual({ ran: [], done: false });
    expect(took).toBeLessThan(1_000);
    await vi.waitFor(async () => expect(await jobRows(), "the late job is written, for a later tick").toHaveLength(1));
  });
});

describe("the load's hold", () => {
  test("while the load holds, no cron is written or fired and no job starts; once it lifts, both run", async () => {
    let holding = true;
    let fired = 0;
    const tick = mutationJob("website.clock.tick", z.object({}), async (ctx) => {
      fired += 1;
      await effect(ctx, "tick");
    });
    const { worker, clock, enqueue } = setUp([tick], { held: () => holding });
    const copy = worker();
    await enqueue(tick, {});

    await copy.start();
    await copy.tick();
    expect(await copy.settle(200), "nothing runs while held").toEqual({ ran: [], done: false });
    expect(await db.select().from(crons), "no cron row is written while held").toEqual([]);

    holding = false;
    await copy.tick();
    expect((await copy.settle(5_000)).ran).toEqual(["website.clock.tick"]);
    expect(await db.select().from(crons)).toHaveLength(15);
    clock.advance(15 * 60_000);
    await copy.tick();
    await copy.settle(5_000);
    expect(fired, "the queued job, then the cron").toBe(2);
    await copy.stop(1_000);
  });

  test("a hold that begins while a copy looks for work stops it before the job starts", async () => {
    let holding = false;
    let runs = 0;
    const tick = mutationJob("website.clock.tick", z.object({}), async () => {
      runs += 1;
    });
    const { worker, operations, enqueue } = setUp([tick]);
    await enqueue(tick, {});
    const copy = worker({ held: () => holding, operations: around(operations, { before: () => (holding = true) }) });

    expect(await copy.settle(200)).toEqual({ ran: [], done: false });
    expect(runs).toBe(0);
    expect((await jobRows()).map((row) => row.state)).toEqual(["pending"]);
  });

  test("a tick whose seeding fails once the hold lifts answers anyway, and a later tick seeds", async () => {
    let holding = true;
    let failSeed = true;
    const { worker, operations } = setUp([]);
    const copy = worker({
      held: () => holding,
      operations: around(operations, {
        before: (name) => {
          if (name !== "crons.seed" || !failSeed) return;
          failSeed = false;
          throw Object.assign(new pg.DatabaseError("terminating connection due to administrator command", 0, "error"), { code: "57P01" });
        },
      }),
    });
    await copy.start();
    holding = false;

    await expect(copy.tick(), "a timer's tick never rejects").resolves.toBeUndefined();
    expect(await db.select().from(crons)).toEqual([]);
    await copy.tick();
    expect(await db.select().from(crons)).toHaveLength(15);
    await copy.stop(1_000);
  });

  test("the sweep leaves an action past its deadline alone while the load holds", async () => {
    let holding = true;
    const { worker, clock } = setUp([], { held: () => holding });
    await db.insert(jobs).values({ _id: "stale", _creationTime: 1, name: "slack.delivery.send", args: "{}", runAt: 0, kind: "action", state: "running", deadline: clock.now() - 1 });
    const copy = worker();

    await copy.sweep();
    expect((await jobRows())[0]!.state, "untouched while held").toBe("running");
    holding = false;
    await copy.sweep();
    expect((await jobRows())[0]!.state).toBe("failed");
  });
});

describe("stopping", () => {
  test("takes no new job and lets running ones finish within the grace", async () => {
    const hold = gate();
    const send = actionJob("slack.delivery.send", z.object({}), async () => {
      hold.reached();
      await hold.opened;
    });
    const later = mutationJob("website.clock.tick", z.object({}), (ctx) => effect(ctx, "tick"));
    const { worker, enqueue } = setUp([send, later], { pollMs: 10 });
    const copy = worker();
    await enqueue(send, {});
    await copy.start();
    await hold.arrived;

    const stopped = copy.stop(5_000);
    await enqueue(later, {});
    await new Promise((resolve) => setTimeout(resolve, 100));
    hold.open();
    await stopped;

    expect((await jobRows()).map((row) => [row.name, row.state])).toEqual([
      ["slack.delivery.send", "success"],
      ["website.clock.tick", "pending"],
    ]);
  });

  test("a stop while start writes the crons leaves no timer running", async () => {
    const seeding = gate();
    const { worker, operations, clock } = setUp([], { pollMs: 10, sweepMs: 10 });
    const copy = worker({ operations: around(operations, { before: (name) => (name === "crons.seed" ? seeding.opened : undefined) }) });

    const starting = copy.start();
    await copy.stop(50);
    seeding.open();
    await starting;
    // Another copy's action, past its deadline: a sweep timer left running would fail it.
    await db.insert(jobs).values({ _id: "stale", _creationTime: 1, name: "slack.delivery.send", args: "{}", runAt: 0, kind: "action", state: "running", deadline: clock.now() - 1 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect((await jobRows()).map((row) => row.state), "no sweep after the stop").toEqual(["running"]);
  });
});
