// `ctx.jobs` in a mutation: jobs are rows written in the caller's transaction, so they commit or roll back with it.
import { and, eq } from "drizzle-orm";
import { encodeStored, type Value } from "../db/codec.ts";
import { jobs } from "../db/schema/service.ts";
import type { NewRow, Transaction } from "../operations.ts";
import type { Job } from "./define.ts";
import { notifyDue } from "./wakeups.ts";

/** When a job becomes due: at an instant, or after a delay from the operation's `now`. */
export type When = { at: number } | { after: number };

export interface Scheduler {
  /**
   * Schedules `job` with `args`, checked by its schema and stored as given, and answers the job's ID. Due now unless
   * `when` says.
   */
  enqueue<Args, Input>(job: Job<Args, Input>, args: Input, when?: When): Promise<string>;
  /** Cancels a job that hasn't started; one that runs or ran keeps its state. */
  cancel(id: string): Promise<void>;
}

export function createScheduler(tx: Transaction, now: number, newRow: () => NewRow): Scheduler {
  return {
    async enqueue(job, args, when = { after: 0 }) {
      const runAt = "at" in when ? when.at : now + when.after;
      if (!Number.isFinite(runAt)) throw new RangeError(`A job runs at a finite instant, not ${runAt}`);
      job.args.parse(args); // refused now, in the caller's transaction; its output is the run's, not the row's
      const { _id, _creationTime } = newRow();
      await tx.insert(jobs).values({ _id, _creationTime, name: job.name, args: encodeStored(args as Value), runAt, kind: job.kind, state: "pending" });
      if (runAt <= now) await notifyDue(tx); // a later job waits for the poll
      return _id;
    },
    async cancel(id) {
      await tx.update(jobs).set({ state: "canceled", completedAt: now }).where(and(eq(jobs._id, id), eq(jobs.state, "pending")));
    },
  };
}
