// The daily allowance, from outside: what a giver has left on their allowance day, which turns at their local
// midnight, and what spending leaves. Today's engine reaches it through a kudos message (engine.test.ts, R11 to R17);
// these drive the two bodies directly until the message flow lands.
import { describe, expect, test } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { allowanceDay, allowanceLeft, dailyAllowance } from "./allowance.ts";

const backend = useTestBackend();
const giver = "member-giver";
const base = 5;

/** Spends `kudos` from the giver's allowance on the day of the app's clock in `timeZone`, and answers what was left before. */
async function spendNow(t: ReturnType<typeof backend>, kudos: number, timeZone: string | undefined) {
  return t.run(async (ctx) => {
    const allowance = await dailyAllowance(ctx, giver, allowanceDay(ctx.now, timeZone), base);
    await allowance.spend(kudos);
    return { opening: allowance.opening, left: allowance.left };
  });
}

const leftNow = (t: ReturnType<typeof backend>, timeZone: string | undefined) => t.query((ctx) => allowanceLeft(ctx, giver, allowanceDay(ctx.now, timeZone), base));

describe("R11 R15 R17: the daily allowance opens at the base, and each spend leaves less", () => {
  test("a giver who spent nothing has the whole base, and what they spend is gone for the rest of the day", async () => {
    const t = backend({ now: Date.UTC(2026, 9, 13, 10) });

    const first = await spendNow(t, 2, "UTC");
    const second = await spendNow(t, 3, "UTC");

    expect(first, "the first spend's allowance").toEqual({ opening: 5, left: 5 });
    expect(second, "the next spend sees the first").toEqual({ opening: 5, left: 3 });
    expect(await leftNow(t, "UTC"), "what is left").toBe(0);
  });

  test("R16: a base lowered below what the giver already spent leaves 0, never less", async () => {
    const t = backend({ now: Date.UTC(2026, 9, 13, 10) });
    await spendNow(t, 4, "UTC");

    const left = await t.query((ctx) => allowanceLeft(ctx, giver, "2026-10-13", 3));

    expect(left, "what is left of the lower base").toBe(0);
  });

  test("another giver's spending is their own", async () => {
    const t = backend({ now: Date.UTC(2026, 9, 13, 10) });
    await spendNow(t, 4, "UTC");

    const others = await t.query((ctx) => allowanceLeft(ctx, "member-other", "2026-10-13", base));

    expect(others, "the other giver's allowance").toBe(5);
  });
});

describe("R12 R13: the allowance day turns at the giver's local midnight", () => {
  test("a giver in Los Angeles who spent it all at 23:30 local has the whole base again at 00:30 local", async () => {
    // 2026-10-13 23:30 in Los Angeles (UTC-7) is 2026-10-14 06:30 UTC.
    const t = backend({ now: Date.UTC(2026, 9, 14, 6, 30) });
    await spendNow(t, 5, "America/Los_Angeles");
    const lateThatNight = await leftNow(t, "America/Los_Angeles");

    t.time.advance(60 * 60_000);

    expect(lateThatNight, "at 23:30 local").toBe(0);
    expect(await leftNow(t, "America/Los_Angeles"), "at 00:30 local, a new day").toBe(5);
  });

  test("a giver east of UTC gets their new day before UTC does", async () => {
    // 2026-10-13 23:30 in Berlin (UTC+2) is 21:30 UTC; an hour later it is the 14th in Berlin, still the 13th in UTC.
    const t = backend({ now: Date.UTC(2026, 9, 13, 21, 30) });
    await spendNow(t, 5, "Europe/Berlin");

    t.time.advance(60 * 60_000);

    expect(await leftNow(t, "Europe/Berlin"), "after Berlin's midnight").toBe(5);
    expect(await t.query((ctx) => allowanceLeft(ctx, giver, "2026-10-13", base)), "what the 13th kept").toBe(0);
  });

  test("a giver without a time zone turns at midnight UTC", async () => {
    const t = backend({ now: Date.UTC(2026, 9, 13, 23, 30) });
    await spendNow(t, 5, undefined);
    const before = await leftNow(t, undefined);

    t.time.advance(60 * 60_000);

    expect(before, "before midnight UTC").toBe(0);
    expect(await leftNow(t, undefined), "after midnight UTC").toBe(5);
  });

  test("the night the clocks go back, the day still turns once, at local midnight", async () => {
    // Berlin leaves summer time on 2026-10-25 at 03:00 local (01:00 UTC); midnight before it is 2026-10-24 22:00 UTC.
    const t = backend({ now: Date.UTC(2026, 9, 24, 21, 30) });
    await spendNow(t, 5, "Europe/Berlin");

    t.time.advance(60 * 60_000);
    const afterMidnight = await leftNow(t, "Europe/Berlin");
    await spendNow(t, 5, "Europe/Berlin");
    t.time.advance(3 * 60 * 60_000);

    expect(afterMidnight, "after local midnight").toBe(5);
    expect(await leftNow(t, "Europe/Berlin"), "after the clocks went back, still the 25th").toBe(0);
  });
});

test("two spending rows for one giver and day are refused, as Convex's unique read refused them", async () => {
  const t = backend({ now: Date.UTC(2026, 9, 13, 10) });
  await t.seed.insert("allowanceSpending", { giver, day: "2026-10-13", spent: 1 });
  await t.seed.insert("allowanceSpending", { giver, day: "2026-10-13", spent: 1 });

  await expect(leftNow(t, "UTC"), "reading the allowance").rejects.toThrow("unique() query returned more than one result from table allowanceSpending:");
});
