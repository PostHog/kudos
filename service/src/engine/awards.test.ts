// Awards and lifetime totals, from outside: kudos given in, what the app reads back about who thanked whom, when and
// how much. Today's engine reaches them through a kudos message (engine.test.ts, home.test.ts); these drive the reads
// directly until the message flow lands in 4.4.
import { describe, expect, test } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import type { MemberId } from "../workspace/directory.ts";
import { weekOf } from "./allowance.ts";
import {
  authorOfGiven,
  awardsGivenBefore,
  awardsInWorkspace,
  awardsOfMessage,
  awardsReceivedByDecision,
  awardsReceivedNewestFirst,
  dayThankedBefore,
  earliestAwardFrom,
  firstThanksOf,
  fromTheNewest,
  fromTheNewestDecided,
  givenBetween,
  givenFactsOf,
  givenMessagesInAwardOrder,
  givenSinceWithin,
  hasGivenAnAward,
  insertAwards,
  kudosDecidedAfter,
  lastThankedBefore,
  lastThankedSince,
  latestInAwardOrder,
  messagesGivenDecidedAfter,
  messagesGivenNewestFirst,
  receivedOn,
  recipientsAfter,
  recipientsPageOf,
  thankedAtOrBefore,
  weekTotals,
  type AwardWithId,
} from "./awards.ts";
import type { MessageRef } from "./messageEvent.ts";
import { lifetimeTotals } from "./totals.ts";

const backend = useTestBackend({ now: Date.UTC(2026, 9, 13, 10) });
type Backend = ReturnType<typeof backend>;

const alice = "member-alice" as MemberId;
const bob = "member-bob" as MemberId;
const carol = "member-carol" as MemberId;
const dave = "member-dave" as MemberId;
const hour = 60 * 60_000;
const at = (day: number, hours = 10) => Date.UTC(2026, 9, day, hours);
const dayKey = (day: number) => `2026-10-${String(day).padStart(2, "0")}`;
const ref = (message: string, workspace = "T1"): MessageRef => ({ workspace, conversation: "C_GENERAL", message });

/** Gives one kudos message: an award per recipient, on the day and at the instant given, decided now. */
function give(t: Backend, message: MessageRef, giver: MemberId, recipients: Array<[MemberId, number]>, day: number, hours = 10): Promise<AwardWithId[]> {
  return t.run((ctx) =>
    insertAwards(
      ctx,
      message,
      recipients.map(([recipient, kudos]) => ({ giver, recipient, kudos })),
      dayKey(day),
      at(day, hours),
    ),
  );
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
}

describe("giving inserts an award per recipient and adds it to both sides' totals", () => {
  test("lifetime and week totals count every award, given and received", async () => {
    const t = backend();

    await give(t, ref("m1"), alice, [[bob, 2], [carol, 1]], 13);
    await give(t, ref("m2"), bob, [[alice, 3]], 14);
    await give(t, ref("m3"), alice, [[bob, 1]], 20);

    expect(await t.query((ctx) => lifetimeTotals(ctx, alice)), "Alice in all").toEqual({ given: 4, received: 3 });
    expect(await t.query((ctx) => lifetimeTotals(ctx, bob)), "Bob in all").toEqual({ given: 3, received: 3 });
    expect(await t.query((ctx) => lifetimeTotals(ctx, dave)), "someone never thanked").toEqual({ given: 0, received: 0 });
    expect(await t.query((ctx) => weekTotals(ctx, alice, weekOf(dayKey(13)))), "Alice's week of the 13th").toEqual({ givenWeek: 3, receivedWeek: 3 });
  });

  test("two lifetime totals rows for one member are refused, as Convex's unique read refused them", async () => {
    const t = backend();
    await t.seed.insert("kudosTotals", { member: alice, given: 1, received: 0 });
    await t.seed.insert("kudosTotals", { member: alice, given: 1, received: 0 });

    await expect(t.query((ctx) => lifetimeTotals(ctx, alice)), "reading the totals").rejects.toThrow("unique() query returned more than one result from table kudosTotals:");
  });
});

describe("a given message's awards", () => {
  test("answer who gave it, to whom, how much, and when", async () => {
    const t = backend();
    const [toBob, toCarol] = await give(t, ref("m1"), alice, [[bob, 2], [carol, 1]], 13);

    expect(await t.query((ctx) => awardsOfMessage(ctx, ref("m1"))), "its awards").toEqual([
      { award: toBob!.award, giver: alice, recipient: bob, kudos: 2, day: dayKey(13), at: at(13) },
      { award: toCarol!.award, giver: alice, recipient: carol, kudos: 1, day: dayKey(13), at: at(13) },
    ]);
    expect(await t.query((ctx) => givenFactsOf(ctx, ref("m1"))), "its facts").toEqual({ giver: alice, day: dayKey(13), at: at(13) });
    expect(await t.query((ctx) => authorOfGiven(ctx, ref("m2"))), "a message nobody gave").toBeNull();
    expect(await t.query((ctx) => receivedOn(ctx, ref("m1"), carol)), "Carol received on it").toBe(true);
    expect(await t.query((ctx) => receivedOn(ctx, ref("m1"), dave)), "Dave didn't").toBe(false);
    expect(await t.query((ctx) => recipientsAfter(ctx, ref("m1"), bob, 5)), "the recipients after Bob").toEqual([carol]);
  });

  test("page through its recipients, each once, done on the last page", async () => {
    const t = backend();
    await give(t, ref("m1"), alice, [[bob, 1], [carol, 1], [dave, 1]], 13);

    const first = await t.query((ctx) => recipientsPageOf(ctx, ref("m1"), { numItems: 2, cursor: null }));
    const second = await t.query((ctx) => recipientsPageOf(ctx, ref("m1"), { numItems: 2, cursor: first.continueCursor }));

    expect([first.page, first.isDone], "the first page").toEqual([[bob, carol], false]);
    expect([second.page, second.isDone], "the second page").toEqual([[dave], true]);
  });
});

describe("paged walks over every award", () => {
  test("a workspace's awards are its own, and the awards decided before an instant stop there", async () => {
    const t = backend();
    await give(t, ref("m1"), alice, [[bob, 1]], 13);
    await give(t, ref("m2", "T2"), carol, [[dave, 1]], 13);
    t.time.advance(hour);
    const cutoff = t.clock.now();
    await give(t, ref("m3"), bob, [[alice, 2]], 13);

    const inT1 = await t.query((ctx) => awardsInWorkspace(ctx, "T1", { numItems: 10, cursor: null }));
    const before = await t.query((ctx) => awardsGivenBefore(ctx, cutoff, { numItems: 10, cursor: null }));

    expect(inT1.page.map(({ message }) => message.message), "T1's awards").toEqual(["m1", "m3"]);
    expect(before.page.map(({ giver }) => giver), "decided before the cutoff").toEqual([alice, carol]);
  });

  test("given messages come once each, with every award of the message, a page of awards at a time", async () => {
    const t = backend();
    await give(t, ref("m1"), alice, [[bob, 2], [carol, 1]], 13);
    await give(t, ref("m2"), bob, [[alice, 1]], 14);

    const first = await t.query((ctx) => givenMessagesInAwardOrder(ctx, null, 1));
    const second = await t.query((ctx) => givenMessagesInAwardOrder(ctx, first.cursor, 2));

    expect(first.messages, "the first page").toEqual([
      { workspace: "T1", message: ref("m1"), giver: alice, awards: [{ giver: alice, recipient: bob, kudos: 2 }, { giver: alice, recipient: carol, kudos: 1 }], day: dayKey(13) },
    ]);
    expect(second.messages.map(({ message }) => message.message), "the second page: m1's second award, then m2").toEqual(["m1", "m2"]);
    expect(second.isDone, "done").toBe(true);
  });
});

describe("newest-first walks", () => {
  test("awards received come newest first, past a hundred of them, and resume after an award at the same instant", async () => {
    const t = backend();
    for (let i = 0; i < 130; i++) await give(t, ref(`m${i}`), alice, [[bob, 1]], 13, 0);
    await give(t, ref("late"), carol, [[bob, 1]], 14);

    const received = await t.query((ctx) => collect(awardsReceivedNewestFirst(ctx, bob, fromTheNewest)));
    const [, second, third] = received;
    const resumed = await t.query((ctx) => collect(awardsReceivedNewestFirst(ctx, bob, { at: second!.at, created: second!.created })));

    expect(received, "every award").toHaveLength(131);
    expect(received[0]!.message.message, "the newest").toBe("late");
    expect(received.map(({ created }) => created), "newest decided first among the same instant").toEqual(received.map(({ created }) => created).toSorted((one, other) => other - one));
    expect(resumed[0], "resuming after the second").toEqual(third);
    expect(resumed, "everything after it").toHaveLength(129);
  });

  test("messages given come newest first, each with its awards in the order given", async () => {
    const t = backend();
    await give(t, ref("m1"), alice, [[bob, 2], [carol, 1]], 13);
    await give(t, ref("m2"), alice, [[dave, 1]], 14);

    const given = await t.query((ctx) => collect(messagesGivenNewestFirst(ctx, alice, fromTheNewest)));

    expect(given.map(({ message, awards }) => [message.message, awards.map(({ recipient }) => recipient)]), "the messages").toEqual([
      ["m2", [dave]],
      ["m1", [bob, carol]],
    ]);
  });

  test("by decision: received below a decision time, and messages given after one, refused past their budget", async () => {
    const t = backend();
    await give(t, ref("m1"), alice, [[bob, 1]], 13);
    const decided = t.clock.now();
    t.time.advance(hour);
    await give(t, ref("m2"), carol, [[bob, 2]], 13);
    await give(t, ref("m3"), bob, [[alice, 1], [carol, 1]], 13);

    const received = await t.query((ctx) => collect(awardsReceivedByDecision(ctx, bob, fromTheNewestDecided)));
    const below = await t.query((ctx) => collect(awardsReceivedByDecision(ctx, bob, { decided: decided + 1, inclusive: false })));
    const after = await t.query((ctx) => messagesGivenDecidedAfter(ctx, bob, decided + 1, 2));
    const overBudget = await t.query((ctx) => messagesGivenDecidedAfter(ctx, bob, decided + 1, 1));

    expect(received.map(({ message }) => message.message), "newest decided first").toEqual(["m2", "m1"]);
    expect(below.map(({ message }) => message.message), "decided below the bound").toEqual(["m1"]);
    expect(after?.map(({ message, awards, annotations }) => [message.message, awards.length, annotations]), "Bob's messages since").toEqual([["m3", 2, {}]]);
    expect(overBudget, "more awards than the budget").toBeNull();
    expect(await t.query((ctx) => kudosDecidedAfter(ctx, bob, decided + 1, 10)), "kudos Bob received since").toBe(2);
  });
});

describe("who thanked whom before", () => {
  test("the earliest award, the day thanked before, and whether they were thanked by an instant", async () => {
    const t = backend();
    const [first] = await give(t, ref("m1"), alice, [[bob, 1]], 13);
    const [second] = await give(t, ref("m2"), alice, [[bob, 1]], 15);
    const [toCarol] = await give(t, ref("m3"), alice, [[carol, 1]], 15);

    expect(await t.query((ctx) => earliestAwardFrom(ctx, alice, bob)), "Alice's first to Bob").toMatchObject({ award: first!.award, at: at(13) });
    expect(await t.query((ctx) => dayThankedBefore(ctx, second!.award)), "before the second").toBe(dayKey(13));
    expect(await t.query((ctx) => dayThankedBefore(ctx, first!.award)), "before the first").toBeNull();
    expect(await t.query((ctx) => thankedAtOrBefore(ctx, alice, bob, at(12))), "by the 12th").toBe(false);
    expect(await t.query((ctx) => thankedAtOrBefore(ctx, alice, bob, at(13))), "by the 13th").toBe(true);
    expect(await t.query((ctx) => lastThankedBefore(ctx, [second!, toCarol!])), "last thanked before each").toEqual(
      new Map([
        [second!.award, at(13)],
        [toCarol!.award, null],
      ]),
    );
    expect(await t.query((ctx) => firstThanksOf(ctx, alice)), "when Alice first thanked each").toEqual([at(13), at(15)]);
    expect(await t.query((ctx) => latestInAwardOrder(ctx)([second!.award, first!.award])), "the later decided").toBe(second!.award);
    expect(await t.query((ctx) => hasGivenAnAward(ctx, dave)), "Dave gave nothing").toBe(false);
  });

  test("everyone thanked by an instant counts, even past a teammate thanked many times over", async () => {
    const t = backend();
    for (let i = 0; i < 20; i++) await give(t, ref(`b${i}`), alice, [[bob, 1]], 1);
    await give(t, ref("c"), alice, [[carol, 1]], 2);
    await give(t, ref("d"), alice, [[dave, 1]], 20);
    await give(t, ref("b-late"), alice, [[bob, 1]], 12);

    const lastThanked = await t.query((ctx) => lastThankedSince(ctx, alice, at(10), at(13)));

    expect(lastThanked, "thanked by the 13th, with when since the 10th").toEqual(
      new Map([
        [bob, at(12)],
        [carol, -Infinity],
      ]),
    );
  });

  test("awards given within a span carry their message's stored annotations, and a span over its budget answers null", async () => {
    const t = backend();
    await t.seed.insert("kudosMessages", {
      workspace: "T1",
      conversation: "C_GENERAL",
      message: "m1",
      author: "U_ALICE",
      revision: 1n,
      state: "given",
      attempt: 1n,
      content: { mentions: [{ kind: "person", user: "U_BOB" }], emoji: ["taco"] },
      annotations: { gate: { version: 1, thoughtful: true } },
      spendsAt: at(13),
      checks: 0,
    });
    await give(t, ref("m1"), alice, [[bob, 1]], 13);
    await give(t, ref("m2"), alice, [[carol, 1]], 16);

    const between = await t.query((ctx) => givenBetween(ctx, alice, at(13), at(14)));
    const since = await t.query((ctx) => givenSinceWithin(ctx, alice, at(13), 2));

    expect(between.map(({ day, annotations }) => [day, annotations]), "given on the 13th").toEqual([[dayKey(13), { gate: { version: 1, thoughtful: true } }]]);
    expect(since?.map(({ day }) => day), "since the 13th").toEqual([dayKey(13), dayKey(16)]);
    expect(await t.query((ctx) => givenSinceWithin(ctx, alice, at(13), 1)), "over a budget of one").toBeNull();
  });
});
