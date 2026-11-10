// Collecting a teammate's hype emoji by reactions, over the service: the reactions arrive as the bus's hypeReacted
// events, as hugs (S13) publishes them, and the album's subscriber keeps each and collects on the tenth of the owner's
// own messages, once. These are the album's side of convex/album/hypeByReactions.test.ts; that file's own cases read
// the person page (S17), hugs (S13), packs (S8), XP (S6) and the Monday recap (S16), and are left for its port.
//
// hype-by-reactions is 9.5's flag.ts, and what recording a milestone reads past the album's own rows is S10's team
// pages and hoggie collection and S8's tier items: each is stood in by its map signature, from a world the test gives.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { HypeReactedEvent } from "../bus/events.ts";
import type { MemberId } from "../workspace/directory.ts";
import { reactionsToCollect } from "./emojiCatalogue.ts";
import { hypeEarnedBy, hypeUnlockedByReactions } from "./earnedEmojis.ts";
import { collectByReactions, collectedBy, peopleCollectedBy, reactionsToward } from "./hypeCollections.ts";
import { keepHypeReactionJob } from "./hypeReactions.ts";
import { hypeEmojiFor } from "./hypes.ts";
import { inTheAlbumOf } from "./stickers.ts";

const world = vi.hoisted(() => ({
  collects: new Set<string>(),
  /** Who was exposed to hype-by-reactions, as deciding it in a mutation exposes them (album/flag.ts). */
  exposedTo: [] as string[],
  /** The tier items earned, once each by member and tier, as earnItem dedupes them (S8's items/ledger.ts). */
  items: new Map<string, { member: string; milestone: string; tier: string; at: number }>(),
}));

vi.mock("./flag.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./flag.ts")>()),
  hypeByReactionsCollectFor: async (_ctx: unknown, member: string) => {
    world.exposedTo.push(member);
    return world.collects.has(member);
  },
}));

vi.mock("./teamPages.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("./teamPages.ts")>()), teamPagesOf: async () => [] }));

vi.mock("./hoggies/collection.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hoggies/collection.ts")>()),
  collectionOf: async () => ({ rarities: [], hoggies: [], owned: 0, total: 0 }),
}));

vi.mock("./items/achievements.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./items/achievements.ts")>()),
  earnTierItem: async (_ctx: unknown, { member }: { member: string }, { milestone, tier }: { milestone: string; tier: string }, at: number) => {
    const key = `${member} milestone:${milestone}:${tier}`;
    if (!world.items.has(key)) world.items.set(key, { member, milestone, tier, at });
  },
}));

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60_000;

const backend = useTestBackend({ now: tuesday });
let t: TestBackend;
let alice: MemberId;
let bruno: MemberId;
let carol: MemberId;
let messages = 0;

beforeEach(async () => {
  t = backend();
  world.collects.clear();
  world.exposedTo.length = 0;
  world.items.clear();
  [alice, bruno, carol] = [await aMember("U_ALICE", "alice-hype"), await aMember("U_BRUNO", "bruno-hype"), await aMember("U_CAROL", "carol-hype")];
  for (const member of [alice, bruno, carol]) world.collects.add(member);
});

describe("a teammate's hype emoji is collected by reactions on 10 of their messages", () => {
  test("the 10th of Carol's messages Bruno reacts on with her hype emoji puts her card in his album and gives him the emoji", async () => {
    await reactOnMessagesOf(carol, { by: bruno, messages: reactionsToCollect - 1 });

    expect(await holdsHypeOf(bruno, carol), "the hype emoji held after 9 messages").toBe(false);
    expect(await inAlbum(bruno, carol), "Carol's card in Bruno's album after 9 messages").toBe(false);
    expect(await t.query((ctx) => reactionsToward(ctx, bruno, carol))).toEqual({ have: 9, need: 10 });

    await reactOnMessagesOf(carol, { by: bruno, messages: 1 });

    expect(await holdsHypeOf(bruno, carol), "the hype emoji held after 10 messages").toBe(true);
    expect(await inAlbum(bruno, carol), "Carol's card in Bruno's album after 10 messages").toBe(true);
    expect(await t.query((ctx) => hypeUnlockedByReactions(ctx, bruno, carol))).toBe(true);
    expect(await t.seed.all("albumStickers")).toEqual([expect.objectContaining({ member: bruno, person: carol, from: "reactions", at: tuesday + 10 * minuteMs })]);
    expect(await t.seed.all("hypesCollected")).toEqual([expect.objectContaining({ workspace: "T1", member: bruno, person: carol, at: tuesday + 10 * minuteMs })]);
  });

  test("the reactions toward collecting stop counting at the ten it takes", async () => {
    await reactOnMessagesOf(carol, { by: bruno, messages: reactionsToCollect + 2 });

    expect(await t.query((ctx) => reactionsToward(ctx, bruno, carol))).toEqual({ have: 10, need: 10 });
  });

  test("only reactions on the owner's own messages count", async () => {
    await reactOnMessagesOf(alice, { by: bruno, messages: 5, emoji: "carol-hype", owner: carol });
    await reactOnMessagesOf(carol, { by: bruno, messages: 9 });

    expect(await holdsHypeOf(bruno, carol), "after 9 of Carol's own messages and 5 of Alice's").toBe(false);

    await reactOnMessagesOf(carol, { by: bruno, messages: 1 });

    expect(await holdsHypeOf(bruno, carol), "after 10 of Carol's own messages").toBe(true);
  });

  test("a member's own hype emoji on their own messages collects nothing", async () => {
    await reactOnMessagesOf(carol, { by: carol, messages: 10 });

    expect(await collectionsOf(carol), "what Carol collected").toEqual([]);
    expect(await inAlbum(carol, carol)).toBe(false);
    expect(world.exposedTo, "no one is exposed to hype-by-reactions").toEqual([]);
  });

  test("a hype reaction delivered twice collects once", async () => {
    await reactOnMessagesOf(carol, { by: bruno, messages: 9 });
    const tenth = hypeReactedOn(carol, { by: bruno });

    await keep(tenth);
    await keep(tenth);

    expect(await collectionsOf(bruno), "what Bruno collected").toEqual([carol]);
    expect(await t.seed.all("hypeReactions"), "the tenth message is kept once").toHaveLength(10);
  });

  test("collecting again once collected writes nothing, so a run started over collects once", async () => {
    await reactOnMessagesOf(carol, { by: bruno, messages: 10 });
    const before = { collected: await t.seed.all("hypesCollected"), stickers: await t.seed.all("albumStickers"), tiers: await t.seed.all("milestoneTiers") };

    await t.run((ctx) => collectByReactions(ctx, hypeReactedOn(carol, { by: bruno })));

    expect({ collected: await t.seed.all("hypesCollected"), stickers: await t.seed.all("albumStickers"), tiers: await t.seed.all("milestoneTiers") }).toEqual(before);
  });

  test("Carol's card collected by reactions counts toward Bruno's people milestones the moment it lands", async () => {
    await reactOnMessagesOf(carol, { by: bruno, messages: 10 });

    expect(await t.seed.all("milestoneTiers")).toEqual([expect.objectContaining({ member: bruno, milestone: "people", tier: "bronze", at: tuesday + 10 * minuteMs })]);
    expect([...world.items.values()], "the tier's item").toEqual([{ member: bruno, milestone: "people", tier: "bronze", at: tuesday + 10 * minuteMs }]);
  });

  test("a card already in the album stays as it was", async () => {
    await t.seed.insert("albumStickers", { member: bruno, person: carol, from: "history", at: tuesday });

    await reactOnMessagesOf(carol, { by: bruno, messages: 10 });

    expect(await holdsHypeOf(bruno, carol)).toBe(true);
    expect((await t.seed.all("albumStickers")).map(({ from }) => from), "the sources of Bruno's cards").toEqual(["history"]);
  });
});

describe("collecting by reactions is dark where hype-by-reactions is off", () => {
  test("with the flag off, 10 reactions collect nothing", async () => {
    world.collects.delete(bruno);

    await reactOnMessagesOf(carol, { by: bruno, messages: 10 });

    expect(await collectionsOf(bruno)).toEqual([]);
    expect(await holdsHypeOf(bruno, carol)).toBe(false);
  });

  test("reactions kept while it was off count once it is on, at the next reaction", async () => {
    world.collects.delete(bruno);
    await reactOnMessagesOf(carol, { by: bruno, messages: 10 });
    world.collects.add(bruno);

    expect(await collectionsOf(bruno), "nothing collects before a reaction").toEqual([]);

    await reactOnMessagesOf(carol, { by: bruno, messages: 1 });

    expect(await collectionsOf(bruno)).toEqual([carol]);
    expect(await t.query((ctx) => collectedBy(ctx, bruno, carol))).toEqual(expect.objectContaining({ at: tuesday + 11 * minuteMs }));
  });
});

async function aMember(user: string, hype: string): Promise<MemberId> {
  const member = await t.seed.insert("members", { workspace: "T1", user, kind: "member", name: user });
  await t.seed.insert("emojiNames", { workspace: "T1", emoji: "hype", person: member, name: hype });
  return member;
}

function hypeOf(owner: MemberId) {
  return owner === alice ? "alice-hype" : owner === bruno ? "bruno-hype" : "carol-hype";
}

function hypeReactedOn(author: MemberId, { by, emoji, owner = author }: { by: MemberId; emoji?: string; owner?: MemberId }): HypeReactedEvent {
  messages += 1;
  const at = t.clock.now();
  return { type: "hypeReacted", workspace: "T1", giver: by, owner, author, emoji: emoji ?? hypeOf(owner), message: { workspace: "T1", conversation: "C1", message: `${Math.floor(at / 1000)}.${String(messages).padStart(6, "0")}` }, at };
}

/** Reacts on as many new messages of the author, a minute apart, each published on the bus as hugs publishes it. */
async function reactOnMessagesOf(author: MemberId, { by, messages: count, emoji, owner }: { by: MemberId; messages: number; emoji?: string; owner?: MemberId }) {
  for (let each = 0; each < count; each += 1) {
    t.clock.advance(minuteMs);
    const event = hypeReactedOn(author, { by, ...(emoji !== undefined && { emoji }), ...(owner !== undefined && { owner }) });
    await t.run((ctx) => ctx.publish(event));
    await t.settle();
  }
}

async function keep(event: HypeReactedEvent) {
  await t.run((ctx) => ctx.jobs.enqueue(keepHypeReactionJob, { event }));
  await t.settle();
}

async function holdsHypeOf(member: MemberId, owner: MemberId) {
  const viaName = await t.query((ctx) => hypeEmojiFor(ctx, "T1", member, hypeOf(owner)));
  const earned = await t.query((ctx) => hypeEarnedBy(ctx, member, owner));
  expect(viaName?.held, "the hype emoji read by its name agrees").toBe(earned);
  return earned;
}

function inAlbum(member: MemberId, person: MemberId) {
  return t.query((ctx) => inTheAlbumOf(ctx, member, person));
}

async function collectionsOf(member: MemberId) {
  return (await t.query((ctx) => peopleCollectedBy(ctx, member, 10))).map(({ person }) => person);
}
