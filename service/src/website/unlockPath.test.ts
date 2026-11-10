import { describe, expect, test } from "vitest";
import { createClock } from "../clock.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import type { MemberUnlock } from "../unlocks/unlocks.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { featureCardsOf, leaderboardStateOf, openFeaturesOf, unlockPathOf, type UnlockPath } from "./unlockPath.ts";

const database = useTestDatabase();
const quiet: Log = { info() {}, error() {} };
const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => Date.parse("2026-11-10T10:00:00Z") }), log: quiet, retryDelayMs: () => 1 });
const seed = seeder(operations);

async function aMember(): Promise<VerifiedMember> {
  const member = await seed.insert("members", { workspace: "T1", user: "U_JUNO", kind: "member" });
  return { member, workspace: "T1", user: "U_JUNO", name: "Juno Whitlock" };
}

const path = (...unlocks: Array<Pick<MemberUnlock, "feature" | "state">>) => unlocks as MemberUnlock[];

describe("on the unlock path, the leaderboard's page follows the path", () => {
  test("open, ready or locked at its level as the path says, and off when the path leaves it out", async () => {
    const me = await aMember();
    const stateIn = (unlocks: UnlockPath) => operations.query("test.leaderboardStateOf", (ctx) => leaderboardStateOf(ctx, me, unlocks));

    expect(await stateIn(path({ feature: "leaderboard", state: "open" }))).toEqual({ kind: "open" });
    expect(await stateIn(path({ feature: "leaderboard", state: "ready" }))).toEqual({ kind: "ready" });
    expect(await stateIn(path({ feature: "leaderboard", state: "locked" }))).toMatchObject({ kind: "locked", level: expect.any(Number) });
    expect(await stateIn(path({ feature: "book", state: "open" }))).toEqual({ kind: "off" });
  });

  test("a member off the path gets no feature cards", async () => {
    const me = await aMember();

    expect(await operations.query("test.featureCardsOf", (ctx) => featureCardsOf(ctx, me, null))).toBeNull();
  });
});

waitsOn(["S11"], "off the path, the leaderboard is open when the everyone board is on for the member", async () => {
  const me = await aMember();

  expect(await operations.query("test.leaderboardStateOf", (ctx) => leaderboardStateOf(ctx, me, null))).toEqual({ kind: "off" });
});

waitsOn(["S6"], "a member's unlock path is their unlocks while the path is shown to them", async () => {
  const me = await aMember();

  expect(await operations.query("test.unlockPathOf", (ctx) => unlockPathOf(ctx, me))).toBeNull();
});

waitsOn(["S6", "S11"], "the open features are those the path opens, or the leaderboard alone off the path", async () => {
  const me = await aMember();

  expect(await operations.query("test.openFeaturesOf", (ctx) => openFeaturesOf(ctx, me))).toEqual([]);
});

waitsOn(["S7"], "each feature on the path gets a card with its name, when it opens, its level and its seen key", async () => {
  const me = await aMember();
  const cards = await operations.query("test.featureCardsOf", (ctx) => featureCardsOf(ctx, me, path({ feature: "leaderboard", state: "open" })));

  expect(cards).toMatchObject([{ feature: "leaderboard", state: "open", seen: expect.any(String) }]);
});
