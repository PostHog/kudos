// `paginate` as the app's paged loops use it: a job reads a page, then schedules itself with the continue cursor until
// the walk is done, so the cursor round-trips through the jobs table's stored args between pages. Driven through the
// worker against Postgres, over an index with every awkward value and over a whole table by creation time.
import { and, eq, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import { jobRegistry, mutationJob } from "../jobs/define.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { toDocument } from "./documents.ts";
import { indexOrder, type Direction } from "./indexOrder.ts";
import { paginate, type PagedQuery } from "./page.ts";
import { kudosMessages, primaryGroupHistory, type Doc } from "./schema/index.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };

function walker(query: PagedQuery, numItems: number) {
  const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => 1_800_000_000_000 }), log: quiet, retryDelayMs: () => 1 });
  const pages: string[][] = [];
  const walk = mutationJob("test.walk", z.object({ cursor: z.string().nullable() }), async (ctx, { cursor }) => {
    const { page, isDone, continueCursor } = await paginate<{ _id: string }>(ctx.tx, query, { cursor, numItems });
    pages.push(page.map(({ _id }) => _id));
    if (!isDone) await ctx.jobs.enqueue(walk, { cursor: continueCursor });
  });
  const worker = createWorker({ operations, log: quiet, registry: jobRegistry([walk]), pollMs: 3_600_000 });
  return {
    seed: seeder(operations),
    async run() {
      await operations.mutation("test.start", (ctx) => ctx.jobs.enqueue(walk, { cursor: null }));
      expect(await worker.settle(20_000)).toMatchObject({ done: true });
      return pages;
    },
  };
}

async function inOrder(query: PagedQuery, direction: Direction): Promise<string[]> {
  const rows = await db.select().from(query.table).where(query.where).orderBy(...query.order.orderBy(direction));
  return rows.map((row) => toDocument<{ _id: string }>(query.table, row)._id);
}

test.each(["asc", "desc"] as const)("a job walking an index %s with every awkward value schedules itself with the cursor and reads each row once, in order", async (direction) => {
  const query: PagedQuery = { table: kudosMessages, order: indexOrder(kudosMessages, ["state", "nextCheckAt"]), direction };
  const { seed, run } = walker(query, 3);
  const message = { workspace: "T1", conversation: "C1", author: "U1", revision: 1n, attempt: 1n, content: { mentions: [], emoji: [] }, annotations: {}, spendsAt: 0, checks: 0 };
  let n = 0;
  for (const state of ["watermark", "given"] as const)
    for (const nextCheckAt of [10, undefined, 0, -0, -3, Number.NaN, Infinity, -Infinity, 10])
      await seed.insert("kudosMessages", { ...message, message: String(n++), state, ...(nextCheckAt === undefined ? {} : { nextCheckAt }) } as never);

  const pages = await run();

  expect(pages.flat()).toEqual(await inOrder(query, direction));
  expect(pages.map((page) => page.length)).toEqual([3, 3, 3, 3, 3, 3]);
});

test("a job walking a range of an index, as `.withIndex(q => q.eq(...).gte(...).lt(...))` read it, pages only the range", async () => {
  const where = and(eq(primaryGroupHistory.member, "m-ann"), gte(primaryGroupHistory.at, 2), lt(primaryGroupHistory.at, 7));
  const query: PagedQuery = { table: primaryGroupHistory, order: indexOrder(primaryGroupHistory, ["member", "at"]), where, direction: "desc" };
  const { seed, run } = walker(query, 2);
  const entry = (member: string, at: number) => seed.insert("primaryGroupHistory", { workspace: "T1", member: member as Doc<"primaryGroupHistory">["member"], from: null, group: null, cause: "default", at });
  const inRange: string[] = [];
  for (let at = 0; at < 9; at++) {
    const id = await entry("m-ann", at);
    if (at >= 2 && at < 7) inRange.push(id);
    await entry("m-bob", at);
  }

  const pages = await run();

  expect(pages).toEqual([inRange.toReversed().slice(0, 2), inRange.toReversed().slice(2, 4), inRange.toReversed().slice(4)]);
});

test("a job walking a whole table by creation time, as the backfills do, reads each row once and stops on its last page", async () => {
  const query: PagedQuery = { table: primaryGroupHistory, order: indexOrder(primaryGroupHistory, []) };
  const { seed, run } = walker(query, 4);
  const ids: string[] = [];
  for (let at = 0; at < 10; at++) ids.push(await seed.insert("primaryGroupHistory", { workspace: "T1", member: `m-${at % 3}` as Doc<"primaryGroupHistory">["member"], from: null, group: null, cause: "default", at }));

  const pages = await run();

  expect(pages).toEqual([ids.slice(0, 4), ids.slice(4, 8), ids.slice(8)]);
});

test("a job walking an empty table reads one empty page and stops", async () => {
  const { run } = walker({ table: primaryGroupHistory, order: indexOrder(primaryGroupHistory, []) }, 4);

  expect(await run()).toEqual([[]]);
});
