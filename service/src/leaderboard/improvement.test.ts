import { describe, expect, test } from "vitest";
import type { Entry } from "./board.ts";
import { improvement } from "./improvement.ts";

function given(values: Record<string, number>): Entry[] {
  return Object.entries(values).map(([name, value]) => ({ id: name.toLowerCase(), name, value }));
}

describe("G18: the improvement line", () => {
  test.each([
    {
      rule: "a gain above 0 shows the gain and the places climbed",
      now: given({ Ann: 5, Bob: 4, Cy: 1 }),
      before: given({ Bob: 3, Cy: 2, Ann: 1 }),
      best: 9,
      line: { gain: 4, places: 2 },
    },
    {
      rule: "a first-time giver with no position before gets the gain without places",
      now: given({ Ann: 2, Bob: 4 }),
      before: given({ Bob: 3 }),
      best: null,
      line: { gain: 2 },
    },
    {
      rule: "a gain without a better position leaves the places out",
      now: given({ Ann: 3, Bob: 5 }),
      before: given({ Ann: 1, Bob: 0 }),
      best: null,
      line: { gain: 2 },
    },
    {
      rule: "a viewer listed first in a shared rank before has no places to climb",
      now: given({ Ann: 4, Bob: 3 }),
      before: given({ Ann: 2, Bob: 2 }),
      best: null,
      line: { gain: 2 },
    },
    {
      rule: "places count positions when the viewer climbs out of a shared rank",
      now: given({ Bob: 4, Ann: 3 }),
      before: given({ Ann: 2, Bob: 2 }),
      best: null,
      viewer: "bob",
      line: { gain: 2, places: 1 },
    },
    {
      rule: "no gain with a completed period behind shows the best period",
      now: given({ Ann: 2 }),
      before: given({ Ann: 2 }),
      best: 6,
      line: { best: 6 },
    },
    {
      rule: "a loss is never stated: it shows the best period instead",
      now: given({ Ann: 1, Bob: 3 }),
      before: given({ Ann: 4, Bob: 1 }),
      best: 4,
      line: { best: 4 },
    },
    {
      rule: "a viewer who gave nothing yet sees the best period",
      now: given({ Bob: 3 }),
      before: given({}),
      best: 2,
      line: { best: 2 },
    },
    {
      rule: "no gain and no completed period means no line",
      now: given({ Ann: 1 }),
      before: given({ Ann: 3 }),
      best: null,
      line: null,
    },
  ])("$rule", ({ now, before, best, viewer = "ann", line }) => {
    expect(improvement(now, before, viewer, best)).toEqual(line);
  });
});
