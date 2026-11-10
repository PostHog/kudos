// The cursor of `paginate`, over a real index: a cursor read again later finds what came after it, an empty first
// page starts over, and only a cursor that is a place in this read's order is taken. The order itself is proved in ./indexOrder.test.ts.
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { decodeStored, encodeStored, type Value } from "./codec.ts";
import { indexOrder } from "./indexOrder.ts";
import { paginate, type Page, type PagedQuery } from "./page.ts";
import { flagExposures, primaryGroupHistory, type Doc } from "./schema/index.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };
const seed = seeder(createOperations({ pool: database.pool, clock: createClock({ real: () => 1_000 }), log: quiet }));

const byMemberAt = indexOrder(primaryGroupHistory, ["member", "at"]);
const annsHistory: PagedQuery = { table: primaryGroupHistory, order: byMemberAt, where: eq(primaryGroupHistory.member, "m-ann") };

const entry = (member: string, at: number) => seed.insert("primaryGroupHistory", { workspace: "T1", member: member as Doc<"primaryGroupHistory">["member"], from: null, group: null, cause: "default", at });
const ats = (page: Array<Doc<"primaryGroupHistory">>) => page.map(({ at }) => at);

test("only the rows the query holds for are paged, and a cursor read again later finds only what came after it", async () => {
  for (const at of [3, 1, 2]) await entry("m-ann", at);
  await entry("m-bob", 0);

  const first = await paginate<Doc<"primaryGroupHistory">>(db, annsHistory, { cursor: null, numItems: 2 });
  expect(first).toMatchObject({ isDone: false });
  expect(ats(first.page)).toEqual([1, 2]);
  const second = await paginate<Doc<"primaryGroupHistory">>(db, annsHistory, { cursor: first.continueCursor, numItems: 2 });
  expect(second.isDone).toBe(true);
  expect(ats(second.page)).toEqual([3]);

  await entry("m-ann", 4);
  await entry("m-ann", 0.5);
  const later = await paginate<Doc<"primaryGroupHistory">>(db, annsHistory, { cursor: second.continueCursor, numItems: 2 });
  expect(ats(later.page)).toEqual([4]);
  expect(later.isDone).toBe(true);
});

test("an empty page keeps its cursor: an empty first page starts over, an empty later page stays where it was", async () => {
  const empty = await paginate<Doc<"primaryGroupHistory">>(db, annsHistory, { cursor: null, numItems: 5 });
  expect(empty).toMatchObject({ page: [], isDone: true });

  await entry("m-ann", 1);
  const first = await paginate<Doc<"primaryGroupHistory">>(db, annsHistory, { cursor: empty.continueCursor, numItems: 5 });
  expect(ats(first.page)).toEqual([1]);
  const after = await paginate<Doc<"primaryGroupHistory">>(db, annsHistory, { cursor: first.continueCursor, numItems: 5 });
  expect(after).toEqual({ page: [], isDone: true, continueCursor: first.continueCursor });
});

test("descending pages walk the index backwards, -0 placed before 0 as Convex orders floats", async () => {
  for (const at of [0, -0, -1, 1]) await entry("m-ann", at);

  const walked: number[] = [];
  let cursor: string | null = null;
  for (;;) {
    const { page, isDone, continueCursor }: Page<Doc<"primaryGroupHistory">> = await paginate<Doc<"primaryGroupHistory">>(db, { ...annsHistory, direction: "desc" }, { cursor, numItems: 1 });
    walked.push(...ats(page));
    cursor = continueCursor;
    if (isDone) break;
  }
  expect(walked.map((at) => (Object.is(at, -0) ? "-0" : String(at)))).toEqual(["1", "0", "-0", "-1"]);
});

test.each([0, -1, 1.5, Number.NaN])("a page of %s documents is refused", async (numItems) => {
  await expect(paginate(db, annsHistory, { cursor: null, numItems })).rejects.toThrow(RangeError);
});

test.each(["", "after:", "after:not json", 'after:"a string"', "after:[1]", "after:{}", "elsewhere"])("a cursor no read gave, %j, is refused", async (cursor) => {
  await expect(paginate(db, annsHistory, { cursor, numItems: 1 })).rejects.toThrow("The cursor isn't one this read gave");
});

test("a cursor whose place is cut short, padded, of the wrong kind or from another order is refused", async () => {
  for (const at of [1, 2]) await entry("m-ann", at);
  const { continueCursor } = await paginate<Doc<"primaryGroupHistory">>(db, annsHistory, { cursor: null, numItems: 1 });
  const place = decodeStored(continueCursor.slice("after:".length)) as { index: string; place: Record<string, Value> };
  const forged = (change: (copy: typeof place) => unknown) => "after:" + encodeStored(change(structuredClone(place)) as Value);
  const byMember = indexOrder(primaryGroupHistory, ["member"]);

  for (const cursor of [
    forged(({ index }) => ({ index })),
    forged((copy) => ({ ...copy, place: { ...copy.place, at: undefined } })),
    forged((copy) => ({ ...copy, place: { ...copy.place, extra: 1 } })),
    forged((copy) => ({ ...copy, place: { ...copy.place, at: "1" } })),
    forged((copy) => ({ ...copy, place: { ...copy.place, _id: null } })),
    forged((copy) => ({ ...copy, extra: true })),
  ]) {
    await expect(paginate(db, annsHistory, { cursor, numItems: 1 }), cursor).rejects.toThrow("The cursor isn't one this read gave");
  }
  await expect(paginate(db, { ...annsHistory, order: byMember }, { cursor: continueCursor, numItems: 1 })).rejects.toThrow("The cursor isn't one this read gave");
});

test("an index over a jsonb field isn't paged: Postgres orders jsonb unlike Convex, and a missing field and null would share a place", async () => {
  const byMemberFlagValue = indexOrder(flagExposures, ["member", "flag", "value"]);
  const exposures: PagedQuery = { table: flagExposures, order: byMemberFlagValue };

  await expect(paginate(db, exposures, { cursor: null, numItems: 1 })).rejects.toThrow("flagExposures(member, flag, value) can't be paged: value is stored as jsonb");
  expect(() => byMemberFlagValue.after({ member: "m", flag: "f", value: "abc", _creationTime: 1, _id: "x" })).toThrow("can't be paged");
});
