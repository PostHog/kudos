import { describe, expect, test } from "vitest";
import { emojiRollOf } from "./emojiRoll.ts";

const pack = { secret: "proof-secret", member: "member-1", crate: "thoughtful:pack-1" };

describe("a thoughtful pack's random emoji roll", () => {
  test("the same pack rolls the same chance and pick every time, each a fraction from 0 up to 1", async () => {
    const first = await emojiRollOf(pack);

    expect(await emojiRollOf(pack)).toEqual(first);
    for (const fraction of [first.chance, first.pick]) expect(fraction >= 0 && fraction < 1, `${fraction} is a fraction`).toBe(true);
  });

  test("another pack, another member or another secret rolls differently", async () => {
    const rolls = await Promise.all([pack, { ...pack, crate: "thoughtful:pack-2" }, { ...pack, member: "member-2" }, { ...pack, secret: "other-secret" }].map(emojiRollOf));

    expect(new Set(rolls.map(({ chance }) => chance)).size).toBe(4);
  });

  test("about one pack in ten hits the one-in-ten chance over a thousand packs", async () => {
    const rolls = await Promise.all(Array.from({ length: 1_000 }, (_, index) => emojiRollOf({ ...pack, crate: `thoughtful:pack-${index}` })));

    const hits = rolls.filter(({ chance }) => chance < 0.1).length;
    expect(hits).toBeGreaterThan(70);
    expect(hits).toBeLessThan(130);
  });
});
