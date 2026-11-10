// The parser, from outside: a message's mentions and emoji in, whether it is a kudos message and what it carries out.
// Its hooks read the workspace's settings (S3), owned store emoji (S7) and earned album emoji (S9), so most of these
// wait on those stacks; the parts that need no hook run now.
import { describe, expect, test } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { CountableContent, Mention } from "../engine/messageEvent.ts";
import { annotationsOf, fingerprintOf, kudosEmojiClosestAfter, kudosFor, kudosMessageOf, mostKudosIn, type KudosMessage } from "./parser.ts";

const backend = useTestBackend();
const context = { workspace: "T1", giver: "member-alice" };
const person = (user: string): Mention => ({ kind: "person", user });

async function withTaco() {
  const t = backend();
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco" });
  return t;
}

describe("R1: a kudos message mentions someone and carries a kudos emoji", () => {
  test("a message that mentions nobody is ordinary chat, whatever emoji it carries", async () => {
    const t = backend();

    const kudos = await t.run((ctx) => kudosMessageOf(ctx, { mentions: [], emoji: ["taco"] }, context));

    expect(kudos, "the parse").toBeNull();
  });

  waitsOn(["S3", "S7", "S9"], "a mention and the workspace's kudos emoji make a kudos message, each emoji placed after the mentions before it", async () => {
    const t = await withTaco();
    const content: CountableContent = { mentions: [person("U_BOB"), person("U_CAROL")], emoji: ["taco", "wave", "taco"], mentionsBeforeEmoji: [1, 1, 2] };

    const kudos = await t.run((ctx) => kudosMessageOf(ctx, content, context));

    expect(kudos, "the parse").toEqual({
      mentions: content.mentions,
      kudosEmoji: [
        { name: "taco", mentionsBefore: 1, claims: [{ name: "taco" }] },
        { name: "taco", mentionsBefore: 2, claims: [{ name: "taco" }] },
      ],
      ownedEmoji: [],
    });
  });

  waitsOn(["S3", "S7", "S9"], "a mention without a kudos emoji is ordinary chat", async () => {
    const t = await withTaco();

    const kudos = await t.run((ctx) => kudosMessageOf(ctx, { mentions: [person("U_BOB")], emoji: ["wave"] }, context));

    expect(kudos, "the parse").toBeNull();
  });
});

describe("R14: a kudos message's fingerprint is its mentions and kudos emoji, nothing else", () => {
  waitsOn(["S3", "S7", "S9"], "reordered mentions, repeated mentions and other emoji leave the fingerprint as it was", async () => {
    const t = await withTaco();
    const first: CountableContent = { mentions: [person("U_BOB"), person("U_CAROL")], emoji: ["taco"] };
    const reordered: CountableContent = { mentions: [person("U_CAROL"), person("U_BOB"), person("U_BOB")], emoji: ["wave", "taco"] };
    const moreKudos: CountableContent = { mentions: [person("U_BOB"), person("U_CAROL")], emoji: ["taco", "taco"] };

    const [a, b, c] = await t.run(async (ctx) => [await fingerprintOf(ctx, first, context), await fingerprintOf(ctx, reordered, context), await fingerprintOf(ctx, moreKudos, context)]);

    expect(b, "reordered, repeated, another emoji").toBe(a);
    expect(c, "one more kudos emoji").not.toBe(a);
  });
});

describe("R43: the hooks annotate a kudos message", () => {
  waitsOn(["S7", "S9"], "the thoughtful-kudos gate notes whether the message says why in five words or more", () => {
    const annotations = annotationsOf({ mentions: [person("U_BOB")], emoji: ["taco"], text: "thanks for untangling the deploy today" }, context);

    expect(annotations.gate, "the gate's note").toEqual({ version: 1, thoughtful: true, words: 6 });
  });
});

describe("R4 R9: how many kudos each recipient gets, and which emoji shows", () => {
  const placed = (name: string, mentionsBefore: number | undefined, onlyFor?: string) => ({ name, mentionsBefore, claims: [onlyFor === undefined ? { name } : { name, onlyFor }] });
  const message: KudosMessage = {
    mentions: [person("U_BOB"), person("U_CAROL")],
    kudosEmoji: [placed("taco", 1), placed("taco", 2), placed("rocket", 2, "U_CAROL"), placed("rocket", 2, "U_CAROL"), placed("rocket", 2, "U_CAROL")],
    ownedEmoji: ["rocket"],
  };

  test("the most repeats of one kudos emoji are the kudos each gets, counting only the emoji that count for them", () => {
    expect(mostKudosIn(message), "the most in the message").toBe(3);
    expect(kudosFor(message, "U_BOB"), "Bob, whom the rocket doesn't count for").toBe(2);
    expect(kudosFor(message, "U_CAROL"), "Carol").toBe(3);
  });

  test("the emoji shown for a recipient is the first counting one after their mention, else the last before it", () => {
    expect(kudosEmojiClosestAfter(message, "U_BOB"), "after Bob's mention").toBe("taco");
    expect(kudosEmojiClosestAfter(message, "U_CAROL"), "after Carol's mention").toBe("taco");
    expect(kudosEmojiClosestAfter({ ...message, kudosEmoji: [placed("taco", 0), placed("rocket", 1)] }, "U_CAROL"), "nothing after Carol's mention").toBe("rocket");
  });
});
