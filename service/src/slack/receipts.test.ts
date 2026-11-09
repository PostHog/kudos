import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { createClock } from "../clock.ts";
import { jobs } from "../db/schema/service.ts";
import { slackReceipts } from "../db/schema/slack.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import { deleteExpiredReceipts } from "./receipts.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };
const day = 24 * 60 * 60 * 1000;

function setUp() {
  const clock = createClock({ real: () => 1_800_000_000_000 });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
  const worker = createWorker({ operations, log: quiet, registry: serviceRegistry.jobs, pollMs: 3_600_000 });
  return { clock, worker };
}

async function receiptsAt(...ages: number[]) {
  const now = 1_800_000_000_000;
  await db.insert(slackReceipts).values(ages.map((age, n) => ({ _id: `r${n}`, _creationTime: now - age, workspace: "T_TEST", eventId: `Ev${n}` })));
}
const kept = async () => (await db.select({ eventId: slackReceipts.eventId }).from(slackReceipts).orderBy(asc(slackReceipts.eventId))).map(({ eventId }) => eventId);

test("the receipts cron runs the front door's job, which keeps a week of receipts by the app's clock", async () => {
  expect(serviceRegistry.jobs.get("slack.receipts.deleteExpired")).toBe(deleteExpiredReceipts);
  const { worker } = setUp();
  await receiptsAt(8 * day, 7 * day + 1, 7 * day - 60_000, 1 * day);

  const settled = await worker.runCron("slack.receipts.deleteExpired", 10_000);

  expect(settled).toEqual({ ran: ["slack.receipts.deleteExpired"], done: true });
  expect(await kept()).toEqual(["Ev2", "Ev3"]);
});

test("more than a batch of expired receipts goes in batches, each run scheduling the next", async () => {
  const { worker } = setUp();
  await receiptsAt(...Array.from({ length: 501 }, () => 8 * day), 1 * day);

  const settled = await worker.runCron("slack.receipts.deleteExpired", 20_000);

  expect(settled).toEqual({ ran: ["slack.receipts.deleteExpired", "slack.receipts.deleteExpired"], done: true });
  expect(await kept()).toEqual(["Ev501"]);
  expect((await db.select({ name: jobs.name, state: jobs.state }).from(jobs)).map(({ state }) => state)).toEqual(["success", "success"]);
});

test("the app's clock decides what a week ago is", async () => {
  const { clock, worker } = setUp();
  await receiptsAt(1 * day);
  clock.advance(7 * day);

  await worker.runCron("slack.receipts.deleteExpired", 10_000);

  expect(await kept()).toEqual([]);
});
