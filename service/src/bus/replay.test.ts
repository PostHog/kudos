// The port of convex/bus/replay.test.ts (HH17): an operator replays a failed subscriber's job by hand, and the service
// replays each failed job once. The subscribers here are the test's own, as publish.test.ts's are, so the replay is
// proved on the bus alone, without waiting on the stacks that port today's subscribers.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { createClock } from "../clock.ts";
import { archive, jobs } from "../db/schema/service.ts";
import { mutationJob } from "../jobs/define.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { createRegistry } from "../registration.ts";
import type { Subscription } from "./publish.ts";
import { replay } from "./replay.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };

type KudosGiven = { type: "kudosGiven"; giver: string };
const kudosGiven = z.object({ event: z.object({ type: z.literal("kudosGiven"), giver: z.string(), fact: z.string() }) });
const anyArgs = z.record(z.string(), z.unknown());

// The subscriber leaves a row in the archive table with the event it got, and throws while `failing` says so.
let failing = false;
const recordKudosGiven = mutationJob("analytics.subscribers.recordKudosGiven", kudosGiven, async ({ tx, newRow }, { event }) => {
  if (failing) throw new Error("no randomness today");
  await tx.insert(archive).values({ source: "test", table: "recordKudosGiven", ...newRow(), document: JSON.stringify(event) });
});
// A job each subscriber delivery can schedule to finish its work, named as today's are.
const finishers = ["album.tallies.tallyHug", "album.milestones.recordMilestonesOfStickerHolders", "engine.kudosText.forgetAuthoredWords", "quests.journey.recheckSomeoneNewOf"].map((name) =>
  mutationJob(name, anyArgs, async () => {
    throw new Error(`${name} failed`);
  }),
);
const republishAdmins = mutationJob("feedback.homes.republishAdminsIn", anyArgs, async () => {
  throw new Error("republishing failed");
});

function setUp() {
  failing = false;
  const subscriptions: Subscription<any>[] = [{ event: "kudosGiven", job: recordKudosGiven }];
  const registry = createRegistry({ bus: { subscribers: subscriptions, jobs: [...finishers, republishAdmins] } });
  const clock = createClock({ real: () => 1_800_000_000_000 });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1, subscribers: registry.subscribers });
  const worker = createWorker({ operations, log: quiet, registry: registry.jobs, pollMs: 3_600_000 });
  const replayed = (job: string) => operations.mutation("bus.replay.replay", (ctx) => replay(ctx, registry, { job }));
  return { operations, worker, replayed };
}

async function jobsNamed(name: string) {
  return db.select({ _id: jobs._id, state: jobs.state }).from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime));
}

async function kudosGivenRecorded() {
  return (await db.select({ document: archive.document }).from(archive)).map(({ document }) => JSON.parse(document) as KudosGiven);
}

test("a failed subscriber runs again with its stored event, and only once however often it is replayed", async () => {
  const { operations, worker, replayed } = setUp();
  failing = true;
  await operations.mutation("engine.give", (ctx) => ctx.publish({ type: "kudosGiven", giver: "m1" } as KudosGiven));
  await worker.settle(10_000);
  const [failed] = await jobsNamed(recordKudosGiven.name);
  expect(failed?.state, "the subscriber's job").toBe("failed");
  failing = false;

  expect(await replayed(failed!._id)).toBe("replayed");
  await worker.settle(10_000);
  expect(await replayed(failed!._id)).toBe("already replayed");
  await worker.settle(10_000);

  expect(await kudosGivenRecorded(), "the kudos given the subscriber recorded").toEqual([expect.objectContaining({ type: "kudosGiven", giver: "m1" })]);
});

test("two replays of one job at once run it once", async () => {
  const { operations, worker, replayed } = setUp();
  failing = true;
  await operations.mutation("engine.give", (ctx) => ctx.publish({ type: "kudosGiven", giver: "m1" } as KudosGiven));
  await worker.settle(10_000);
  const [failed] = await jobsNamed(recordKudosGiven.name);
  failing = false;

  const answers = await Promise.all([replayed(failed!._id), replayed(failed!._id)]);
  await worker.settle(10_000);

  expect(answers.toSorted()).toEqual(["already replayed", "replayed"]);
  expect(await kudosGivenRecorded()).toHaveLength(1);
});

test("a job that did not fail is not replayed", async () => {
  const { operations, worker, replayed } = setUp();
  await operations.mutation("engine.give", (ctx) => ctx.publish({ type: "kudosGiven", giver: "m1" } as KudosGiven));
  await worker.settle(10_000);
  const [recorded] = await jobsNamed(recordKudosGiven.name);

  expect(await replayed(recorded!._id)).toBe("not failed");
  await worker.settle(10_000);

  expect(await kudosGivenRecorded()).toHaveLength(1);
});

test("a job that does not exist is not replayed", async () => {
  const { replayed } = setUp();
  expect(await replayed("no-such-job")).toBe("not failed");
});

test.each([
  ["the next tally page of a hug", "album.tallies.tallyHug"],
  ["the next sticker holder of the milestones", "album.milestones.recordMilestonesOfStickerHolders"],
  ["the next page of a leaver's forgotten words", "engine.kudosText.forgetAuthoredWords"],
  ["the journey recheck of one member", "quests.journey.recheckSomeoneNewOf"],
])("a failed job of %s, which a subscriber schedules to finish its delivery, is replayed", async (_, name) => {
  const { operations, worker, replayed } = setUp();
  await operations.mutation("test.schedule", (ctx) => ctx.jobs.enqueue(finishers.find((job) => job.name === name)!, { stale: "arguments" }));
  await worker.settle(10_000);
  const [failed] = await jobsNamed(name);

  expect(await replayed(failed!._id)).toBe("replayed");
  expect((await jobsNamed(name)).map(({ state }) => state), "the failed job and its replay").toEqual(["failed", "pending"]);
});

test("a failed job of a function that is no subscriber is not replayed", async () => {
  const { operations, worker, replayed } = setUp();
  await operations.mutation("test.schedule", (ctx) => ctx.jobs.enqueue(republishAdmins, { stale: "arguments" }));
  await worker.settle(10_000);
  const [failed] = await jobsNamed(republishAdmins.name);

  expect(await replayed(failed!._id)).toBe("not a subscriber");
  expect((await jobsNamed(republishAdmins.name)).map(({ state }) => state)).toEqual(["failed"]);
});

test("the operator's command replays the job it names on the service's database and prints the answer", async () => {
  const command = fileURLToPath(new URL("./replayJob.ts", import.meta.url));
  const run = promisify(execFile);

  const { stdout } = await run(process.execPath, [command, "no-such-job"], { env: { ...process.env, DATABASE_URL: database.url } });
  expect(stdout.trim()).toBe("not failed");

  const withoutJob = run(process.execPath, [command], { env: { ...process.env, DATABASE_URL: database.url } });
  await expect(withoutJob).rejects.toMatchObject({ code: 2, stderr: expect.stringContaining("node src/bus/replayJob.ts <job id>") });
});
