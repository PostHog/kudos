import { describe, expect, test } from "vitest";
import { createClock } from "./clock.ts";

describe("the clock", () => {
  test("reads real time until a test moves it, then real time plus the offset", () => {
    let real = 1_000;
    const clock = createClock({ real: () => real });
    expect(clock.now()).toBe(1_000);

    expect(clock.advance(500), "advance answers the new now").toBe(1_500);
    real = 2_000;
    expect(clock.now(), "real time keeps running under the offset").toBe(2_500);
  });

  test("moves only forward, by a finite amount", () => {
    const clock = createClock({ real: () => 0 });

    for (const ms of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => clock.advance(ms), String(ms)).toThrow("forward");
    expect(clock.now()).toBe(0);
  });
});
