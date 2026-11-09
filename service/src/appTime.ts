// AppTime: the E2E suite's time seam (#95) on the app's clock and worker. `/testing/time` answers through it, and a
// test in the service drives it directly, with the same meaning and no HTTP.
import type { Clock } from "./clock.ts";
import type { CronId } from "./jobs/crons.ts";
import type { Settled, Worker } from "./jobs/worker.ts";

/** The app's clock after the step, the jobs that finished meanwhile by name, and whether it got there in its budget. */
export interface TimeAnswer {
  now: number;
  ran: string[];
  done: boolean;
}

export interface AppTime {
  /** Moves the clock forward; due jobs run on the worker's own time. A RangeError for a step back or past the last date. */
  advance(ms: number): TimeAnswer;
  /** Runs the cron's job once at the app's clock, then settles; a retired cron runs nothing. `undefined` while no job has its name. */
  runCron(id: CronId): Promise<TimeAnswer | undefined>;
  /** Runs every job due by the app's clock, and those they make due, until none is due or running. */
  settle(): Promise<TimeAnswer>;
}

export interface AppTimeOptions {
  clock: Clock;
  /** The worker crons and due jobs run on; without one, nothing is due. */
  worker?: Pick<Worker, "settle" | "runCron">;
  /** How long `runCron` and `settle` may work before they answer `done: false`. */
  budgetMs?: number;
}

export function createAppTime({ clock, worker, budgetMs = 25_000 }: AppTimeOptions): AppTime {
  const answer = ({ ran, done }: Settled): TimeAnswer => ({ now: clock.now(), ran, done });
  return {
    advance: (ms) => ({ now: clock.advance(ms), ran: [], done: true }),
    async runCron(id) {
      const settled = await worker?.runCron(id, budgetMs);
      return settled && answer(settled);
    },
    settle: async () => answer(worker ? await worker.settle(budgetMs) : { ran: [], done: true }),
  };
}
