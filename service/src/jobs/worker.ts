// The worker: runs due jobs, at most `concurrency` at a time so they never starve Slack's acks, and fires the crons.
// - A mutation job runs in one transaction that also marks it `success`: exactly once. An app error rolls it back,
//   marks it `failed` in a transaction of its own, and it never runs again.
// - An action job is marked `running` with a deadline before it starts and never starts again; the sweep marks one
//   past its deadline `failed`. At most once, as on Convex.
// - A cron fires in the transaction that moves its next run forward, so of two copies only one fires it; a run
//   missed while no copy ran fires once, never as a backlog.
// Two copies share the work through `FOR UPDATE SKIP LOCKED`: neither waits on the other's job, and none runs twice.
import { and, asc, eq, gt, inArray, lte, notInArray, or } from "drizzle-orm";
import { decodeStored } from "../db/codec.ts";
import { crons, jobs } from "../db/schema/service.ts";
import type { Log } from "../log.ts";
import type { Operations } from "../operations.ts";
import { cronIds, cronSchedules, isCronId, nextRun, retiredCrons, type CronId } from "./crons.ts";
import type { ActionJob, JobRegistry, MutationJob } from "./define.ts";

export interface WorkerOptions {
  operations: Operations;
  log: Log;
  registry: JobRegistry;
  /** Jobs running at once in this copy. */
  concurrency?: number;
  /** How often the worker looks for due jobs and crons, in real milliseconds. */
  pollMs?: number;
  /** How long an action job may run before the sweep marks it failed, by the app's clock. */
  actionDeadlineMs?: number;
  /** How often the sweep looks for action jobs past their deadline, in real milliseconds. */
  sweepMs?: number;
}

/** What `settle` did: the jobs that finished meanwhile, by name, and whether it got there within its budget. */
export interface Settled {
  ran: string[];
  done: boolean;
}

export interface Worker {
  /** Writes the crons' first runs, then ticks every `pollMs`. */
  start(): Promise<void>;
  /** Fires the due crons and starts due jobs, once. */
  tick(): Promise<void>;
  /** Runs every job due by the app's clock until none is due or running; jobs they schedule as due run too. */
  settle(budgetMs: number): Promise<Settled>;
  /** Schedules the cron's job now and settles; a retired cron runs nothing. `undefined` when no job has its name. */
  runCron(id: CronId, budgetMs: number): Promise<Settled | undefined>;
  /** Marks action jobs past their deadline `failed`; runs every `sweepMs` once started. */
  sweep(): Promise<void>;
  /** Stops taking work, and waits up to `graceMs` for the jobs that run. */
  stop(graceMs: number): Promise<void>;
}

type Outcome = "success" | "failed" | "skipped";

export function createWorker({ operations, log, registry, concurrency = 2, pollMs = 500, actionDeadlineMs = 600_000, sweepMs = 60_000 }: WorkerOptions): Worker {
  const running = new Map<string, Promise<void>>();
  const finished = new Set<(name: string) => void>();
  const timers: NodeJS.Timeout[] = [];
  let stopping = false;
  let filling: Promise<void> | undefined;
  let fillAgain = false;
  let ticking: Promise<void> | undefined;
  let tickAgain = false;

  // Starts due jobs until `concurrency` run. A call while one fills makes that one look again when it is done.
  function fill(): Promise<void> {
    if (filling) {
      fillAgain = true;
      return filling;
    }
    filling = (async () => {
      do {
        fillAgain = false;
        const free = concurrency - running.size;
        if (stopping || free <= 0) return;
        const due = await operations.query("jobs.due", ({ tx, now }) =>
          tx
            .select({ _id: jobs._id, name: jobs.name })
            .from(jobs)
            .where(and(eq(jobs.state, "pending"), lte(jobs.runAt, now), notInArray(jobs._id, [...running.keys()])))
            .orderBy(asc(jobs.runAt), asc(jobs._creationTime), asc(jobs._id))
            .limit(free),
        );
        if (stopping) return;
        for (const { _id, name } of due) {
          running.set(
            _id,
            run(_id, name).finally(() => {
              running.delete(_id);
              void fill();
            }),
          );
        }
      } while (fillAgain);
    })()
      .catch(() => {}) // the query logged it; the next poll tries again
      .finally(() => (filling = undefined));
    return filling;
  }

  async function run(id: string, name: string): Promise<void> {
    const started = performance.now();
    const job = registry.get(name);
    let outcome: Outcome;
    try {
      if (!job) outcome = await markFailed(id, new Error(`No job is registered as ${name}`));
      else outcome = job.kind === "mutation" ? await runMutation(id, job) : await runAction(id, job);
    } catch {
      outcome = "failed"; // marking it failed failed too, and was logged; the job keeps its state
    }
    log.info("job", { name, outcome, durationMs: Math.round(performance.now() - started) });
    if (outcome !== "skipped") for (const listener of finished) listener(name);
  }

  async function runMutation(id: string, job: MutationJob): Promise<Outcome> {
    try {
      const ran = await operations.mutation(job.name, async (ctx) => {
        const [row] = await ctx.tx
          .select({ args: jobs.args })
          .from(jobs)
          .where(and(eq(jobs._id, id), eq(jobs.state, "pending")))
          .for("update", { skipLocked: true });
        if (!row) return false; // another copy runs it, or ran it
        await job.handler(ctx, job.args.parse(decodeStored(row.args)));
        await ctx.tx.update(jobs).set({ state: "success", completedAt: ctx.now }).where(eq(jobs._id, id));
        return true;
      });
      return ran ? "success" : "skipped";
    } catch (error) {
      return markFailed(id, error);
    }
  }

  async function runAction(id: string, job: ActionJob): Promise<Outcome> {
    const claimed = await operations.mutation("jobs.claim", async ({ tx, now }) => {
      const [row] = await tx
        .select({ args: jobs.args })
        .from(jobs)
        .where(and(eq(jobs._id, id), eq(jobs.state, "pending")))
        .for("update", { skipLocked: true });
      if (row) await tx.update(jobs).set({ state: "running", deadline: now + actionDeadlineMs }).where(eq(jobs._id, id));
      return row?.args;
    });
    if (claimed === undefined) return "skipped";
    try {
      const args = job.args.parse(decodeStored(claimed));
      await operations.action(job.name, (ctx) => job.handler(ctx, args));
    } catch (error) {
      return markFailed(id, error);
    }
    const done = await operations.mutation("jobs.finish", ({ tx, now }) =>
      tx
        .update(jobs)
        .set({ state: "success", completedAt: now })
        .where(and(eq(jobs._id, id), eq(jobs.state, "running")))
        .returning({ _id: jobs._id }),
    );
    return done.length > 0 ? "success" : "failed"; // the sweep failed it first: it ran past its deadline
  }

  async function markFailed(id: string, error: unknown): Promise<Outcome> {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "A value that is not an Error was thrown";
    await operations.mutation("jobs.fail", ({ tx, now }) =>
      tx
        .update(jobs)
        .set({ state: "failed", error: message.slice(0, 2_000), completedAt: now })
        .where(and(eq(jobs._id, id), inArray(jobs.state, ["pending", "running"]))),
    );
    return "failed";
  }

  async function sweep(): Promise<void> {
    await operations.mutation("jobs.sweep", ({ tx, now }) =>
      tx
        .update(jobs)
        .set({ state: "failed", error: "The action ran past its deadline", completedAt: now })
        .where(and(eq(jobs.state, "running"), lte(jobs.deadline, now))),
    );
  }

  async function fireDueCrons(): Promise<void> {
    const due = await operations.query("crons.due", ({ tx, now }) => tx.select({ id: crons.id }).from(crons).where(lte(crons.nextRun, now)));
    for (const { id } of due) {
      if (!isCronId(id)) continue;
      await operations.mutation("crons.fire", async ({ tx, now, jobs: scheduler }) => {
        const [row] = await tx
          .select({ id: crons.id })
          .from(crons)
          .where(and(eq(crons.id, id), lte(crons.nextRun, now)))
          .for("update", { skipLocked: true });
        if (!row) return; // another copy fired it
        await tx.update(crons).set({ nextRun: nextRun(cronSchedules[id], now) }).where(eq(crons.id, id));
        const job = registry.get(id);
        if (job) await scheduler.enqueue(job, {});
      });
    }
  }

  // Fires the due crons, then fills. A call while one ticks makes that one tick again when it is done, so a caller
  // who moved the clock never gets an answer from a tick that started before.
  function tick(): Promise<void> {
    if (ticking) {
      tickAgain = true;
      return ticking;
    }
    ticking = (async () => {
      do {
        tickAgain = false;
        if (stopping) return;
        await fireDueCrons().catch(() => {}); // logged by the runner; the next tick tries again
        await fill();
      } while (tickAgain);
    })().finally(() => (ticking = undefined));
    return ticking;
  }

  async function settle(budgetMs: number): Promise<Settled> {
    const ran: string[] = [];
    const listener = (name: string) => ran.push(name);
    finished.add(listener);
    let over = false;
    let timer: NodeJS.Timeout | undefined;
    const idle = async (): Promise<boolean> => {
      while (!over) {
        await fill();
        if (running.size > 0) {
          await Promise.race(running.values());
          continue;
        }
        const busy = await operations.query("jobs.busy", ({ tx, now }) =>
          tx
            .select({ _id: jobs._id })
            .from(jobs)
            .where(or(and(eq(jobs.state, "pending"), lte(jobs.runAt, now)), and(eq(jobs.state, "running"), gt(jobs.deadline, now))))
            .limit(1),
        );
        if (busy.length === 0) return true;
        await new Promise((resolve) => setTimeout(resolve, 20)); // another copy runs it
      }
      return false;
    };
    try {
      const done = await Promise.race([idle(), new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), budgetMs)))]);
      return { ran, done };
    } finally {
      over = true;
      clearTimeout(timer);
      finished.delete(listener);
    }
  }

  return {
    async start() {
      await operations.mutation("crons.seed", async ({ tx, now }) => {
        const rows = cronIds.filter((id) => !retiredCrons.has(id)).map((id) => ({ id, nextRun: nextRun(cronSchedules[id], now) }));
        await tx.insert(crons).values(rows).onConflictDoNothing();
      });
      const waiting = cronIds.filter((id) => !retiredCrons.has(id) && !registry.has(id));
      if (waiting.length > 0) log.info("crons with no job yet", { crons: waiting.join(" ") });
      timers.push(setInterval(() => void tick(), pollMs).unref());
      timers.push(setInterval(() => void sweep().catch(() => {}), sweepMs).unref());
      void tick();
    },
    tick,
    settle,
    async runCron(id, budgetMs) {
      if (retiredCrons.has(id)) return { ran: [], done: true };
      const job = registry.get(id);
      if (!job) return undefined;
      await operations.mutation("crons.run", ({ jobs: scheduler }) => scheduler.enqueue(job, {}));
      return settle(budgetMs);
    },
    sweep,
    async stop(graceMs) {
      stopping = true;
      for (const timer of timers) clearInterval(timer);
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([Promise.all(running.values()), new Promise((resolve) => (timer = setTimeout(resolve, graceMs)))]);
      clearTimeout(timer);
    },
  };
}
