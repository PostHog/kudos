// Convex's index order on Postgres, proved on the real schema against a reference written here from Convex's
// documented order of values, never from Convex's code: a missing field before every value, then `_creationTime`,
// then `_id`; `.order("desc")` the exact reverse. Each index here has a nullable field, and every field ties.
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { toDocument } from "./documents.ts";
import { indexOrder, type Direction } from "./indexOrder.ts";
import { items, kudosMessages, teamStickers, users, type TableName } from "./schema/index.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };

type Document = Record<string, unknown>;

// Convex's order of values: a missing field (undefined) < null < int64 < float64 < boolean < string; strings by their
// UTF-8 bytes. The fields here hold no other kind.
function kindRank(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null) return 1;
  return ["bigint", "number", "boolean", "string"].indexOf(typeof value) + 2;
}

// Float64s in IEEE total order, as Convex orders them: -0 before 0, and NaN (JavaScript's, positive) after Infinity.
function compareFloats(a: number, b: number): number {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number(Number.isNaN(a)) - Number(Number.isNaN(b));
  if (a === 0 && b === 0) return Number(!Object.is(a, -0)) - Number(!Object.is(b, -0));
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareValues(a: unknown, b: unknown): number {
  const byKind = kindRank(a) - kindRank(b);
  if (byKind !== 0) return byKind;
  if (typeof a === "string") return Buffer.compare(Buffer.from(a), Buffer.from(b as string));
  if (typeof a === "number") return compareFloats(a, b as number);
  return a! < b! ? -1 : a! > b! ? 1 : 0;
}

// An index field of a nested value, `chatIdentity.workspace`, is the column `chatIdentity$workspace`.
const fieldOf = (document: Document, field: string) => field.split("$").reduce<unknown>((value, key) => (value as Document | undefined)?.[key], document);

const convexOrder = (fields: readonly string[]) => (a: Document, b: Document) => {
  for (const field of [...fields, "_creationTime", "_id"]) {
    const compared = compareValues(fieldOf(a, field), fieldOf(b, field));
    if (compared !== 0) return compared;
  }
  return 0;
};

test("the reference orders float64s in total order", () => {
  const floats = [Number.NaN, 1, 0, -Infinity, -0, Infinity, -1];
  expect(floats.toSorted(compareFloats).map((float) => (Object.is(float, -0) ? "-0" : String(float)))).toEqual(["-Infinity", "-1", "-0", "0", "1", "Infinity", "NaN"]);
});

// Every combination of the fields' values, three documents each: two that tie on `_creationTime`, one created earlier.
// IDs come from a fixed shuffle, so their order says nothing about the fields'.
function fixtures(values: Record<string, unknown[]>, rest: Document): Document[] {
  const combinations = Object.entries(values).reduce<Document[]>(
    (sofar, [field, options]) => sofar.flatMap((partial) => options.map((option) => (option === undefined ? partial : { ...partial, [field]: option }))),
    [{}],
  );
  let seed = 7;
  const shuffledId = () => `id-${((seed = (seed * 48_271) % 2_147_483_647) % 1_000_000).toString().padStart(6, "0")}`;
  return combinations.flatMap((combination, i) =>
    [1_000 + (i % 2), 1_000 + (i % 2), 999].map((creationTime) => ({ ...rest, ...combination, _id: shuffledId(), _creationTime: creationTime })),
  );
}

const cases = [
  {
    index: "items_by_member_turned",
    table: items as PgTable,
    name: "items" as TableName,
    fields: ["member", "turnedAt", "earnedAt"],
    documents: fixtures(
      { member: ["m-b", "m-a"], turnedAt: [2, undefined, 1], earnedAt: [5, 4] },
      { workspace: "T1", source: "hoggie", key: "spike", reason: { kind: "welcome" } },
    ),
  },
  {
    index: "kudosMessages_by_state_and_next_check",
    table: kudosMessages as PgTable,
    name: "kudosMessages" as TableName,
    fields: ["state", "nextCheckAt"],
    documents: fixtures(
      { state: ["watermark", "given"], nextCheckAt: [10, undefined, 0, -3, -0, Number.NaN, Infinity, -Infinity] },
      { workspace: "T1", conversation: "C1", message: "1.0", author: "U1", revision: 1n, attempt: 1n, content: { mentions: [], emoji: [] }, annotations: {}, spendsAt: 0, checks: 0 },
    ),
  },
  {
    // The nullable field leads the index.
    index: "teamStickers_by_workspace_at",
    table: teamStickers as PgTable,
    name: "teamStickers" as TableName,
    fields: ["workspace", "at"],
    documents: fixtures({ workspace: ["T2", undefined, "T1"], at: [3, 1] }, { member: "m-a", team: "team", name: "Team", art: null, emoji: "hedgehog" }),
  },
  {
    // Nested fields: the index walks `chatIdentity.workspace` and `chatIdentity.user`, each missing in some documents.
    index: "users_by_chat_identity",
    table: users as PgTable,
    name: "users" as TableName,
    fields: ["chatIdentity$workspace", "chatIdentity$user"],
    documents: fixtures({ workspace: ["T2", undefined, "T1"], user: ["U2", "U1", undefined] }, {}).map(({ workspace, user, ...rest }) =>
      workspace === undefined && user === undefined ? rest : { ...rest, chatIdentity: { ...(workspace === undefined ? {} : { workspace }), ...(user === undefined ? {} : { user }) } },
    ),
  },
];

async function seedAll(name: TableName, documents: Document[]): Promise<void> {
  const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => 0 }), log: quiet });
  const seed = seeder(operations);
  for (const document of documents) await seed.insert(name, document as never);
}

describe.each(cases)("$index", ({ table, name, fields, documents }) => {
  const order = indexOrder(table, fields as never);
  const expected = documents.toSorted(convexOrder(fields));
  const ordered = (direction: Direction) => (direction === "asc" ? expected : expected.toReversed());
  const ids = (rows: Document[]) => rows.map(({ _id }) => _id);
  const select = async (direction: Direction, after: Document | undefined, limit?: number) => {
    const query = db
      .select()
      .from(table)
      .where(after && order.after(after, direction))
      .orderBy(...order.orderBy(direction))
      .$dynamic();
    return (await (limit === undefined ? query : query.limit(limit))).map((row) => toDocument<Document>(table, row));
  };

  test("orders as Convex does: a missing field first, then ties fall to _creationTime and then _id", async () => {
    await seedAll(name, documents);
    const nullable = fields.find((field) => documents.some((document) => fieldOf(document, field) === undefined))!;

    const ascending = await select("asc", undefined);
    const descending = await select("desc", undefined);

    expect(ids(ascending), "ascending").toEqual(ids(ordered("asc")));
    expect(ids(descending), "descending, Convex's .order(\"desc\")").toEqual(ids(ordered("desc")));
    const prefix = fields.slice(0, fields.indexOf(nullable));
    const sameGroup = (a: Document, b: Document) => prefix.every((field) => fieldOf(a, field) === fieldOf(b, field));
    for (const [i, row] of ascending.entries()) {
      const missingLater = ascending.slice(i + 1).some((later) => sameGroup(row, later) && fieldOf(later, nullable) === undefined);
      expect(fieldOf(row, nullable) !== undefined && missingLater, `a row with ${nullable} before one without`).toBe(false);
    }
  });

  test.each(["asc", "desc"] as const)("paging %s with every page size returns each row exactly once, in order", async (direction) => {
    await seedAll(name, documents);

    for (let size = 1; size <= documents.length; size++) {
      const seen: Document[] = [];
      for (;;) {
        const page = await select(direction, seen.at(-1), size);
        seen.push(...page);
        if (page.length < size) break;
      }
      expect(ids(seen), `pages of ${size}`).toEqual(ids(ordered(direction)));
    }
  });
});
