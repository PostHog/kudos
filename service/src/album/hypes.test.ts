// A hype emoji by its name: whose it is, and whether the reacting member holds it, as hugs (S13) asks before it
// publishes hypeReacted. The pack waiting for its item is S8's items/hypes.ts, stood in by its map signature.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { MemberId } from "../workspace/directory.ts";
import { hypeEmojiFor } from "./hypes.ts";
import { earnedWorld } from "./testing/earnedWorld.ts";

vi.mock("./items/hypes.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "itemHypes"));

const tuesday = Date.parse("2026-10-13T10:00:00Z");

const backend = useTestBackend({ now: tuesday });
let t: TestBackend;
let bob: MemberId;
let carol: MemberId;

beforeEach(async () => {
  t = backend();
  earnedWorld.reset();
  bob = await t.seed.insert("members", { workspace: "T1", user: "U_BOB", kind: "member" });
  carol = await t.seed.insert("members", { workspace: "T1", user: "U_CAROL", kind: "member" });
  await t.seed.insert("emojiNames", { workspace: "T1", emoji: "hype", person: carol, name: "carol-hype" });
  await t.seed.insert("secondEmojiNames", { workspace: "T1", emoji: `hype:${carol}`, name: "carol-cheers" });
  await t.seed.insert("emojiNames", { workspace: "T1", emoji: "level:5", name: "level-5" });
});

describe("a hype emoji answers its owner and whether the giver holds it", () => {
  test("a hype emoji's name, or its second name, answers its owner, held by nobody yet", async () => {
    expect(await hypeOf(bob, "carol-hype")).toEqual({ owner: carol, held: false });
    expect(await hypeOf(bob, "carol-cheers")).toEqual({ owner: carol, held: false });
    expect(await hypeOf(null, "carol-hype"), "no giver holds nothing").toEqual({ owner: carol, held: false });
  });

  test("a name that is no hype emoji's, or another workspace's, answers nothing", async () => {
    expect(await hypeOf(bob, "level-5")).toBeNull();
    expect(await hypeOf(bob, "taco")).toBeNull();
    expect(await t.query((ctx) => hypeEmojiFor(ctx, "T2", bob, "carol-hype"))).toBeNull();
  });

  test("a giver who thanked the owner holds it, unless its pack still waits face down; one who collected it by reactions holds it", async () => {
    await t.seed.insert("thoughtfulPacks", { workspace: "T1", giver: bob, recipient: carol, week: "2026-10-12", message: { workspace: "T1", conversation: "C1", message: "1760349600.000100" }, holdsSticker: true, at: tuesday });

    expect(await hypeOf(bob, "carol-hype")).toEqual({ owner: carol, held: true });

    earnedWorld.flags.hiddenItems.add(bob);
    earnedWorld.packsFaceDown.add(`${bob}:${carol}`);
    expect(await hypeOf(bob, "carol-hype"), "the pack waits face down").toEqual({ owner: carol, held: false });

    await t.seed.insert("hypesCollected", { workspace: "T1", member: bob, person: carol, at: tuesday });
    expect(await hypeOf(bob, "carol-hype"), "collected by reactions").toEqual({ owner: carol, held: true });
  });
});

function hypeOf(giver: MemberId | null, name: string) {
  return t.query((ctx) => hypeEmojiFor(ctx, "T1", giver, name));
}
