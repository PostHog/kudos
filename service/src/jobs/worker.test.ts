import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { createClock } from "../clock.ts";
import { archive, crons, jobs } from "../db/schema/service.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext } from "../operations.ts";
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
  const enqueue = <Args>(job: Job<Args>, args: Args, when?: { at: number } | { after: number }) =>
    operations.mutation("enqueue", ({ jobs: scheduler }) => scheduler.enqueue(job, args, when));
  return { clock, operations, worker, enqueue };
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

  test("an app error rolls the job's writes back, marks it failed in a transaction of its own, and it never runs again", async () => {
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
    await survivor.sweep();
    expect(await jobRows()).toEqual([{ name: "slack.delivery.send", state: "failed", error: "The action ran past its deadline" }]);
    expect(await survivor.settle(5_000)).toEqual({ ran: [], done: true });

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
});
