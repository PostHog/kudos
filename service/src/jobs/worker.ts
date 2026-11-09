// The worker: runs due jobs, at most `concurrency` at a time so they never starve Slack's acks, and fires the crons.
// - A slot claims the next due job in one transaction, `FOR UPDATE SKIP LOCKED`, so two copies never wait on each
//   other's job and a job one copy holds never blocks the next.
// - A mutation job runs in that same transaction, which also marks it `success`: exactly once. An app error rolls the
//   job's writes back to a savepoint and marks it `failed` before the transaction commits, so no copy can take it in
//   between; it never runs again. The database's trouble (a serialization failure past its retries, a lost connection)
//   is not the job's: it rolls everything back and the job stays pending for a later run.
// - An action job is marked `running` with a deadline in that transaction, before it starts, and never starts again;
//   the sweep marks one past its deadline `failed`. At most once, as on Convex.
// - A cron fires in the transaction that moves its next run forward, so of two copies only one fires it; a run
//   missed while no copy ran fires once, never as a backlog.
// - While the load holds (S18), nothing here writes: no cron, no claim, no sweep.
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { decodeStored } from "../db/codec.ts";
import { crons, jobs } from "../db/schema/service.ts";
import { errorFields, type Log } from "../log.ts";
import type { MutationContext, Operations, Transaction } from "../operations.ts";
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
  /** The load's hold (S18): while it holds, no cron is written or fired, no job starts and nothing is swept. */
  held?: () => boolean;
}

/** What `settle` did: the jobs that finished meanwhile, by name, and whether it got there within its budget. */
export interface Settled {
  ran: string[];
  done: boolean;
}

export interface Worker {
  /** Writes the crons' first runs, unless the load holds, then ticks every `pollMs`. */
  start(): Promise<void>;
  /** Fires the due crons and starts due jobs, once; nothing while the load holds. */
  tick(): Promise<void>;
  /** Runs every job due by the app's clock until none is due or running; jobs they schedule as due run too. */
  settle(budgetMs: number): Promise<Settled>;
  /**
   * Schedules the cron's job now and settles, both within `budgetMs`; a retired cron runs nothing. `undefined` when
   * no job has its name.
   */
  runCron(id: CronId, budgetMs: number): Promise<Settled | undefined>;
  /** Marks action jobs past their deadline `failed`, unless the load holds; runs every `sweepMs` once started. */
  sweep(): Promise<void>;
  /** Stops taking work, and waits up to `graceMs` for a start under way and the jobs that run. */
  stop(graceMs: number): Promise<void>;
}

/** `pending`: the database failed the attempt, so the job did nothing and waits for a later run. */
type Outcome = "success" | "failed" | "pending";

interface Ran {
  name: string;
  outcome: Outcome;
  error?: unknown;
}

/** What a slot's transaction claimed: a job it finished there, or an action marked running, to run outside it. */
type Claimed = { outcome: "success" | "failed"; error?: unknown } | { action: ActionJob; id: string; args: string };

export function createWorker({
  operations,
  log,
  registry,
  concurrency = 2,
  pollMs = 500,
  actionDeadlineMs = 600_000,
  sweepMs = 60_000,
  held = () => false,
}: WorkerOptions): Worker {
  const slots = new Set<Promise<void>>();
  const finished = new Set<(name: string) => void>();
  // Settles waiting for a slot to change; each removes its own when its budget runs out.
  const waiting = new Set<() => void>();
  const timers: NodeJS.Timeout[] = [];
  let stopping = false;
  let starting: Promise<void> | undefined;
  let seeded = false;
  let ticking: Promise<void> | undefined;
  let tickAgain = false;
  // Jobs this copy finished: a settle fills again only after one, so slots that find nothing never spin it.
  let progress = 0;

  function wake(): void {
    for (const resolve of waiting) resolve();
    waiting.clear();
  }

  // Starts slots until `concurrency` run. A slot that ran a job starts the next; one that found none, or whose
  // database failed it, ends, and the next poll looks again, so a job another copy holds never spins this one.
  function fill(): void {
    while (!stopping && !held() && slots.size < concurrency) {
      const slot: Promise<void> = runNext()
        .catch(() => undefined)
        .then((ran) => {
          slots.delete(slot);
          const progressed = ran !== undefined && ran.outcome !== "pending";
          if (progressed) {
            progress += 1;
            for (const listener of finished) listener(ran.name);
          }
          if (progressed || slots.size === 0) wake();
          if (progressed) fill();
        });
      slots.add(slot);
    }
  }

  async function runNext(): Promise<Ran | undefined> {
    const started = performance.now();
    let name: string | undefined;
    let claimed: Claimed | undefined;
    try {
      claimed = await operations.mutation("jobs.run", async (ctx) => {
        name = undefined;
        if (stopping || held()) return undefined;
        const [row] = await ctx.tx
          .select({ _id: jobs._id, name: jobs.name, args: jobs.args })
          .from(jobs)
          .where(and(eq(jobs.state, "pending"), lte(jobs.runAt, ctx.now)))
          .orderBy(asc(jobs.runAt), asc(jobs._creationTime), asc(jobs._id))
          .limit(1)
          .for("update", { skipLocked: true });
        if (!row || stopping || held()) return undefined; // the hold may have begun while it looked
        name = row.name;
        const job = registry.get(row.name);
        if (!job) {
          const error = new Error(`No job is registered as ${row.name}`);
          await markFailed(ctx.tx, ctx.now, row._id, error);
          return { outcome: "failed", error };
        }
        if (job.kind === "mutation") return runMutation(ctx, row._id, job, row.args);
        await ctx.tx.update(jobs).set({ state: "running", deadline: ctx.now + actionDeadlineMs }).where(eq(jobs._id, row._id));
        return { action: job, id: row._id, args: row.args };
      });
    } catch (error) {
      // The runner logged it. Whatever the transaction claimed rolled back: the job is still pending.
      if (name === undefined) return undefined;
      return report({ name, outcome: "pending", error }, started);
    }
    if (claimed === undefined || name === undefined) return undefined;
    if ("outcome" in claimed) return report({ name, ...claimed }, started);
    return report({ name, ...(await runAction(claimed)) }, started);
  }

  // The job's writes run inside a savepoint, so an app error undoes them and leaves the claim and its lock in place.
  async function runMutation(ctx: MutationContext, id: string, job: MutationJob, stored: string): Promise<Claimed> {
    await ctx.tx.execute(sql`savepoint job`);
    try {
      await job.handler(ctx, job.args.parse(decodeStored(stored)));
    } catch (error) {
      if (databaseTrouble(error)) throw error; // the runner retries it, or the job stays pending
      await ctx.tx.execute(sql`rollback to savepoint job`);
      await markFailed(ctx.tx, ctx.now, id, error);
      return { outcome: "failed", error };
    }
    await ctx.tx.update(jobs).set({ state: "success", completedAt: ctx.now }).where(eq(jobs._id, id));
    return { outcome: "success" };
  }

  async function runAction({ action, id, args }: Extract<Claimed, { action: ActionJob }>): Promise<Omit<Ran, "name">> {
    try {
      const parsed = action.args.parse(decodeStored(args));
      await operations.action(action.name, (ctx) => action.handler(ctx, parsed));
    } catch (error) {
      // The job is `running`, so no copy takes it meanwhile; if this fails too, the sweep fails it at its deadline.
      await operations.mutation("jobs.fail", ({ tx, now }) => markFailed(tx, now, id, error)).catch(() => {});
      return { outcome: "failed", error };
    }
    const done = await operations
      .mutation("jobs.finish", ({ tx, now }) =>
        tx
          .update(jobs)
          .set({ state: "success", completedAt: now })
          .where(and(eq(jobs._id, id), eq(jobs.state, "running")))
          .returning({ _id: jobs._id }),
      )
      .catch(() => []);
    return { outcome: done.length > 0 ? "success" : "failed" }; // else the sweep failed it first, or will
  }

  function report(ran: Ran, started: number): Ran {
    const { error, ...fields } = ran;
    log.info("job", { ...fields, durationMs: Math.round(performance.now() - started), ...(error === undefined ? {} : errorFields(error)) });
    return ran;
  }

  async function markFailed(tx: Transaction, now: number, id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "A value that is not an Error was thrown";
    await tx
      .update(jobs)
      .set({ state: "failed", error: message.slice(0, 2_000), completedAt: now })
      .where(and(eq(jobs._id, id), inArray(jobs.state, ["pending", "running"])));
  }

  async function sweep(): Promise<void> {
    if (held()) return;
    await operations.mutation("jobs.sweep", async ({ tx, now }) => {
      if (held()) return;
      await tx
        .update(jobs)
        .set({ state: "failed", error: "The action ran past its deadline", completedAt: now })
        .where(and(eq(jobs.state, "running"), lte(jobs.deadline, now)));
    });
  }

  async function fireDueCrons(): Promise<void> {
    const due = await operations.query("crons.due", ({ tx, now }) => tx.select({ id: crons.id }).from(crons).where(lte(crons.nextRun, now)));
    for (const { id } of due) {
      if (!isCronId(id)) continue;
      await operations.mutation("crons.fire", async ({ tx, now, jobs: scheduler }) => {
        if (stopping || held()) return;
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
  // who moved the clock never gets an answer from a tick that started before. It never rejects: a timer calls it, and
  // the runner has logged whatever failed; the next tick tries again.
  function tick(): Promise<void> {
    if (ticking) {
      tickAgain = true;
      return ticking;
    }
    ticking = (async () => {
      do {
        tickAgain = false;
        if (stopping || held()) return;
        if (!seeded) await seedCrons().catch(() => {});
        await fireDueCrons().catch(() => {});
        fill();
      } while (tickAgain);
    })().finally(() => (ticking = undefined));
    return ticking;
  }

  async function settle(budgetMs: number): Promise<Settled> {
    const ran: string[] = [];
    const listener = (name: string) => ran.push(name);
    finished.add(listener);
    let over = false;
    let woken: (() => void) | undefined;
    let timer: NodeJS.Timeout | undefined;
    const idle = async (): Promise<boolean> => {
      while (!over) {
        const before = progress;
        fill();
        while (slots.size > 0 && !over) {
          await new Promise<void>((resolve) => {
            woken = resolve;
            waiting.add(resolve);
          });
        }
        if (over) break;
        if (progress !== before) continue; // a job ran: the jobs it made due run next
        // Another copy's action past its deadline is failed first: done means every job's row says it is over.
        await sweep().catch(() => {});
        const busy = await operations.query("jobs.busy", ({ tx, now }) =>
          tx
            .select({ _id: jobs._id })
            .from(jobs)
            .where(or(and(eq(jobs.state, "pending"), lte(jobs.runAt, now)), eq(jobs.state, "running")))
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
      // Lets go of the wait, so a settle that ran out of budget keeps nothing alive until the running job ends.
      over = true;
      if (woken) {
        waiting.delete(woken);
        woken();
      }
      clearTimeout(timer);
      finished.delete(listener);
    }
  }

  // Each cron's first run, once per copy; a row another copy wrote stays as it is.
  async function seedCrons(): Promise<void> {
    const wrote = await operations.mutation("crons.seed", async ({ tx, now }) => {
      if (held()) return false;
      const rows = cronIds.filter((id) => !retiredCrons.has(id)).map((id) => ({ id, nextRun: nextRun(cronSchedules[id], now) }));
      await tx.insert(crons).values(rows).onConflictDoNothing();
      return true;
    });
    seeded ||= wrote;
  }

  return {
    start() {
      if (stopping) return Promise.resolve();
      starting = (async () => {
        if (!held()) await seedCrons();
        if (stopping) return; // stopped while it wrote the crons: no timer outlives the stop
        const waitingCrons = cronIds.filter((id) => !retiredCrons.has(id) && !registry.has(id));
        if (waitingCrons.length > 0) log.info("crons with no job yet", { crons: waitingCrons.join(" ") });
        timers.push(setInterval(() => void tick(), pollMs).unref());
        timers.push(setInterval(() => void sweep().catch(() => {}), sweepMs).unref());
        void tick();
      })();
      return starting;
    },
    tick,
    settle,
    async runCron(id, budgetMs) {
      if (retiredCrons.has(id)) return { ran: [], done: true };
      const job = registry.get(id);
      if (!job) return undefined;
      const deadline = performance.now() + budgetMs;
      const enqueued = operations.mutation("crons.run", ({ jobs: scheduler }) => scheduler.enqueue(job, {}));
      let timer: NodeJS.Timeout | undefined;
      const inTime = await Promise.race([enqueued.then(() => true), new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), budgetMs)))]);
      clearTimeout(timer);
      if (!inTime) {
        enqueued.catch(() => {}); // logged by the runner; if it commits later, the job runs on a later tick
        return { ran: [], done: false };
      }
      return settle(Math.max(0, deadline - performance.now()));
    },
    sweep,
    async stop(graceMs) {
      stopping = true;
      for (const timer of timers) clearInterval(timer);
      let timer: NodeJS.Timeout | undefined;
      const under = [starting, ticking, ...slots].map((work) => work?.catch(() => {}));
      await Promise.race([Promise.all(under), new Promise((resolve) => (timer = setTimeout(resolve, graceMs)))]);
      clearTimeout(timer);
    },
  };
}

// The database's trouble, not the job's: the attempt did nothing, so the job may run again. A serialization failure
// or deadlock (the runner retries those first), a connection that failed or was refused, a server that is shutting
// down or out of resources, a statement cancelled (the service sets no statement timeout, so an operator or a client
// cancelled it), a lock it could not get in time.
function databaseTrouble(error: unknown): boolean {
  const { code } = errorFields(error);
  return code !== undefined && (/^(08|40|53|57|58)/.test(code) || code === "55P03" || /^E[A-Z]+$/.test(code) || code.startsWith("DB_"));
}
