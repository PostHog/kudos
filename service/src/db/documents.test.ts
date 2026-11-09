import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { fromDocument, toDocument } from "./documents.ts";
import { analyticsIds, companyProfileLinks, kudosTexts, members, users, type Doc, type TableName } from "./schema/index.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });

async function roundTrip<Table extends TableName>(table: PgTable, doc: Doc<Table>): Promise<Doc<Table>> {
  await db.insert(table).values(fromDocument(table, doc as Record<string, unknown>));
  const rows = await db.select().from(table);
  return toDocument<Doc<Table>>(table, rows.find((row) => (row as { _id: string })._id === doc._id) as Record<string, unknown>);
}

describe("documents keep missing and null apart", () => {
  test("a field that may be both missing and null reads back as it was written: missing, null or a value", async () => {
    const base = { _creationTime: 1_700_000_000_000.25, member: "m1", analyticsId: "d1" } as const;
    const missing = { ...base, _id: "a1" };
    const asNull = { ...base, _id: "a2", profileFingerprint: null };
    const set = { ...base, _id: "a3", profileFingerprint: "fp" };

    for (const doc of [missing, asNull, set] as Array<Doc<"analyticsIds">>) {
      const back = await roundTrip<"analyticsIds">(analyticsIds, doc);
      expect(back, `${doc._id} reads back as written`).toStrictEqual(doc);
    }
    const back = await roundTrip<"analyticsIds">(analyticsIds, { ...base, _id: "a4" } as Doc<"analyticsIds">);
    expect("profileFingerprint" in back, "a missing field is absent, not null").toBe(false);
  });

  test("a required field of one kind or null keeps null; an optional typed field is absent when missing", async () => {
    const link = { _id: "l1", _creationTime: 1, workspace: "T0", member: "m1", profile: null, by: "self", setBy: "m1", at: 5 } as Doc<"companyProfileLinks">;
    expect(await roundTrip<"companyProfileLinks">(companyProfileLinks, link), "null kept").toStrictEqual(link);

    const member = { _id: "m1", _creationTime: 2, workspace: "T0", user: "U1", kind: "member" } as Doc<"members">;
    const back = await roundTrip<"members">(members, member);
    expect(back, "no optional field appears").toStrictEqual(member);
  });

  test("an int64 field and a nested object come back with their kinds", async () => {
    const text = {
      _id: "k1",
      _creationTime: 3,
      workspace: "T0",
      conversation: "C0",
      message: "1.0001",
      kind: "words",
      revision: 7n,
      author: "U1",
      edited: false,
      segments: [{ kind: "text", text: "thanks", bold: true }],
      visibility: "public",
      gate: null,
    } satisfies Doc<"kudosTexts">;

    expect(await roundTrip<"kudosTexts">(kudosTexts, text)).toStrictEqual(text);
  });

  test("a document with a field its table lacks, or a null its column can't hold, is refused", () => {
    expect(() => fromDocument(members, { _id: "m", _creationTime: 1, workspace: "T", user: "U", kind: "member", nope: 1 })).toThrow("no field nope");
    expect(() => fromDocument(members, { _id: "m", _creationTime: 1, workspace: "T", user: "U", kind: "member", name: null })).toThrow("can't be null");
  });
});

describe("nested index fields", () => {
  test("a nested index field is filled from its object and left out of the document", async () => {
    const user = { _id: "u1", _creationTime: 4, chatIdentity: { workspace: "T0", user: "U1" } } as Doc<"users">;
    const other = { _id: "u2", _creationTime: 5 } as Doc<"users">;
    await roundTrip<"users">(users, other);
    expect(await roundTrip<"users">(users, user), "the document has no generated field").toStrictEqual(user);

    const found = await db.select({ _id: users._id }).from(users).where(eq(users.chatIdentity$user, "U1"));
    expect(found, "the generated column finds the user").toEqual([{ _id: "u1" }]);
    const columns = await db.select({ _id: users._id, workspace: users.chatIdentity$workspace }).from(users).orderBy(asc(users._id));
    expect(columns, "a missing object leaves its index fields NULL").toEqual([
      { _id: "u1", workspace: "T0" },
      { _id: "u2", workspace: null },
    ]);
  });
});
