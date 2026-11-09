// The seed helpers: documents into tables and back, as today's tests do with `t.run(ctx => ctx.db.insert(...))`.
import { describe, expect, test } from "vitest";
import { createClock } from "../src/clock.ts";
import type { Log } from "../src/log.ts";
import { createOperations } from "../src/operations.ts";
import { useTestDatabase } from "./database.ts";
import { seeder, type NewDocument } from "./seed.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const start = Date.UTC(2026, 0, 5, 9);

function setUp() {
  const clock = createClock({ real: () => start });
  const operations = createOperations({ pool: database.pool, clock, log: quiet });
  return { clock, seed: seeder(operations) };
}

const thanks = { kind: "thanks", person: "member-2", message: { workspace: "T1", conversation: "C_GENERAL", message: "1.0" } } as const;
const item: NewDocument<"items"> = { workspace: "T1", member: "member-1", source: "hoggie", key: "spike", reason: thanks, earnedAt: start };
const message: NewDocument<"kudosMessages"> = {
  workspace: "T1",
  conversation: "C_GENERAL",
  message: "1.0",
  author: "U_GIVER",
  revision: 2n ** 62n,
  state: "given",
  attempt: 1n,
  content: { mentions: [{ kind: "person", user: "U_TAKER" }], emoji: ["hedgehog"] },
  annotations: { channelType: "channel" },
  spendsAt: start,
  checks: 0,
};

describe("seed helpers", () => {
  test("insert stamps a new document from the app's clock as the runner does, and get reads it back whole", async () => {
    const { clock, seed } = setUp();
    clock.advance(60_000);

    const first = await seed.insert("items", item);
    const second = await seed.insert("kudosMessages", message);

    expect(first, "a UUID").toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await seed.get("items", first), "the item, a missing field absent").toEqual({ _id: first, _creationTime: start + 60_000, ...item });
    const stored = await seed.get("kudosMessages", second);
    expect(stored, "the message, its int64 and values kept").toEqual({ _id: second, _creationTime: stored?._creationTime, ...message });
    expect(stored!._creationTime, "strictly after the first").toBeGreaterThan(start + 60_000);
  });

  test("a document that brings its own _id and _creationTime keeps them, as a loaded one does", async () => {
    const { seed } = setUp();

    const id = await seed.insert("items", { ...item, _id: "k17abc0000000000000000000000000", _creationTime: 1_700_000_000_000.5 });

    expect(id).toBe("k17abc0000000000000000000000000");
    expect(await seed.get("items", id)).toMatchObject({ _id: id, _creationTime: 1_700_000_000_000.5 });
  });

  test("all lists a table in creation order; patch sets and removes fields; delete removes the document", async () => {
    const { clock, seed } = setUp();
    const kept = await seed.insert("items", item);
    clock.advance(1);
    const turned = await seed.insert("items", { ...item, key: "pebble", floor: "rare" });

    await seed.patch("items", turned, { turnedAt: start + 5, floor: undefined });
    await seed.delete("items", kept);

    expect(await seed.all("items"), "what is left").toEqual([{ _id: turned, _creationTime: start + 1, ...item, key: "pebble", turnedAt: start + 5 }]);
    expect(await seed.get("items", kept), "the deleted one").toBeNull();
    await expect(seed.patch("items", kept, { turnedAt: 1 }), "patching what isn't there").rejects.toThrow(/no items document/);
  });

  test("patch takes the fields of any variant of a table's union of documents", async () => {
    const { seed } = setUp();
    const where = { workspace: "T1", conversation: "C_GENERAL", message: "1.0" };
    const words = await seed.insert("kudosTexts", { ...where, kind: "words", revision: 1n, author: "U_GIVER", edited: false, segments: [], visibility: "public", gate: null });
    const tombstone = await seed.insert("kudosTexts", { ...where, kind: "tombstone", why: "removed" });

    await seed.patch("kudosTexts", words, { revision: 2n });
    await seed.patch("kudosTexts", tombstone, { why: "deleted" });

    expect(await seed.get("kudosTexts", words)).toMatchObject({ kind: "words", revision: 2n });
    expect(await seed.get("kudosTexts", tombstone)).toMatchObject({ kind: "tombstone", why: "deleted" });
  });
});
