// The hug records and weekly counts on the service's transaction, through their exported functions: the bodies of
// hugs/ that reach no other stack. Hugs on a kudos reach S4's awards and a hug's received side S3's directory; those
// are proven by the ported Slack tests beside service/src/slack/.
import { describe, expect, test } from "vitest";
import { payHugPeople } from "./people.ts";
import { useTestBackend } from "../../testing/backend.ts";
import { fromTheNewestDecided } from "../engine/awards.ts";
import type { MemberId } from "../workspace/directory.ts";
import {
  countReceivedOnTheMessage,
  hasHuggedBefore,
  hugOf,
  hugsGivenByDecision,
  hugsGivenOn,
  hugsOnTheMessageAsOf,
  hugsReceivedByDecision,
  hugsReceivedSnapshot,
  insertHug,
  insertPaid,
  isPaid,
  newestHugsPaidTo,
  peopleHuggedIn,
  type Hug,
  type NewHug,
} from "./records.ts";
import { countHugGiven, hugsOnTheMessage } from "./weeks.ts";
import { hugWeeks } from "../db/schema/index.ts";
import { toDocument } from "../db/documents.ts";
import type { MutationContext } from "../operations.ts";

const backend = useTestBackend();
const hourMs = 60 * 60 * 1000;
const at = new Date("2026-10-13T10:00:00Z").getTime();
const alice = "m_alice" as MemberId;
const bob = "m_bob" as MemberId;
const carol = "m_carol" as MemberId;

const hugBy = (giver: MemberId, message: string, overrides: Partial<NewHug> = {}): NewHug =>
  ({ workspace: "T1", conversation: "C1", message, giver, onKudos: false, author: alice, emoji: "taco", at, day: "2026-10-13", ...overrides }) as NewHug;

async function given(ctx: MutationContext, hug: NewHug): Promise<Hug> {
  await insertHug(ctx, hug);
  return (await hugOf(ctx, hug, hug.giver))!;
}

describe("a hug given", () => {
  test("is found by its message and giver, counts on the giver's day up to the budget asked, and marks the giver as one who hugged", async () => {
    const t = backend();
    await t.run(async (ctx) => {
      expect(await hasHuggedBefore(ctx, bob)).toBe(false);
      for (const message of ["1.1", "1.2", "1.3"]) await insertHug(ctx, hugBy(bob, message));
      await insertHug(ctx, hugBy(bob, "1.4", { day: "2026-10-14" }));
    });

    await t.query(async (ctx) => {
      expect(await hugOf(ctx, { workspace: "T1", conversation: "C1", message: "1.2" }, bob)).toMatchObject({ giver: bob, author: alice, onKudos: false, emoji: "taco", day: "2026-10-13" });
      expect(await hugOf(ctx, { workspace: "T1", conversation: "C1", message: "1.2" }, carol)).toBeNull();
      expect(await hugsGivenOn(ctx, bob, "2026-10-13", 5)).toBe(3);
      expect(await hugsGivenOn(ctx, bob, "2026-10-13", 2)).toBe(2);
      expect(await hugsGivenOn(ctx, bob, "2026-10-15", 5)).toBe(0);
      expect(await hasHuggedBefore(ctx, bob)).toBe(true);
      expect(await hasHuggedBefore(ctx, carol)).toBe(false);
    });
  });

  test("counts in the giver's week, with its XP, and on the message for every giver", async () => {
    const t = backend();
    const message = { workspace: "T1", conversation: "C1", message: "1.1" };
    await t.run(async (ctx) => {
      await countHugGiven(ctx, { ...message, giver: bob, day: "2026-10-13" });
      await countHugGiven(ctx, { ...message, giver: bob, day: "2026-10-18" });
      await countHugGiven(ctx, { ...message, giver: carol, day: "2026-10-19" });
    });

    const weeks = await t.query(async ({ tx }) => (await tx.select().from(hugWeeks)).map((row) => toDocument<Record<string, unknown>>(hugWeeks, row)));
    expect(weeks.map(({ member, week, given, givenXp, received, receivedXp }) => ({ member, week, given, givenXp, received, receivedXp }))).toEqual(
      expect.arrayContaining([
        { member: bob, week: "2026-10-12", given: 2, givenXp: 2, received: 0, receivedXp: 0 },
        { member: carol, week: "2026-10-19", given: 1, givenXp: 1, received: 0, receivedXp: 0 },
      ]),
    );
    expect(weeks).toHaveLength(2);
    expect(await t.query((ctx) => hugsOnTheMessage(ctx, message))).toBe(3);
    expect(await t.query((ctx) => hugsOnTheMessage(ctx, { ...message, message: "1.2" }))).toBe(0);
  });

  test("its timeline lists the giver's hugs newest first, with the author as the person hugged, across more than one read", async () => {
    const t = backend();
    const messages = Array.from({ length: 53 }, (_, index) => `2.${String(index).padStart(2, "0")}`);
    await t.run(async (ctx) => {
      for (const message of messages) await insertHug(ctx, hugBy(bob, message));
      await insertHug(ctx, hugBy(carol, "3.1"));
    });

    const timeline = await t.query(async (ctx) => {
      const hugs = [];
      for await (const hug of hugsGivenByDecision(ctx, bob, fromTheNewestDecided)) hugs.push(hug);
      return hugs;
    });

    expect(timeline.map(({ message }) => message.message)).toEqual(messages.toReversed());
    expect(timeline.every(({ people, onKudos, emoji }) => people.length === 1 && people[0] === alice && !onKudos && emoji === "taco")).toBe(true);
    const below = { decided: timeline[10]!.created, inclusive: false };
    const older = await t.query(async (ctx) => {
      const hugs = [];
      for await (const hug of hugsGivenByDecision(ctx, bob, below)) hugs.push(hug.message.message);
      return hugs;
    });
    expect(older).toEqual(messages.toReversed().slice(11));
  });

  test("the people hugged in a week are each hug's author, at the hug's time", async () => {
    const t = backend();
    await t.run(async (ctx) => {
      await insertHug(ctx, hugBy(bob, "1.1", { day: "2026-10-12", at: at - 24 * hourMs }));
      await insertHug(ctx, hugBy(bob, "1.2", { day: "2026-10-18", author: carol }));
      await insertHug(ctx, hugBy(bob, "1.3", { day: "2026-10-19" }));
    });

    expect(await t.query((ctx) => peopleHuggedIn(ctx, bob, { monday: "2026-10-12", sunday: "2026-10-18" }))).toEqual([
      { person: alice, at: at - 24 * hourMs },
      { person: carol, at },
    ]);
  });
});

describe("a hug paid", () => {
  test("is paid once to each person, and the newest paid since an instant come first", async () => {
    const t = backend();
    await t.run(async (ctx) => {
      const early = await given(ctx, hugBy(bob, "1.1", { at: at - 2 * hourMs }));
      const late = await given(ctx, hugBy(carol, "1.2", { at }));
      const old = await given(ctx, hugBy(carol, "1.3", { at: at - 48 * hourMs }));
      for (const hug of [early, late, old]) await insertPaid(ctx, hug, alice);
      expect(await isPaid(ctx, early, alice)).toBe(true);
      expect(await isPaid(ctx, early, carol)).toBe(false);
    });

    const newest = (since: number, atMost: number) => t.query(async (ctx) => (await newestHugsPaidTo(ctx, alice, since, atMost)).map(({ message }) => message));
    expect(await newest(at - 24 * hourMs, 5)).toEqual(["1.2", "1.1"]);
    expect(await newest(at - 72 * hourMs, 2)).toEqual(["1.2", "1.1"]);
    expect(await newest(at - 72 * hourMs, 5)).toEqual(["1.2", "1.1", "1.3"]);
    expect(await t.query((ctx) => newestHugsPaidTo(ctx, bob, 0, 5))).toEqual([]);
  });

  test("counts on the message in versions: the count grows, the newest five givers show, and a snapshot reads the count it saw", async () => {
    const t = backend();
    const givers = ["m_g1", "m_g2", "m_g3", "m_g4", "m_g5", "m_g6"] as MemberId[];
    const ref = { workspace: "T1", conversation: "C1", message: "1.1" };
    const snapshots: number[] = [];
    for (const [index, giver] of givers.entries()) {
      await t.run(async (ctx) => {
        // The third hug is the oldest by its reaction's time: it counts, but leaves the newest emoji and time alone.
        const hugAt = index === 2 ? at - 10 * hourMs : at + index * 1000;
        const hug = await given(ctx, hugBy(giver, ref.message, { at: hugAt, emoji: `e${index}` }));
        await countReceivedOnTheMessage(ctx, hug, alice);
      });
      snapshots.push(await t.query((ctx) => hugsReceivedSnapshot(ctx, alice)));
    }

    const received = (snapshot?: number) =>
      t.query(async (ctx) => {
        const versions = [];
        for await (const version of hugsReceivedByDecision(ctx, alice, fromTheNewestDecided, snapshot)) versions.push(version);
        return versions;
      });
    const [live] = await received();
    expect(await received()).toHaveLength(1);
    expect(live).toMatchObject({ message: ref, hugs: 6, emoji: "e5", at: at + 5000, givers: ["m_g6", "m_g5", "m_g4", "m_g2", "m_g1"] });
    expect(await received(snapshots[1])).toEqual([expect.objectContaining({ hugs: 2, emoji: "e1", givers: ["m_g2", "m_g1"] })]);
    expect(await received(snapshots[2])).toEqual([expect.objectContaining({ hugs: 3, emoji: "e1", at: at + 1000 })]);
    expect(await t.query((ctx) => hugsOnTheMessageAsOf(ctx, alice, ref, snapshots[3]!))).toBe(4);
    expect(await t.query((ctx) => hugsOnTheMessageAsOf(ctx, alice, ref, snapshots[0]! - 1))).toBe(0);
    expect(await t.query((ctx) => hugsOnTheMessageAsOf(ctx, bob, ref, snapshots[5]!))).toBe(0);
  });
});

describe("paying a hug's people again", () => {
  // The data move's recovery restarts payHugPeople from its event with no cursor: each person is still paid once.
  test("a payHugPeople run again for the same hug pays its author once, counts once and announces once", async () => {
    const t = backend();
    const author = await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", timeZone: "Europe/Berlin" });
    const hug = hugBy(bob, "1.1", { author });
    await t.run((ctx) => insertHug(ctx, hug));
    const event = { type: "hugGiven" as const, workspace: "T1", giver: bob, message: { workspace: "T1", conversation: "C1", message: "1.1" }, onKudos: false, author, at, day: hug.day };

    await t.run((ctx) => payHugPeople(ctx, { event }));
    await t.run((ctx) => payHugPeople(ctx, { event }));

    expect(await t.query((ctx) => newestHugsPaidTo(ctx, author, 0, 5))).toHaveLength(1);
    expect(await t.query((ctx) => hugsOnTheMessageAsOf(ctx, author, event.message, Infinity))).toBe(1);
    const announced = (await t.published()).filter(({ type }) => type === "hugReceived");
    expect(announced).toEqual([expect.objectContaining({ person: author, giver: bob, week: "2026-10-12", message: event.message })]);
  });

  test("a hug whose author is no member pays no one", async () => {
    const t = backend();
    const gone = await t.seed.insert("members", { workspace: "T1", user: "U_GONE", kind: "not-a-member" });
    const hug = hugBy(bob, "1.1", { author: gone });
    await t.run((ctx) => insertHug(ctx, hug));

    await t.run((ctx) => payHugPeople(ctx, { event: { type: "hugGiven", workspace: "T1", giver: bob, message: { workspace: "T1", conversation: "C1", message: "1.1" }, onKudos: false, author: gone, at, day: hug.day } }));

    expect(await t.query((ctx) => newestHugsPaidTo(ctx, gone, 0, 5))).toEqual([]);
    expect((await t.published()).filter(({ type }) => type === "hugReceived")).toEqual([]);
  });
});
