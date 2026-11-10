// The faithful port of convex/album/hypeReactions.test.ts: the album keeps each hype reaction once and answers the
// nudges from them. Today's test reacts through Slack, whose reaction hugs (S13) turns into the bus's hypeReacted
// event; the album's entrance is that event, so here each reaction is published on the bus as hugs publishes it, and
// its subscriber runs on the worker. Collecting by reactions is off, as it is in today's test (hype-by-reactions is
// off there); the flag is 9.5's flag.ts, stood in by its map signature.
import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { HypeReactedEvent } from "../bus/events.ts";
import { toDocument } from "../db/documents.ts";
import { emojiNames, hypeReactions, members, type Doc } from "../db/schema/index.ts";
import type { MemberId } from "../workspace/directory.ts";
import { keepHypeReactionJob, mostHypeReactionsRead, mostOwnersChecked, nudgesFor } from "./hypeReactions.ts";

vi.mock("./flag.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./flag.ts")>()),
  hypeByReactionsCollectFor: async () => false,
}));

const now = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const everyNudge = 10;

const backend = useTestBackend({ now });
let t: TestBackend;

beforeEach(() => {
  t = backend();
});

describe("HH22 HH58: Album keeps the hype reactions and answers the nudges from them", () => {
  test("Bob's hype reactions on their owners' own messages name each owner with their emoji, most reactions first", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    const dana = await hypeEmojiOf("U_DANA", "dana-hype");

    await hypeReaction({ user: "U_BOB", reaction: "dana-hype", itemUser: "U_DANA" });
    await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });
    await hypeReaction({ user: "U_BOB", reaction: "carol-hype::skin-tone-2", itemUser: "U_CAROL" });

    expect(await nudgesOf("U_BOB")).toEqual([
      { person: carol, emoji: "carol-hype", reactions: 2 },
      { person: dana, emoji: "dana-hype", reactions: 1 },
    ]);
  });

  test("between owners with as many reactions, the newest reacted comes first", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    const dana = await hypeEmojiOf("U_DANA", "dana-hype");

    await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });
    await hypeReaction({ user: "U_BOB", reaction: "dana-hype", itemUser: "U_DANA" });

    expect(await nudgesOf("U_BOB")).toEqual([
      { person: dana, emoji: "dana-hype", reactions: 1 },
      { person: carol, emoji: "carol-hype", reactions: 1 },
    ]);
  });

  test("a hype reaction delivered twice, or removed and added again, is kept once", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    const reacted = await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });

    await keep(reacted);
    // Removing a hype reaction publishes nothing; adding it again publishes the same message's event again.
    await publish(reacted);

    expect(await nudgesOf("U_BOB")).toEqual([{ person: carol, emoji: "carol-hype", reactions: 1 }]);
    expect(await keptRowsOf("U_BOB"), "one row for the one message").toHaveLength(1);
  });

  test("between owners with as many reactions, a reaction delivered late still ranks by when it was given", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    const dana = await hypeEmojiOf("U_DANA", "dana-hype");
    const bob = await aMember("U_BOB");

    await keep(hypeReacted(bob, dana, "dana-hype", now + 2 * minuteMs));
    await keep(hypeReacted(bob, carol, "carol-hype", now + minuteMs));

    expect(await nudgesOf("U_BOB")).toEqual([
      { person: dana, emoji: "dana-hype", reactions: 1 },
      { person: carol, emoji: "carol-hype", reactions: 1 },
    ]);
  });

  test("a hype reaction on someone else's message is kept once but names nobody", async () => {
    await hypeEmojiOf("U_CAROL", "carol-hype");

    const reacted = await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_ALICE" });
    await keep(reacted);

    expect(await nudgesOf("U_BOB")).toEqual([]);
    expect(await keptRowsOf("U_BOB"), "the rows kept for collecting by reactions").toEqual([{ owner: reacted.owner, author: reacted.author, emoji: "carol-hype", message: reacted.message.message }]);
  });

  test("the nudges are the reacting member's own", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");

    await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });

    expect(await nudgesOf("U_CAROL")).toEqual([]);
    expect(await nudgesOf("U_BOB")).toEqual([{ person: carol, emoji: "carol-hype", reactions: 1 }]);
  });

  test("an owner whose emoji the member came to hold is left out", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });

    await holdHypeEmoji("U_BOB", carol);

    expect(await nudgesOf("U_BOB")).toEqual([]);
  });

  test("an owner who left is left out", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });

    // What the directory keeps when Slack says the user was deleted: the row stays, no longer a member.
    await t.seed.patch("members", carol, { kind: "not-a-member" });

    expect(await nudgesOf("U_BOB")).toEqual([]);
  });

  test("an owner whose emoji left the registry is left out, and a renamed one is named as it is now", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    const dana = await hypeEmojiOf("U_DANA", "dana-hype");
    await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });
    await hypeReaction({ user: "U_BOB", reaction: "dana-hype", itemUser: "U_DANA" });

    for (const row of await t.seed.all("emojiNames")) {
      if (row.person === carol) await t.seed.delete("emojiNames", row._id);
      if (row.person === dana) await t.seed.patch("emojiNames", row._id, { name: "dana-cheers" });
    }

    expect(await nudgesOf("U_BOB")).toEqual([{ person: dana, emoji: "dana-cheers", reactions: 1 }]);
  });

  test("the answer counts only the member's newest reactions, so an owner reacted to only before them is left out", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    const dana = await hypeEmojiOf("U_DANA", "dana-hype");
    const bob = await aMember("U_BOB");

    await keep(hypeReacted(bob, carol, "carol-hype", now - minuteMs));
    for (let reaction = 0; reaction < mostHypeReactionsRead; reaction += 1) await keepInline(hypeReacted(bob, dana, "dana-hype", now + reaction));

    expect(await nudgesOf("U_BOB")).toEqual([{ person: dana, emoji: "dana-hype", reactions: mostHypeReactionsRead }]);
  }, 60_000);

  test("the answer checks only the owners the member reacted to most, so a teammate past them is left out", async () => {
    const bob = await aMember("U_BOB");
    for (let index = 0; index < mostOwnersChecked; index += 1) {
      const owner = await hypeEmojiOf(`U_HELD${index}`, `held-${index}`);
      await keepInline(hypeReacted(bob, owner, `held-${index}`, now + index));
      await keepInline(hypeReacted(bob, owner, `held-${index}`, now + index));
      await holdHypeEmoji("U_BOB", owner);
    }
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    await keep(hypeReacted(bob, carol, "carol-hype", now));

    expect(await nudgesOf("U_BOB")).toEqual([]);
  }, 60_000);

  test("the answer names at most as many teammates as asked", async () => {
    const carol = await hypeEmojiOf("U_CAROL", "carol-hype");
    await hypeEmojiOf("U_DANA", "dana-hype");
    await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });
    await hypeReaction({ user: "U_BOB", reaction: "carol-hype", itemUser: "U_CAROL" });
    await hypeReaction({ user: "U_BOB", reaction: "dana-hype", itemUser: "U_DANA" });

    expect(await nudgesOf("U_BOB", 1)).toEqual([{ person: carol, emoji: "carol-hype", reactions: 2 }]);
  });
});

let messages = 0;

// A reaction as hugs hands it to the album: the bus's hypeReacted event for a new message, a minute after the last,
// its emoji without the skin tone, its owner the member whose hype emoji has that name.
async function hypeReaction(options: { user: string; reaction: string; itemUser: string }): Promise<HypeReactedEvent> {
  messages += 1;
  const at = t.clock.advance(minuteMs);
  const ts = `${Math.floor(at / 1000) - 60}.${String(messages).padStart(6, "0")}`;
  const emoji = options.reaction.split("::")[0]!;
  const event: HypeReactedEvent = { type: "hypeReacted", workspace: "T1", giver: await memberOf(options.user), owner: await ownerOf(emoji), author: await memberOf(options.itemUser), emoji, message: { workspace: "T1", conversation: "C1", message: ts }, at };
  await publish(event);
  return event;
}

function hypeReacted(giver: MemberId, owner: MemberId, emoji: string, at: number): HypeReactedEvent {
  messages += 1;
  return { type: "hypeReacted", workspace: "T1", giver, owner, author: owner, emoji, message: { workspace: "T1", conversation: "C1", message: `${at / 1000}.${String(messages).padStart(6, "0")}` }, at };
}

/** Publishes the event as hugs does, and lets its subscriber run. */
async function publish(event: HypeReactedEvent) {
  await t.run((ctx) => ctx.publish(event));
  await t.settle();
}

/** Runs the subscriber's job on the event itself, as today's test calls the internal mutation. */
async function keep(event: HypeReactedEvent) {
  await t.run((ctx) => ctx.jobs.enqueue(keepHypeReactionJob, { event }));
  await t.settle();
}

/** The job's body in one operation, for the tests that keep hundreds of reactions. */
function keepInline(event: HypeReactedEvent) {
  return t.run((ctx) => keepHypeReactionJob.handler(ctx, { event }));
}

async function keptRowsOf(user: string) {
  const giver = await memberOf(user);
  const rows = await t.query(async ({ tx }) => {
    const found = await tx.select().from(hypeReactions).where(eq(hypeReactions.giver, giver)).orderBy(asc(hypeReactions.giver), asc(hypeReactions.at), asc(hypeReactions._creationTime), asc(hypeReactions._id));
    return found.map((row) => toDocument<Doc<"hypeReactions">>(hypeReactions, row));
  });
  return rows.map(({ owner, author, emoji, message }) => ({ owner, author, emoji, message }));
}

function aMember(user: string): Promise<MemberId> {
  return t.seed.insert("members", { workspace: "T1", user, kind: "member" });
}

async function nudgesOf(user: string, most = everyNudge) {
  const member = await memberOf(user);
  return t.query((ctx) => nudgesFor(ctx, member, most));
}

async function hypeEmojiOf(user: string, name: string): Promise<MemberId> {
  const person = await aMember(user);
  await t.seed.insert("emojiNames", { workspace: "T1", emoji: "hype", person, name });
  return person;
}

async function holdHypeEmoji(user: string, owner: MemberId) {
  const holder = await memberOf(user);
  await t.seed.insert("thoughtfulPacks", { workspace: "T1", giver: holder, recipient: owner, week: "2026-10-12", message: { workspace: "T1", conversation: "C1", message: "1760349600.000100" }, holdsSticker: false, at: now });
  await t.seed.insert("seenEmojis", { member: holder, emoji: `hype:${owner}`, at: now });
}

async function ownerOf(name: string): Promise<MemberId> {
  const [row] = await t.query(({ tx }) => tx.select({ person: emojiNames.person }).from(emojiNames).where(and(eq(emojiNames.workspace, "T1"), eq(emojiNames.name, name))));
  return row!.person!;
}

async function memberOf(user: string): Promise<MemberId> {
  const [row] = await t.query(({ tx }) => tx.select({ _id: members._id }).from(members).where(and(eq(members.workspace, "T1"), eq(members.user, user))));
  if (row === undefined) return aMember(user);
  return row._id as MemberId;
}
