import { describe, expect, test } from "vitest";
import { createClock } from "../clock.ts";
import { everyoneBoardFlag } from "../leaderboard/flag.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import { storeFlag } from "../store/storeFlag.ts";
import type { MemberUnlock } from "../unlocks/unlocks.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { seenKeyOf } from "./seen.ts";
import { featureCardsOf, leaderboardStateOf, openFeaturesOf, unlockPathOf, type UnlockPath } from "./unlockPath.ts";

const database = useTestDatabase();
const quiet: Log = { info() {}, error() {} };
const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => Date.parse("2026-11-10T10:00:00Z") }), log: quiet, retryDelayMs: () => 1 });
const seed = seeder(operations);

async function aMember(user = "U_JUNO"): Promise<VerifiedMember> {
  const member = await seed.insert("members", { workspace: "T1", user, kind: "member" });
  return { member, workspace: "T1", user, name: "Juno Whitlock" };
}

const opened = Date.parse("2026-11-03T09:00:00Z");
const leaderboardOpen: MemberUnlock = { feature: "leaderboard", state: "open", readyAt: opened, openedAt: opened };
const coinsLocked: MemberUnlock = { feature: "coins", state: "locked", readyAt: null, openedAt: null };
const unlock = (feature: MemberUnlock["feature"], state: MemberUnlock["state"]): MemberUnlock => ({ feature, state, readyAt: null, openedAt: null });

const stateIn = (me: VerifiedMember, path: UnlockPath) => operations.query("test.leaderboardStateOf", (ctx) => leaderboardStateOf(ctx, me, path));

describe("on the unlock path, the leaderboard's page follows the path", () => {
  test("open, ready, or locked at its level as the path says, and off when the path leaves it out", async () => {
    const me = await aMember();

    expect(await stateIn(me, [unlock("leaderboard", "open")])).toEqual({ kind: "open" });
    expect(await stateIn(me, [unlock("leaderboard", "ready")])).toEqual({ kind: "ready" });
    expect(await stateIn(me, [unlock("leaderboard", "locked")])).toEqual({ kind: "locked", level: 2 });
    expect(await stateIn(me, [unlock("book", "open")])).toEqual({ kind: "off" });
  });

  test("a member off the path gets no feature cards", async () => {
    const me = await aMember();

    expect(await operations.query("test.featureCardsOf", (ctx) => featureCardsOf(ctx, me, null))).toBeNull();
  });
});

waitsOn(["S11"], "off the path, the leaderboard is open while the everyone board is on for the member, and off while it is off", async () => {
  const me = await aMember();
  await definitionsStored(operations, onForEveryone(everyoneBoardFlag.key));
  expect(await stateIn(me, null)).toEqual({ kind: "open" });

  await definitionsStored(operations, offForEveryone(everyoneBoardFlag.key));
  expect(await stateIn(me, null)).toEqual({ kind: "off" });
});

test("a member the unlock path isn't shown to has no path", async () => {
  const me = await aMember();

  expect(await operations.query("test.unlockPathOf", (ctx) => unlockPathOf(ctx, me))).toBeNull();
});

waitsOn(["S6", "S11"], "off the path, the leaderboard alone is open while the everyone board is on, and nothing while it is off", async () => {
  const me = await aMember();
  const openFeatures = () => operations.query("test.openFeaturesOf", (ctx) => openFeaturesOf(ctx, me));
  await definitionsStored(operations, onForEveryone(everyoneBoardFlag.key));
  expect(await openFeatures()).toEqual(["leaderboard"]);

  await definitionsStored(operations, offForEveryone(everyoneBoardFlag.key));
  expect(await openFeatures()).toEqual([]);
});

waitsOn(["S7"], "without the store, each feature on the path gets a card with its own name, what it opens, its level and a seen key of its own", async () => {
  const juno = await aMember();
  const kai = await aMember("U_KAI");
  await definitionsStored(operations, offForEveryone(storeFlag.key));
  const cardsOf = (me: VerifiedMember) => operations.query("test.featureCardsOf", (ctx) => featureCardsOf(ctx, me, [leaderboardOpen, coinsLocked]));

  const cards = await cardsOf(juno);
  expect(cards).toEqual([
    { ...leaderboardOpen, name: "Leaderboard", opens: "the boards", level: 2, seen: await seenKeyOf(juno.member, "feature:leaderboard") },
    { ...coinsLocked, name: "Coins", opens: "your wallet and the coin perks", level: 6, seen: await seenKeyOf(juno.member, "feature:coins") },
  ]);
  expect(new Set(cards!.map(({ seen }) => seen)).size, "each feature has its own seen key").toBe(2);
  expect(await cardsOf(juno), "the seen keys hold across reads").toEqual(cards);
  expect((await cardsOf(kai))![0]!.seen, "and differ between members").not.toBe(cards![0]!.seen);
});
