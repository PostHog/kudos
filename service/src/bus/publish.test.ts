import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { createClock } from "../clock.ts";
import { decodeStored } from "../db/codec.ts";
import { archive, jobs } from "../db/schema/service.ts";
import { mutationJob } from "../jobs/define.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { createRegistry } from "../registration.ts";
import type { Subscription } from "./publish.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };

type KudosGiven = { type: "kudosGiven"; giver: string; kudos: number };
const kudosGiven = z.object({ event: z.object({ type: z.literal("kudosGiven"), giver: z.string(), kudos: z.number(), fact: z.string() }) });

// Each subscriber leaves a row in the archive table with the event it got.
const subscriber = (name: string) =>
  mutationJob(name, kudosGiven, async ({ tx, newRow }, { event }) => {
    await tx.insert(archive).values({ source: "test", table: name, ...newRow(), document: JSON.stringify(event) });
  });
const welcome = subscriber("welcome.welcome.welcomeNewMembers");
const progression = subscriber("progression.progression.recordEffects");
const bigGives = subscriber("analytics.subscribers.recordBigGive");
const levelUp = mutationJob("unlocks.unlocks.makeReady", z.object({ event: z.object({ type: z.literal("levelReached") }) }), async () => {});

function setUp() {
  const subscriptions: Subscription<any>[] = [
    { event: "kudosGiven", job: welcome },
    { event: "levelReached", job: levelUp },
    { event: "kudosGiven", job: progression },
    { event: "kudosGiven", job: bigGives, only: (event: KudosGiven) => event.kudos >= 3 },
  ];
  const registry = createRegistry({ welcome: { subscribers: subscriptions } });
  const clock = createClock({ real: () => 1_800_000_000_000 });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1, subscribers: registry.subscribers });
  const worker = createWorker({ operations, log: quiet, registry: registry.jobs, pollMs: 3_600_000 });
  return { operations, worker };
}

const scheduled = async () =>
  (await db.select({ name: jobs.name, args: jobs.args }).from(jobs).orderBy(asc(jobs._creationTime))).map(({ name, args }) => ({ name, args: decodeStored(args) }));

test("publishing an event schedules each of its type's subscribers in the same transaction, in order, with one fact", async () => {
  const { operations } = setUp();

  await operations.mutation("engine.give", (ctx) => ctx.publish({ type: "kudosGiven", giver: "m1", kudos: 1 } as KudosGiven));

  const rows = await scheduled();
  expect(rows.map(({ name }) => name)).toEqual(["welcome.welcome.welcomeNewMembers", "progression.progression.recordEffects"]);
  const [first, second] = rows.map(({ args }) => (args as { event: Record<string, unknown> }).event);
  expect(first).toEqual({ type: "kudosGiven", giver: "m1", kudos: 1, fact: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  expect(second).toEqual(first);
});

test("a subscriber with a condition is scheduled only for the events it accepts", async () => {
  const { operations } = setUp();

  await operations.mutation("engine.give", async (ctx) => {
    await ctx.publish({ type: "kudosGiven", giver: "m1", kudos: 3 } as KudosGiven);
    await ctx.publish({ type: "kudosGiven", giver: "m2", kudos: 2 } as KudosGiven);
  });

  const names = (await scheduled()).map(({ name }) => name);
  expect(names.filter((name) => name === "analytics.subscribers.recordBigGive")).toHaveLength(1);
  expect(names).toHaveLength(5);
});

test("an event whose mutation rolls back schedules nothing", async () => {
  const { operations } = setUp();

  const failed = operations.mutation("engine.give", async (ctx) => {
    await ctx.publish({ type: "kudosGiven", giver: "m1", kudos: 1 } as KudosGiven);
    throw new Error("the give failed after publishing");
  });

  await expect(failed).rejects.toThrow("the give failed");
  expect(await scheduled()).toEqual([]);
});

test("an event type with no subscriber schedules nothing", async () => {
  const { operations } = setUp();
  await operations.mutation("engine.give", (ctx) => ctx.publish({ type: "perkBought" }));
  expect(await scheduled()).toEqual([]);
});

test("the subscribers run on the worker with the event they were scheduled with", async () => {
  const { operations, worker } = setUp();
  await operations.mutation("engine.give", (ctx) => ctx.publish({ type: "kudosGiven", giver: "m1", kudos: 4 } as KudosGiven));

  const settled = await worker.settle(10_000);

  expect(settled.ran.sort()).toEqual(["analytics.subscribers.recordBigGive", "progression.progression.recordEffects", "welcome.welcome.welcomeNewMembers"]);
  const got = await db.select({ table: archive.table, document: archive.document }).from(archive);
  expect(new Set(got.map(({ document }) => document)).size, "every subscriber got the same event").toBe(1);
  expect(JSON.parse(got[0]!.document)).toMatchObject({ type: "kudosGiven", giver: "m1", kudos: 4 });
});
