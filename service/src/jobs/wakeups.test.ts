// The jobs table's wake: `enqueue` notifies its schema's jobs channel in the caller's transaction, which Postgres
// delivers only on commit, and a listening worker ticks at once instead of at its next poll.
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { createClock } from "../clock.ts";
import type { Log, LogFields } from "../log.ts";
import { createOperations } from "../operations.ts";
import { jobRegistry, mutationJob } from "./define.ts";
import { jobsChannel, listenForWakes } from "./wakeups.ts";
import { createWorker } from "./worker.ts";

const database = useTestDatabase();

function setUp() {
  const lines: Array<{ message: string } & LogFields> = [];
  const push = (message: string, fields: LogFields = {}) => lines.push({ message, ...fields });
  const log: Log = { info: push, error: push };
  const operations = createOperations({ pool: database.pool, clock: createClock(), log, retryDelayMs: () => 1 });
  const ran: string[] = [];
  const job = mutationJob("engine.give.award", z.object({ who: z.string() }), async (_ctx, { who }) => void ran.push(who));
  // An hour between polls: only a wake runs a job within the test.
  const worker = createWorker({ operations, log, registry: jobRegistry([job]), pollMs: 3_600_000 });
  onTestFinished(() => worker.stop(1_000));
  const listen = (retryMs = 5_000) => {
    const listener = listenForWakes({ pool: database.pool, log, retryMs, wakes: { jobs: () => void worker.tick() } });
    onTestFinished(() => listener.stop());
    return listener;
  };
  const enqueue = (who: string) => operations.mutation("enqueue", ({ jobs }) => jobs.enqueue(job, { who }));
  return { worker, listen, enqueue, ran, lines };
}

/** The backend holding the listener's connection, if it listens. */
async function listenerBackend(): Promise<number | undefined> {
  const { rows } = await database.pool.query<{ pid: number }>("select pid from pg_stat_activity where query = $1 and state = 'idle'", [
    `listen "${jobsChannel(database.schema)}"`,
  ]);
  return rows[0]?.pid;
}

describe("waking the worker", () => {
  test("a committed enqueue of a due job wakes a listening worker long before its next poll", async () => {
    const { worker, listen, enqueue, ran } = setUp();
    await worker.start();
    await listen().listening;

    await enqueue("ada");

    await vi.waitFor(() => expect(ran).toEqual(["ada"]), { timeout: 3_000 });
  });

  test("after its connection drops, the listener listens again and wakes the worker; it logs no error meanwhile", async () => {
    const { worker, listen, enqueue, ran, lines } = setUp();
    await worker.start();
    await listen(50).listening;
    const first = await listenerBackend();

    await database.pool.query("select pg_terminate_backend($1)", [first]);
    await vi.waitFor(async () => expect(await listenerBackend()).not.toBe(first), { timeout: 3_000 });
    await vi.waitFor(async () => expect(await listenerBackend()).toBeDefined(), { timeout: 3_000 });
    await enqueue("grace");

    await vi.waitFor(() => expect(ran).toEqual(["grace"]), { timeout: 3_000 });
    expect(lines.filter(({ message }) => !["job", "crons with no job yet"].includes(message)), "one line for the loss, no error").toEqual([
      { message: "job wakeups lost, polling until they are back", retryMs: 50, error: expect.any(String), code: "57P01" },
    ]);
  });
});
