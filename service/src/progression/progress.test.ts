import { describe, expect, test } from "vitest";
import type { Id } from "../db/columns.ts";
import type { KudosGivenEvent } from "../bus/events.ts";
import type { Annotations } from "../engine/messageEvent.ts";
import { catalogue } from "./catalogue.ts";
import { progress, standing, type Giving, type EarlierAward, type MemberProgress, type Receiving } from "./progress.ts";
import type { PerkId } from "./tree.ts";

const alice = "alice" as Id<"members">;
const bob = "bob" as Id<"members">;
const carol = "carol" as Id<"members">;
const thoughtful = { gate: { version: 1, thoughtful: true, words: 6 } };
const notThoughtful = { gate: { version: 1, thoughtful: false, words: 1 } };

describe("P1: base XP", () => {
  test.each([
    ["the giver of one kudos", alice, [[bob, 1]], [10]],
    ["the giver of three kudos to one recipient", alice, [[bob, 3]], [30]],
    ["the giver of two kudos to each of two recipients", alice, [[bob, 2], [carol, 2]], [20, 20]],
    ["a recipient of one kudos", bob, [[bob, 1]], [5]],
    ["a recipient of three kudos", bob, [[bob, 3]], [15]],
    ["a recipient among two", carol, [[bob, 2], [carol, 2]], [10]],
  ] as const)("%s", (_, member, awards, baseXp) => {
    const { effects } = progress(starting(member), kudosGiven(awards), catalogue);

    expect(effects.map((record) => record.baseXp)).toEqual(baseXp);
  });

  test("a member the event doesn't name gets no record", () => {
    const { effects, state } = progress(starting(carol), kudosGiven([[bob, 1]]), catalogue);

    expect(effects).toEqual([]);
    expect(state.xp).toBe(0);
  });
});

describe("P7: an effects record per side of every award", () => {
  test("keyed by award and side, with the day, the gate decision and the catalogue version", () => {
    const event = kudosGiven([[bob, 1], [carol, 1]], notThoughtful);

    const { effects } = progress(starting(alice), event, catalogue);

    expect(effects).toEqual([
      { award: "award-bob", side: "giver", member: alice, day: "2026-10-13", baseXp: 10, gate: { version: 1, thoughtful: false }, catalogueVersion: "2", coins: [{ source: "giving", coins: 4 }] },
      { award: "award-carol", side: "giver", member: alice, day: "2026-10-13", baseXp: 10, gate: { version: 1, thoughtful: false }, catalogueVersion: "2", coins: [{ source: "giving", coins: 4 }] },
    ]);
  });

  test("a message without a gate annotation records no gate decision", () => {
    const { effects } = progress(starting(bob), kudosGiven([[bob, 1]], {}), catalogue);

    expect(effects).toEqual([expect.objectContaining({ side: "recipient", baseXp: 5, gate: null })]);
  });
});

test.each([
  ["thoughtful", true],
  ["not thoughtful", false],
])("P13: base XP is the same for a %s kudos", (_, thoughtful) => {
  const event = kudosGiven([[bob, 2]], { gate: { version: 1, thoughtful, words: thoughtful ? 5 : 4 } });

  expect(progress(starting(alice), event, catalogue).state.xp).toBe(20);
  expect(progress(starting(bob), event, catalogue).state.xp).toBe(10);
});

describe("P16 P18 P20: row 5's bonus XP on the giver's qualifying recognitions", () => {
  const spark = { source: "spark", xp: 5 };
  const rhythm = { source: "rhythm", xp: 2 };
  const circle = { source: "circle", xp: 5 };
  const everyPerk: PerkId[] = ["spark", "rhythm", "circle"];
  const today = "2026-10-13";
  const yesterday = "2026-10-12";
  const lastSunday = "2026-10-11";

  test.each([
    ["the week's first recognition earns every line", everyPerk, [], [spark, rhythm, circle]],
    ["Bob again the same day earns nothing", everyPerk, [earlier(bob, today)], []],
    ["Carol after Bob the same day earns rhythm and circle", everyPerk, [earlier(carol, today)], [rhythm, circle]],
    ["Bob the day after earns spark and rhythm", everyPerk, [earlier(bob, yesterday)], [spark, rhythm]],
    ["Bob after last week's recognition earns every line", everyPerk, [earlier(bob, lastSunday)], [spark, rhythm, circle]],
    ["only the perks the giver owns pay", ["circle", "rhythm"], [], [rhythm, circle]],
    ["a giver without perks earns no lines", [], [], []],
  ] satisfies Array<[string, PerkId[], EarlierAward[], unknown[]]>)("%s", (_, perks, earlierAwards, lines) => {
    const { effects, state } = progress(starting(alice), kudosGiven([[bob, 1]], thoughtful), catalogue, { perks, earlier: earlierAwards });

    expect(effects.map(({ bonus }) => bonus ?? [])).toEqual([lines]);
    expect(state.xp).toBe(10 + lines.reduce((sum, { xp }) => sum + xp, 0));
  });

  test.each([
    ["doesn't say why", { gate: { version: 1, thoughtful: false, words: 1 } }],
    ["has no gate decision", {}],
  ])("HH6: a kudos that %s earns every line like any kudos", (_, annotations) => {
    const { effects } = progress(starting(alice), kudosGiven([[bob, 1]], annotations), catalogue, owningEveryPerk());

    expect(effects.map(({ bonus }) => bonus)).toEqual([[spark, rhythm, circle]]);
  });

  test("a multi-kudos award earns base XP per kudos and each line once", () => {
    const { effects, state } = progress(starting(alice), kudosGiven([[bob, 3]], thoughtful), catalogue, owningEveryPerk());

    expect(effects).toEqual([expect.objectContaining({ baseXp: 30, bonus: [spark, rhythm, circle] })]);
    expect(state.xp).toBe(42);
  });

  test("a message to Bob and Carol pays spark on its first recognition, and rhythm and circle on each", () => {
    const { effects, state } = progress(starting(alice), kudosGiven([[bob, 1], [carol, 1]], thoughtful), catalogue, owningEveryPerk());

    expect(effects.map(({ bonus }) => bonus)).toEqual([
      [spark, rhythm, circle],
      [rhythm, circle],
    ]);
    expect(state.xp).toBe(20 + 12 + 7);
  });

  test("the recipient's record carries no lines", () => {
    const { effects } = progress(starting(bob), kudosGiven([[bob, 1]], thoughtful), catalogue, owningEveryPerk());

    expect(effects).toEqual([expect.not.objectContaining({ bonus: expect.anything() })]);
  });

  function owningEveryPerk(): Giving {
    return { perks: everyPerk, earlier: [] };
  }

  function earlier(recipient: Id<"members">, day: string): EarlierAward {
    return { recipient, day };
  }
});

describe("CO23: an owned upgrade's line replaces its base's", () => {
  const spark = { source: "spark", xp: 5 };
  const rhythm = { source: "rhythm", xp: 2 };
  const circle = { source: "circle", xp: 5 };
  const flame = { source: "flame", xp: 8 };
  const cadence = { source: "cadence", xp: 3 };
  const bridge = { source: "bridge", xp: 8 };
  const today = "2026-10-13";
  const yesterday = "2026-10-12";

  test.each([
    ["flame replaces spark", ["spark", "flame"], [], [flame]],
    ["cadence replaces rhythm", ["rhythm", "cadence"], [], [cadence]],
    ["bridge replaces circle on the week's first recognition, with no primary group", ["circle", "bridge"], [], [bridge]],
    ["every upgrade with every base", ["spark", "rhythm", "circle", "flame", "cadence", "bridge"], [], [flame, cadence, bridge]],
    ["one upgrade leaves the other bases' lines", ["spark", "rhythm", "circle", "cadence"], [], [spark, circle, cadence]],
    ["flame pays only on the day's first recognition", ["spark", "rhythm", "flame"], [{ recipient: carol, day: today }], [rhythm]],
    ["bridge pays only on the week's first recognition of the recipient", ["circle", "bridge"], [{ recipient: bob, day: yesterday }], []],
    ["Bob again the same day earns no upgrade line", ["spark", "flame", "rhythm", "cadence"], [{ recipient: bob, day: today }], []],
  ] satisfies Array<[string, PerkId[], EarlierAward[], unknown[]]>)("%s", (_, perks, earlier, lines) => {
    const { effects, state } = progress(starting(alice), kudosGiven([[bob, 1]], thoughtful), catalogue, { perks, earlier });

    expect(effects.map(({ bonus }) => bonus ?? [])).toEqual([lines]);
    expect(state.xp).toBe(10 + lines.reduce((sum, { xp }) => sum + xp, 0));
  });
});

describe("CO2: giving coins on the giver's qualifying recognitions", () => {
  const giving = { source: "giving", coins: 4 };
  const today = "2026-10-13";
  const yesterday = "2026-10-12";

  test.each([
    ["the day's first recognition of Bob earns 4 coins", kudosGiven([[bob, 1]], thoughtful), [], [[giving]]],
    ["a multi-kudos award earns them once", kudosGiven([[bob, 3]], thoughtful), [], [[giving]]],
    ["Bob and Carol in one message earn them for each", kudosGiven([[bob, 1], [carol, 1]], thoughtful), [], [[giving], [giving]]],
    ["Bob again the same day earns none", kudosGiven([[bob, 1]], thoughtful), [{ recipient: bob, day: today }], [[]]],
    ["Bob again the next day earns them again", kudosGiven([[bob, 1]], thoughtful), [{ recipient: bob, day: yesterday }], [[giving]]],
    ["HH6: a kudos that doesn't say why earns them too", kudosGiven([[bob, 1]], notThoughtful), [], [[giving]]],
    ["HH6: a kudos without a gate decision earns them too", kudosGiven([[bob, 1]]), [], [[giving]]],
  ] satisfies Array<[string, KudosGivenEvent, EarlierAward[], unknown[][]]>)("%s, whatever perks the giver owns", (_, event, earlier, lines) => {
    for (const perks of [[], ["spark", "rhythm", "circle"]] satisfies PerkId[][]) {
      const { effects, state } = progress(starting(alice), event, catalogue, { perks, earlier });

      expect(effects.map(({ coins }) => coins ?? [])).toEqual(lines);
      expect(state.xp).toBe(effects.reduce((sum, { baseXp, bonus = [] }) => sum + baseXp + bonus.reduce((total, { xp }) => total + xp, 0), 0));
    }
  });
});

describe("CO4: treasurer and banker coin lines on the giver's qualifying recognitions", () => {
  const giving = { source: "giving", coins: 4 };
  const treasurer = { source: "treasurer", coins: 2 };
  const banker = { source: "banker", coins: 4 };
  const today = "2026-10-13";

  test.each([
    ["treasurer adds 2 coins", ["treasurer"], kudosGiven([[bob, 1]], thoughtful), [], [[giving, treasurer]]],
    ["banker replaces treasurer's line with 4 coins", ["treasurer", "banker"], kudosGiven([[bob, 1]], thoughtful), [], [[giving, banker]]],
    ["treasurer pays on every recognition, not only the day's first", ["treasurer"], kudosGiven([[bob, 1]], thoughtful), [{ recipient: carol, day: today }], [[giving, treasurer]]],
    ["a multi-kudos award pays treasurer once", ["treasurer"], kudosGiven([[bob, 3]], thoughtful), [], [[giving, treasurer]]],
    ["Bob and Carol in one message pay treasurer for each", ["treasurer"], kudosGiven([[bob, 1], [carol, 1]], thoughtful), [], [[giving, treasurer], [giving, treasurer]]],
    ["Bob again the same day earns no perk coins", ["treasurer", "banker"], kudosGiven([[bob, 1]], thoughtful), [{ recipient: bob, day: today }], [[]]],
    ["HH6: a kudos that doesn't say why earns them too", ["treasurer"], kudosGiven([[bob, 1]], notThoughtful), [], [[giving, treasurer]]],
  ] satisfies Array<[string, PerkId[], KudosGivenEvent, EarlierAward[], unknown[][]]>)("%s", (_, perks, event, earlier, lines) => {
    const { effects, state } = progress(starting(alice), event, catalogue, { perks, earlier });

    expect(effects.map(({ coins }) => coins ?? [])).toEqual(lines);
    expect(effects.flatMap(({ bonus = [] }) => bonus).filter(({ source }) => source === "treasurer" || source === "banker")).toEqual([]);
    expect(state.xp).toBe(effects.reduce((sum, { baseXp, bonus = [] }) => sum + baseXp + bonus.reduce((total, { xp }) => total + xp, 0), 0));
  });

  test("with every perk, the upgrades pay their XP lines and banker its coin line", () => {
    const every: PerkId[] = ["spark", "rhythm", "circle", "flame", "cadence", "bridge", "treasurer", "banker"];

    const { effects, state } = progress(starting(alice), kudosGiven([[bob, 1]], thoughtful), catalogue, { perks: every, earlier: [] });

    expect(effects.map(({ bonus, coins }) => ({ bonus, coins }))).toEqual([
      {
        bonus: [
          { source: "flame", xp: 8 },
          { source: "cadence", xp: 3 },
          { source: "bridge", xp: 8 },
        ],
        coins: [giving, banker],
      },
    ]);
    expect(state.xp).toBe(29);
  });
});

describe("CO3: receiving coins on the recipient's awards", () => {
  const receiving = { source: "receiving", coins: 2 };
  const otherGivers = (count: number) => Array.from({ length: count }, (_, giver) => `giver-${giver}` as Id<"members">);

  test.each([
    ["the first award from Alice this week earns 2 coins", thoughtful, [], [receiving]],
    ["a second one from Alice this week earns none", thoughtful, [alice], []],
    ["Alice as the tenth giver of the week earns them", thoughtful, otherGivers(9), [receiving]],
    ["Alice as the eleventh giver of the week earns none", thoughtful, otherGivers(10), []],
    ["HH6: a kudos that doesn't say why earns them too", notThoughtful, [], [receiving]],
    ["HH6: a kudos without a gate decision earns them too", {}, [], [receiving]],
  ] satisfies Array<[string, Annotations, Id<"members">[], unknown[]]>)("%s", (_, annotations, paidBy, lines) => {
    const { effects, state } = progress(starting(bob), kudosGiven([[bob, 3]], annotations), catalogue, undefined, { paidBy });

    expect(effects).toEqual([expect.objectContaining({ side: "recipient", baseXp: 15 })]);
    expect(effects[0]!.coins ?? []).toEqual(lines);
    expect(state.xp).toBe(15);
  });

  test("receiving coins are never on the giver's record", () => {
    const { effects } = progress(starting(alice), kudosGiven([[bob, 1]], thoughtful), catalogue, undefined, { paidBy: [] } satisfies Receiving);

    expect(effects[0]!.coins).toEqual([{ source: "giving", coins: 4 }]);
  });
});

describe("P3 P4 P6 P63: levels, skill points and what the level-up DM needs", () => {
  test.each([
    [0, 0, 1, []],
    [10, 10, 1, []],
    [10, 20, 2, [{ level: 2, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 80 }]],
    [90, 100, 3, [{ level: 3, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200 }]],
    [290, 300, 4, [{ level: 4, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 300 }]],
    [590, 600, 5, [{ level: 5, skillPointsGained: 1, skillPoints: 1, xpToNextLevel: 400 }]],
    [3590, 3600, 10, [{ level: 10, skillPointsGained: 1, skillPoints: 6, xpToNextLevel: 900 }]],
    [17090, 17100, 20, [{ level: 20, skillPointsGained: 1, skillPoints: 16, xpToNextLevel: 1900 }]],
    [0, 100, 3, [{ level: 3, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200 }]],
    [10, 310, 4, [{ level: 4, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 290 }]],
    [290, 600, 5, [{ level: 5, skillPointsGained: 1, skillPoints: 1, xpToNextLevel: 400 }]],
    [100, 1000, 6, [{ level: 6, skillPointsGained: 2, skillPoints: 2, xpToNextLevel: 500 }]],
  ])("from %i XP to %i XP reaches level %i", (xpBefore, xpAfter, level, reached) => {
    const kudos = (xpAfter - xpBefore) / 10;
    const event = kudosGiven([[bob, kudos]]);

    const { state, events } = progress({ member: alice, xp: xpBefore, pointsSpent: 0 }, event, catalogue);

    expect(state.xp).toBe(xpAfter);
    expect(events).toEqual(
      reached.map((levelReached) => ({ type: "levelReached", workspace: "T1", member: alice, ...levelReached, message: event.message, at: event.at })),
    );
  });
});

test.each([
  [0, 0, { xp: 0, level: 1, skillPoints: 0 }],
  [20, 0, { xp: 20, level: 2, skillPoints: 0 }],
  [300, 0, { xp: 300, level: 4, skillPoints: 0 }],
  [600, 0, { xp: 600, level: 5, skillPoints: 1 }],
  [1500, 0, { xp: 1500, level: 7, skillPoints: 3 }],
  [3600, 0, { xp: 3600, level: 10, skillPoints: 6 }],
  [3600, 4, { xp: 3600, level: 10, skillPoints: 2 }],
])("P4: at %i XP with %i points spent, a member stands at %o", (xp, pointsSpent, expected) => {
  expect(standing({ member: alice, xp, pointsSpent })).toEqual(expected);
});

function starting(member: Id<"members">): MemberProgress {
  return { member, xp: 0, pointsSpent: 0 };
}

function kudosGiven(awards: ReadonlyArray<readonly [Id<"members">, number]>, annotations: Annotations = {}): KudosGivenEvent {
  return {
    type: "kudosGiven",
    workspace: "T1",
    message: { workspace: "T1", conversation: "C1", message: "1" },
    giver: alice,
    awards: awards.map(([recipient, kudos]) => ({ award: `award-${recipient}` as Id<"awards">, giver: alice, recipient, kudos })),
    via: "message",
    kudosEmoji: "taco",
    annotations,
    allowance: { dailyOpening: 3, dailyLeft: 0 },
    skippedMentions: 0,
    retry: false,
    inThread: false,
    day: "2026-10-13",
    at: Date.parse("2026-10-13T10:00:00Z"),
  };
}
