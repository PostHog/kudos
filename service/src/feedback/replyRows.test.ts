// The private reply's rows that later steps read back: the held reply of a kudos message, which a release finds, and
// the one reply's row of a private reply. What fills them reaches S4's giving and S6's progression, so the journeys
// that write them are proven in the ported convex/feedback/oneReply.test.ts.
import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { createClock } from "../clock.ts";
import type { Id } from "../db/columns.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { heldReplyOf } from "./heldReplies.ts";
import { oneReplyRowOf } from "./oneReply.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const kudos: MessageRef = { workspace: "T1", conversation: "C_KUDOS", message: "1700000000.000100" };

function setUp() {
  const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => Date.parse("2026-10-13T10:00:00Z") }), log: quiet, retryDelayMs: () => 1 });
  const seed = seeder(operations);
  return {
    seed,
    privateReply: (ref: MessageRef, held?: true) => seed.insert("privateReplies", { ...ref, to: "U_ALICE", lines: [[{ text: "You gave kudos." }]], ...(held && { held }) }),
    heldReplyOf: (ref: MessageRef) => operations.query("test.heldReplyOf", (q) => heldReplyOf(q, ref)),
    oneReplyRowOf: (reply: Id<"privateReplies">) => operations.query("test.oneReplyRowOf", (q) => oneReplyRowOf(q, reply)),
  };
}

describe("the held reply of a kudos message", () => {
  test("is the message's first reply still held, never one released or one of another message", async () => {
    const t = setUp();
    await t.privateReply(kudos);
    await t.privateReply({ ...kudos, message: "1700000000.000300" }, true);
    await t.privateReply({ ...kudos, conversation: "C_OTHER" }, true);
    const first = await t.privateReply(kudos, true);
    await t.privateReply(kudos, true);

    expect((await t.heldReplyOf(kudos))?._id).toBe(first);
  });

  test("is none once every reply of the message is released", async () => {
    const t = setUp();
    await t.privateReply(kudos);

    expect(await t.heldReplyOf(kudos)).toBeNull();
  });

  test("comes back whole, as the release reads it", async () => {
    const t = setUp();
    const held = await t.privateReply(kudos, true);

    expect(await t.heldReplyOf(kudos)).toEqual(await t.seed.get("privateReplies", held));
  });
});

describe("the one reply's row", () => {
  test("is the row of that private reply, with the items and the quests it moved", async () => {
    const t = setUp();
    const reply = await t.privateReply(kudos);
    const other = await t.privateReply({ ...kudos, message: "1700000000.000300" });
    const bob = await t.seed.insert("members", { workspace: "T1", user: "U_BOB", kind: "member" });
    await t.seed.insert("oneReplies", { reply: other, left: "4 kudos left today" });
    const items = { outcomes: [{ recipient: bob, outcome: "nextWeek" as const }], more: 2 };
    const questsMoved = [{ goal: "Thank 3 people", progress: { done: 1, of: 3, unit: "people" as const } }];
    const row = await t.seed.insert("oneReplies", { reply, left: "3 kudos left today", awaitsQuests: true, items, questsMoved });

    const found = await t.oneReplyRowOf(reply);

    expect(found).toMatchObject({ _id: row, reply, left: "3 kudos left today", awaitsQuests: true, items, questsMoved });
    expect(found).not.toHaveProperty("awaitsItems");
  });

  test("leaves out what a row doesn't hold, rather than holding null", async () => {
    const t = setUp();
    const reply = await t.privateReply(kudos);
    await t.seed.insert("oneReplies", { reply, left: "3 kudos left today" });

    const found = await t.oneReplyRowOf(reply);

    expect(Object.keys(found ?? {}).sort()).toEqual(["_creationTime", "_id", "left", "reply"]);
  });

  test("is none for a private reply without one", async () => {
    const t = setUp();
    const reply = await t.privateReply(kudos);

    expect(await t.oneReplyRowOf(reply)).toBeNull();
  });

  test("is one at most: a second row for the same reply is an error, not a choice", async () => {
    const t = setUp();
    const reply = await t.privateReply(kudos);
    await t.seed.insert("oneReplies", { reply, left: "3 kudos left today" });
    await t.seed.insert("oneReplies", { reply, left: "2 kudos left today" });

    await expect(t.oneReplyRowOf(reply)).rejects.toThrow(new Error("unique() query returned more than one result from table oneReplies:"));
  });
});
