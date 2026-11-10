// Random emojis over the service: an opened pack drops one of the workspace's random-class custom emoji the member
// doesn't hold yet, on the roll's chance, behind random-emojis; the member holds each drop by its Slack name while
// Slack has it, the picked ones first. No Convex test file is named for this module; today's random-emoji cases sit
// in the kudos-emoji, mapping and end-state tests, which read through Slack and the website.
//
// The roll (S2's emojiRoll.ts, ported) is a hash of a secret; here it answers the chance and pick the test gives, as the
// Convex gate tests spy on the draw. random-emojis is 9.5's flag.ts and Slack's custom emoji S3's, stood in by their
// map signatures.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { MemberId } from "../workspace/directory.ts";
import { dropRandomEmojiFrom, holdsRandomEmoji, mostRandomEmojisShown, randomEmojiChance, randomEmojiNamesHeldBy, randomEmojisHeldBy } from "./randomEmojis.ts";
import { earnedWorld } from "./testing/earnedWorld.ts";
import { emojiWorld } from "./testing/emojiWorld.ts";

// The roll each member and crate would draw. Unset, a roll misses the chance, so a drop shows which roll it drew.
const roll = vi.hoisted(() => ({ chance: 0, pick: 0, of: new Map<string, { chance: number; pick: number }>() }));

vi.mock("./emojiRoll.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./emojiRoll.ts")>()),
  emojiRollOf: async ({ member, crate }: { member: string; crate: string }) => roll.of.get(`${member} ${crate}`) ?? { chance: roll.chance, pick: roll.pick },
}));
vi.mock("../workspace/slackEmoji.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "slackEmoji"));
vi.mock("./flag.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "albumFlags"));

const tuesday = Date.parse("2026-10-13T10:00:00Z");

const backend = useTestBackend({ now: tuesday });
let t: TestBackend;
let alice: MemberId;
let bruno: MemberId;

beforeEach(async () => {
  t = backend();
  emojiWorld.reset();
  earnedWorld.reset();
  Object.assign(roll, { chance: 0, pick: 0 });
  roll.of.clear();
  alice = await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", name: "Alice" });
  bruno = await t.seed.insert("members", { workspace: "T1", user: "U_BRUNO", kind: "member", name: "Bruno" });
  earnedWorld.flags.randomEmojis.add(alice);
  for (const name of ["blobwave", "partyparrot", "shipit"]) {
    await t.seed.insert("emojiClasses", { workspace: "T1", name, class: "random" });
    emojiWorld.slackHas("T1", { name, image: `https://emoji.example/${name}.png` });
  }
  await t.seed.insert("emojiClasses", { workspace: "T1", name: "unmapped-one", class: "unmapped" });
});

describe("a pack drops a random emoji the member doesn't hold", () => {
  test("the member's roll for the crate, under the chance, drops the emoji the pick lands on among the workspace's random ones, in name order", async () => {
    const pack = await aPack(bruno, alice);
    roll.chance = 1;
    roll.of.set(`${alice} thoughtful:1`, { chance: randomEmojiChance - 0.01, pick: 0.5 });

    await t.run((ctx) => dropRandomEmojiFrom(ctx, alice, pack, "thoughtful:1", tuesday));

    expect((await t.seed.all("randomEmojiDrops")).map(({ member, name, pack: from, at }) => ({ member, name, pack: from, at }))).toEqual([{ member: alice, name: "partyparrot", pack, at: tuesday }]);
  });

  test("a roll at the chance or over drops nothing", async () => {
    roll.chance = randomEmojiChance;

    const pack = await aPack(bruno, alice);
    await t.run((ctx) => dropRandomEmojiFrom(ctx, alice, pack, "thoughtful:1", tuesday));

    expect(await t.seed.all("randomEmojiDrops")).toEqual([]);
  });

  test("a drop never repeats: each next drop picks among the ones not held, and once all are held nothing drops", async () => {
    const pack = await aPack(bruno, alice);

    for (let drop = 0; drop < 4; drop += 1) await t.run((ctx) => dropRandomEmojiFrom(ctx, alice, pack, `thoughtful:${drop}`, tuesday + drop));

    expect((await t.seed.all("randomEmojiDrops")).map(({ name }) => name)).toEqual(["blobwave", "partyparrot", "shipit"]);
    expect(await t.query((ctx) => randomEmojiNamesHeldBy(ctx, alice))).toEqual(["blobwave", "partyparrot", "shipit"]);
  });

  test("an emoji Slack no longer has drops nothing", async () => {
    emojiWorld.customEmoji.set("T1", [{ name: "partyparrot", image: "https://emoji.example/partyparrot.png" }]);

    const pack = await aPack(bruno, alice);
    await t.run((ctx) => dropRandomEmojiFrom(ctx, alice, pack, "thoughtful:1", tuesday));

    expect(await t.seed.all("randomEmojiDrops"), "blobwave is first and gone from Slack").toEqual([]);
  });

  test("where random emojis are off, even a roll under the chance drops nothing", async () => {
    const pack = await aPack(bruno, alice);
    roll.of.set(`${bruno} thoughtful:1`, { chance: 0, pick: 0 });
    await t.run((ctx) => dropRandomEmojiFrom(ctx, bruno, pack, "thoughtful:1", tuesday));

    expect(await t.seed.all("randomEmojiDrops")).toEqual([]);
  });
});

describe("the random emojis a member holds", () => {
  test("each drop is held by its Slack name, from the recipient of the pack that dropped it, the picked ones first, and one Slack lost is left out", async () => {
    const fromBruno = await aPack(alice, bruno);
    for (const [name, at] of [["blobwave", 1], ["gone", 2], ["partyparrot", 3], ["shipit", 4]] as const) await t.seed.insert("randomEmojiDrops", { member: alice, name, pack: fromBruno, at: tuesday + at });

    const held = await t.query((ctx) => randomEmojisHeldBy(ctx, "T1", alice, ["random:shipit", "level:5", "random:not-held"]));

    expect(held).toEqual([
      { id: "random:shipit", name: "shipit", image: "https://emoji.example/shipit.png", from: bruno, at: tuesday + 4 },
      { id: "random:blobwave", name: "blobwave", image: "https://emoji.example/blobwave.png", from: bruno, at: tuesday + 1 },
      { id: "random:partyparrot", name: "partyparrot", image: "https://emoji.example/partyparrot.png", from: bruno, at: tuesday + 3 },
    ]);
    expect(await t.query((ctx) => holdsRandomEmoji(ctx, alice, "gone")), "held, though Slack lost it").toBe(true);
    expect(await t.query((ctx) => holdsRandomEmoji(ctx, alice, "blobcry"))).toBe(false);
  });

  test("where random emojis are off, the member holds none to show", async () => {
    await t.seed.insert("randomEmojiDrops", { member: bruno, name: "blobwave", pack: await aPack(alice, bruno), at: tuesday });

    expect(await t.query((ctx) => randomEmojisHeldBy(ctx, "T1", bruno))).toEqual([]);
  });

  test("at most 200 are shown", async () => {
    const pack = await aPack(alice, bruno);
    const names = Array.from({ length: mostRandomEmojisShown + 1 }, (_, index) => `random-${String(index).padStart(3, "0")}`);
    emojiWorld.slackHas("T1", ...names.map((name) => ({ name, image: `https://emoji.example/${name}.png` })));
    for (const name of names) await t.seed.insert("randomEmojiDrops", { member: alice, name, pack, at: tuesday });

    const held = await t.query((ctx) => randomEmojisHeldBy(ctx, "T1", alice, [`random:${names.at(-1)!}`]));

    expect(held).toHaveLength(mostRandomEmojisShown);
    expect(held[0]!.name, "the picked one past the first 200").toBe(names.at(-1));
  }, 60_000);
});

let messages = 0;

function aPack(giver: MemberId, recipient: MemberId) {
  messages += 1;
  return t.seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-12", message: { workspace: "T1", conversation: "C1", message: `1760349600.${String(messages).padStart(6, "0")}` }, holdsSticker: true, at: tuesday });
}
