import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { cronIds, cronSchedules, isCronId, nextRun, retiredCrons, type Schedule } from "./crons.ts";

// convex/crons.ts is the oracle: every cron it declares, with its schedule.
function convexCrons(): Map<string, Schedule> {
  const source = readFileSync(new URL("../../../convex/crons.ts", import.meta.url), "utf8");
  const crons = new Map<string, Schedule>();
  for (const [, kind, when, path] of source.matchAll(/crons\.(daily|interval)\(\s*"[^"]*",\s*\{([^}]*)\},\s*internal\.([\w.]+)/g)) {
    const numbers = Object.fromEntries([...when!.matchAll(/(\w+):\s*(\d+)/g)].map(([, key, n]) => [key, Number(n)]));
    crons.set(
      path!,
      kind === "daily"
        ? { daily: { hourUTC: numbers.hourUTC!, minuteUTC: numbers.minuteUTC! } }
        : { everyMs: ((numbers.minutes ?? 0) + (numbers.hours ?? 0) * 60) * 60_000 },
    );
  }
  return crons;
}

describe("the crons", () => {
  test("are convex/crons.ts's, each by its function's path, with the same schedule", () => {
    const oracle = convexCrons();

    expect(oracle.size, "the oracle parsed").toBe(16);
    expect(new Map(Object.entries(cronSchedules))).toEqual(oracle);
    expect([...cronIds].sort()).toEqual([...oracle.keys()].sort());
  });

  test("retire only the abandoned sign-in handshakes, whose verifiers the rewrite archives", () => {
    expect([...retiredCrons]).toEqual(["website.abandonedHandshakes.deleteAbandoned"]);
  });

  test("know their ids and nothing else", () => {
    expect(isCronId("website.clock.tick")).toBe(true);
    for (const text of ["website.clock", "", 1, undefined, "toString"]) expect(isCronId(text), String(text)).toBe(false);
  });
});

describe("a cron's next run", () => {
  const at = (iso: string) => Date.parse(iso);

  test("daily: the next time of day in UTC, strictly after", () => {
    const threeAm: Schedule = { daily: { hourUTC: 3, minuteUTC: 0 } };

    expect(nextRun(threeAm, at("2026-11-09T02:59:59.999Z"))).toBe(at("2026-11-09T03:00:00Z"));
    expect(nextRun(threeAm, at("2026-11-09T03:00:00Z")), "not the same instant again").toBe(at("2026-11-10T03:00:00Z"));
    expect(nextRun(threeAm, at("2026-12-31T23:00:00Z")), "across a year").toBe(at("2027-01-01T03:00:00Z"));
  });

  test("an interval: that long after the run, however late it ran", () => {
    expect(nextRun({ everyMs: 600_000 }, at("2026-11-09T10:07:13Z"))).toBe(at("2026-11-09T10:17:13Z"));
  });
});
