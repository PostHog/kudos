// The giver's private reply to a kudos message, from outside: what it says and where Slack shows it, and how a reply
// held for its quests or its item is released. A reply to a kudos that gave nothing reaches no other stack, so it runs
// end to end here; a reply with gains reads S6's progression, S17's website link and S5's own message settings (5.8)
// when it is written or sent, so those waits are declared, and the release steps are proven on the rows the delivery reads.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { Id } from "../db/columns.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import type { MovedQuest } from "../quests/progress.ts";
import { givenReplyOf, questsWaitMs, releaseSuccessReply, releaseUnreleased, releaseUnreleasedJob, replyPrivately, tellItemsInTheReply, type QuestDone, type Reply } from "./replies.ts";

const backend = useTestBackend({ now: Date.parse("2026-10-13T10:00:00Z") });
type Backend = ReturnType<typeof backend>;

const kudos: MessageRef = { workspace: "T1", conversation: "C_KUDOS", message: "1700000000.000100" };
const thread = "1700000000.000050";
const given: Reply = { kind: "given", outcome: { recipients: [{ user: "U_BOB", kudos: 1 }], left: 4, skipped: [] }, base: 5 };
const questDone: QuestDone = { kind: "weekly", goal: "Thank 3 people.", xp: 30 };
const questMoved: MovedQuest = { goal: "Thank 3 people", progress: { done: 1, of: 3, unit: "people" } };

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const reply = (t: Backend, to: string, written: Reply, threadRoot?: string) => t.run((ctx) => replyPrivately(ctx, kudos, threadRoot, to, written));

/** A reply already written with its gains, as a kudos that gave leaves it. */
function seedReply(t: Backend, fields: { held?: true; message?: string } = {}) {
  const { message = kudos.message, held } = fields;
  return t.seed.insert("privateReplies", { ...kudos, message, to: "U_ALICE", given: [{ text: "You gave kudos." }], lines: [], gains: { xp: 10 }, ...(held && { held }) });
}

function seedOneReply(t: Backend, reply: Id<"privateReplies">, waits: { awaitsQuests?: true; awaitsItems?: true } = {}) {
  return t.seed.insert("oneReplies", { reply, left: "4 kudos left today", ...waits });
}

describe("a kudos message that gave nothing", () => {
  test("gets its reply privately, in the kudos message's thread", async () => {
    const t = backend();

    await reply(t, "U_ALICE", { kind: "over-allowance", outcome: { cost: 4, recipients: 1, perRecipient: 4, left: 0 }, base: 3 }, thread);
    await t.settle();

    expect(t.slack.ephemeralsTo("U_ALICE")).toEqual([
      {
        channel: "C_KUDOS",
        user: "U_ALICE",
        text: "This needs 4 kudos (1 person × 4 kudos emoji), but you have 0 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.",
        thread_ts: thread,
      },
    ]);
  });

  test("an edit to a message that already gave kudos is told its edit changes nothing, beside the message", async () => {
    const t = backend();

    await reply(t, "U_ALICE", { kind: "accepted-message-edited" });
    await t.settle();

    expect(t.slack.ephemeralsTo("U_ALICE")).toEqual([
      { channel: "C_KUDOS", user: "U_ALICE", text: "This message already gave kudos, so your edit doesn't change them. To give more, send a new message." },
    ]);
  });

  test("each message's reply goes to its own giver, once", async () => {
    const t = backend();

    await reply(t, "U_ALICE", { kind: "invalid", outcome: { skipped: [{ mention: { kind: "person", user: "U_BOT" }, reason: "bot" }] } });
    await reply(t, "U_CAROL", { kind: "accepted-message-edited" });
    await t.settle();

    expect(t.slack.callsTo("chat.postEphemeral").map(({ user }) => user)).toEqual(["U_ALICE", "U_CAROL"]);
  });
});

describe("a kudos message that gave", () => {
  waitsOn(["S6", "S17"], "a giver outside the directory is told what they gave and the XP it earned them", async () => {
    const t = backend();

    await reply(t, "U_ALICE", given, thread);
    await t.settle();

    const [sent] = t.slack.ephemeralsTo("U_ALICE");
    expect(sent?.text).toMatch(/^You gave 1 kudos to <@U_BOB>\. You have 4 kudos left today\.\n\+5 XP/);
  });

  waitsOn(["S5", "S6"], "a member is told what they gave, unless their message settings turn the reply off", async () => {
    const t = backend();
    await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member" });

    await reply(t, "U_ALICE", given, thread);
    await t.settle();

    expect(t.slack.ephemeralsTo("U_ALICE")).toHaveLength(1);
  });
});

describe("a reply held for its quests", () => {
  test("is released when its wait is over, without the quests it waited for", async () => {
    const t = backend();
    const held = await seedReply(t, { held: true });
    const oneReply = await seedOneReply(t, held, { awaitsQuests: true, awaitsItems: true });

    await t.run((ctx) => releaseUnreleased(ctx, { reply: held }));

    expect(await t.seed.get("privateReplies", held)).not.toHaveProperty("held");
    expect(await t.seed.get("privateReplies", held)).toMatchObject({ gains: { xp: 10 } });
    const row = await t.seed.get("oneReplies", oneReply);
    expect(row).not.toHaveProperty("awaitsQuests");
    expect(row).not.toHaveProperty("awaitsItems");
  });

  waitsOn(["S6", "S17"], "its wait ends after the quests' wait, and then the reply is sent", async () => {
    const t = backend();
    const held = await seedReply(t, { held: true });
    await t.run(({ jobs }) => jobs.enqueue(releaseUnreleasedJob, { reply: held }, { after: questsWaitMs }));

    await t.settle();
    expect(t.slack.ephemeralsTo("U_ALICE"), "nothing is sent before the wait is over").toEqual([]);
    await t.time.advance(questsWaitMs);
    await t.settle();

    expect(t.slack.ephemeralsTo("U_ALICE")).toHaveLength(1);
  });

  test("a reply already released stays as it is, and nothing more is sent", async () => {
    const t = backend();
    const released = await seedReply(t);
    const oneReply = await seedOneReply(t, released, { awaitsItems: true });
    const before = { reply: await t.seed.get("privateReplies", released), oneReply: await t.seed.get("oneReplies", oneReply) };

    await t.run((ctx) => releaseUnreleased(ctx, { reply: released }));
    await t.settle();

    expect({ reply: await t.seed.get("privateReplies", released), oneReply: await t.seed.get("oneReplies", oneReply) }).toEqual(before);
    expect(t.slack.calls).toEqual([]);
  });

  test("its quests' release carries the quests the kudos finished and moved, and lets it go", async () => {
    const t = backend();
    const held = await seedReply(t, { held: true });
    const oneReply = await seedOneReply(t, held, { awaitsQuests: true });

    await t.run((ctx) => releaseSuccessReply(ctx, kudos, [questDone], [questMoved]));

    const row = await t.seed.get("privateReplies", held);
    expect(row).toMatchObject({ gains: { xp: 10, questsDone: [questDone] } });
    expect(row).not.toHaveProperty("held");
    expect(await t.seed.get("oneReplies", oneReply)).toMatchObject({ questsMoved: [questMoved] });
    expect(await t.seed.get("oneReplies", oneReply)).not.toHaveProperty("awaitsQuests");
  });

  test("its quests' release still holds a reply whose item hasn't come", async () => {
    const t = backend();
    const held = await seedReply(t, { held: true });
    const oneReply = await seedOneReply(t, held, { awaitsQuests: true, awaitsItems: true });

    await t.run((ctx) => releaseSuccessReply(ctx, kudos, [], []));

    expect(await t.seed.get("privateReplies", held)).toMatchObject({ held: true, gains: { xp: 10 } });
    const row = await t.seed.get("oneReplies", oneReply);
    expect(row).toMatchObject({ awaitsItems: true });
    expect(row).not.toHaveProperty("awaitsQuests");
    expect(row).not.toHaveProperty("questsMoved");
  });

  test("its quests' release touches only the held reply of that message", async () => {
    const t = backend();
    const other = await seedReply(t, { held: true, message: "1700000000.000300" });
    const released = await seedReply(t);

    await t.run((ctx) => releaseSuccessReply(ctx, kudos, [questDone], []));

    expect(await t.seed.get("privateReplies", other)).toMatchObject({ held: true, gains: { xp: 10 } });
    expect(await t.seed.get("privateReplies", released)).toMatchObject({ gains: { xp: 10 } });
    expect(await t.seed.get("privateReplies", released)).not.toHaveProperty("gains.questsDone");
  });
});

describe("a reply waiting for its item", () => {
  const outcomes = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ recipient: `member-${index}` as Id<"members">, outcome: "nextWeek" as const }));
  const granted = (count: number) => ({ type: "thoughtfulPacksGranted" as const, fact: "fact-1", workspace: "T1", message: kudos, outcomes: outcomes(count), at: 0 });

  test("gets the items the kudos earned, at most ten named, and is let go once its quests are in", async () => {
    const t = backend();
    const held = await seedReply(t, { held: true });
    const oneReply = await seedOneReply(t, held, { awaitsItems: true });

    expect(await t.run((ctx) => tellItemsInTheReply(ctx, granted(12) as never))).toBe(true);

    const row = await t.seed.get("oneReplies", oneReply);
    expect(row).toMatchObject({ items: { outcomes: outcomes(10), more: 2 } });
    expect(row).not.toHaveProperty("awaitsItems");
    expect(await t.seed.get("privateReplies", held)).not.toHaveProperty("held");
  });

  test("gets its items but stays held while its quests haven't come", async () => {
    const t = backend();
    const held = await seedReply(t, { held: true });
    const oneReply = await seedOneReply(t, held, { awaitsQuests: true, awaitsItems: true });

    expect(await t.run((ctx) => tellItemsInTheReply(ctx, granted(1) as never))).toBe(true);

    expect(await t.seed.get("oneReplies", oneReply)).toMatchObject({ awaitsQuests: true, items: { outcomes: outcomes(1), more: 0 } });
    expect(await t.seed.get("privateReplies", held)).toMatchObject({ held: true });
  });

  test("is none when the message's reply doesn't wait for an item, which the caller tells another way", async () => {
    const t = backend();
    const reply = await seedReply(t);
    const oneReply = await seedOneReply(t, reply);
    const before = await t.seed.get("oneReplies", oneReply);

    expect(await t.run((ctx) => tellItemsInTheReply(ctx, granted(1) as never))).toBe(false);
    expect(await t.run((ctx) => tellItemsInTheReply(ctx, { ...granted(1), message: { ...kudos, message: "1700000000.000300" } } as never))).toBe(false);
    expect(await t.seed.get("oneReplies", oneReply)).toEqual(before);
  });
});

describe("the message's reply with gains", () => {
  test("is the released one before a held one, then the oldest, and never a reply without gains", async () => {
    const t = backend();
    await t.seed.insert("privateReplies", { ...kudos, to: "U_ALICE", lines: [[{ text: "Nobody here can receive kudos." }]] });
    await seedReply(t, { held: true });
    const released = await seedReply(t);
    await seedReply(t);

    expect((await t.query((ctx) => givenReplyOf(ctx, kudos)))?._id).toBe(released);
  });

  test("is the oldest held one when none is released, and none for a message without one", async () => {
    const t = backend();
    const first = await seedReply(t, { held: true });
    await seedReply(t, { held: true });

    expect((await t.query((ctx) => givenReplyOf(ctx, kudos)))?._id).toBe(first);
    expect(await t.query((ctx) => givenReplyOf(ctx, { ...kudos, conversation: "C_OTHER" }))).toBeNull();
  });
});
