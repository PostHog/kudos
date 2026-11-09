import { describe, expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../testing/database.ts";
import { createAppTime } from "./appTime.ts";
import { createClock } from "./clock.ts";
import { jobRegistry, mutationJob, type Job } from "./jobs/define.ts";
import { createWorker } from "./jobs/worker.ts";
import type { Log } from "./log.ts";
import { createOperations } from "./operations.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const start = Date.UTC(2026, 0, 5, 9);

function setUp(jobs: Job[]) {
  const clock = createClock({ real: () => start });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
  const worker = createWorker({ operations, log: quiet, registry: jobRegistry(jobs) });
  return { clock, operations, time: createAppTime({ clock, worker, budgetMs: 10_000 }) };
}

const noArgs = z.object({});
const later = mutationJob("test.later", noArgs, async () => {});
const followUp = mutationJob("test.followUp", noArgs, async () => {});
const first = mutationJob("test.first", noArgs, async ({ jobs }) => {
  await jobs.enqueue(followUp, {});
  await jobs.enqueue(later, {}, { after: 60_000 });
});
const tick = mutationJob("website.clock.tick", noArgs, async ({ jobs }) => void (await jobs.enqueue(followUp, {})));

describe("AppTime in-process", () => {
  test("advance moves the app's clock and answers the new now; a step back or past the last date moves nothing", () => {
    const { clock, time } = setUp([]);

    expect(time.advance(60_000), "a minute on").toEqual({ now: start + 60_000, ran: [], done: true });
    expect(clock.now(), "the clock").toBe(start + 60_000);
    expect(() => time.advance(-1), "a step back").toThrow(RangeError);
    expect(() => time.advance(1e300), "past the last date").toThrow(RangeError);
    expect(clock.now(), "the clock after the refusals").toBe(start + 60_000);
  });

  test("settle runs every due job and those they make due, and a later one only once the clock reaches it", async () => {
    const { operations, time } = setUp([first, followUp, later]);
    await operations.mutation("test.schedule", ({ jobs }) => jobs.enqueue(first, {}));

    expect(await time.settle(), "what is due now").toEqual({ now: start, ran: ["test.first", "test.followUp"], done: true });
    expect(await time.settle(), "nothing more is due").toEqual({ now: start, ran: [], done: true });

    time.advance(60_000);
    expect(await time.settle(), "a minute on").toEqual({ now: start + 60_000, ran: ["test.later"], done: true });
  });

  test("runCron runs the cron's job at the app's clock, then settles", async () => {
    const { time } = setUp([tick, followUp]);
    time.advance(5_000);

    expect(await time.runCron("website.clock.tick")).toEqual({ now: start + 5_000, ran: ["website.clock.tick", "test.followUp"], done: true });
  });

  test("runCron answers nothing for a cron no job runs yet, and a retired cron runs nothing", async () => {
    const { time } = setUp([]);

    expect(await time.runCron("slack.receipts.deleteExpired"), "no job yet").toBeUndefined();
    expect(await time.runCron("website.abandonedHandshakes.deleteAbandoned"), "retired").toEqual({ now: start, ran: [], done: true });
  });

  test("without a worker, nothing is due and no cron runs", async () => {
    const clock = createClock({ real: () => start });
    const time = createAppTime({ clock });

    expect(await time.settle(), "settle").toEqual({ now: start, ran: [], done: true });
    expect(await time.runCron("website.clock.tick"), "runCron").toBeUndefined();
  });
});
