// The level emojis a member is offered: the catalogue's five levels, and level 2's :raised_hands: while onboarding
// shows to them (LP71). onboarding is S8's items/onboardingFlag.ts, stood in by its map signature.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { MemberId } from "../workspace/directory.ts";
import { standardEmojiNamed } from "../workspace/standardEmoji.ts";
import { emojiArtPictureOf } from "./emojiCatalogue.ts";
import { emojiLevelsOf, isEmojiLevelOf, levelEmojiPictureOf } from "./levelEmojis.ts";
import { earnedWorld } from "./testing/earnedWorld.ts";

vi.mock("./items/onboardingFlag.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "onboarding"));

const backend = useTestBackend();
let t: TestBackend;
const alice = "m_alice" as MemberId;

beforeEach(() => {
  t = backend();
  earnedWorld.reset();
});

describe("LP71: the level emojis follow onboarding", () => {
  test("with onboarding off, a member is offered levels 5 to 25 and level 2 is none of theirs", async () => {
    expect(await t.query((ctx) => emojiLevelsOf(ctx, alice))).toEqual([5, 10, 15, 20, 25]);
    expect(await t.query((ctx) => isEmojiLevelOf(ctx, alice, 2))).toBe(false);
    expect(await t.query((ctx) => isEmojiLevelOf(ctx, alice, 15))).toBe(true);
    expect(await t.query((ctx) => isEmojiLevelOf(ctx, alice, 3))).toBe(false);
  });

  test("with onboarding on, level 2 comes first and is the member's", async () => {
    earnedWorld.flags.hiddenItems.add(alice);
    earnedWorld.flags.onboarding.add(alice);

    expect(await t.query((ctx) => emojiLevelsOf(ctx, alice))).toEqual([2, 5, 10, 15, 20, 25]);
    expect(await t.query((ctx) => isEmojiLevelOf(ctx, alice, 2))).toBe(true);
  });

  test("level 2 is pictured as Slack's standard :raised_hands:, every other level by its catalogue art", () => {
    expect(levelEmojiPictureOf(2)).toBe(standardEmojiNamed("raised_hands")!.image);
    expect(levelEmojiPictureOf(10)).toBe(emojiArtPictureOf("level", 10));
  });
});
