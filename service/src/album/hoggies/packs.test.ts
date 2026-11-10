// convex/album/hoggies/packs.test.ts on the service: a crate's pack bonus, paid once through the website's and App
// Home's opens. ../albumPorts.testing.ts says where a website call stands in as the stub it waits on. Today's test mocked the
// bus's publish to read the events; here they are the backend's published events, read from where a test last looked.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { offForEveryone, onForEveryone, flagsFromPostHog } from "../../../testing/flags.ts";
import { waitsOn } from "../../../testing/waiting.ts";
import type { Command } from "../../commands/commands.ts";
import { levelOf } from "../../progression/levels.ts";
import { recordReward } from "../../progression/progression.ts";
import { receiveHomeClick } from "../../slack/receipts.ts";
import type { Feature } from "../../unlocks/feature.ts";
import type { MemberId } from "../../workspace/directory.ts";
import {
  aDeploymentForWorkspace,
  aFreshBackend,
  aMember,
  aSignedInSession,
  bookShippedBeforeAnyoneJoined,
  everythingWritten,
  everyTable,
  opens,
  reachesLevel,
  settleInTimeOrder,
  switchWebsite,
  unlocksShippedBeforeAnyoneJoined,
  type Reader,
  registry,
} from "../albumPorts.testing.ts";
import type { CrateKey } from "./crateKey.ts";
import { packBonusOf } from "./draw.ts";

const now = new Date("2026-10-14T10:00:00Z");
const thisWeek = "2026-10-12";
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const rowan = { user: "U_ROWAN", name: "Rowan Pike" };
const questsFlags = ["xp-levels", "unlocks", "quests"];
const packsFlags = ["collection", "packs"];
const startingOut = { xp: 0, level: 1, coins: 0, skillPoints: 0 };
const xpSteps = [5, 10, 15, 20, 25];
const coinAmounts = [1, 2, 3, 4, 5];

type Bonus = { xp: number; coins: number };

const testBackend = useTestBackend({ now: now.getTime(), registry });
let t: TestBackend;
let publishedSeen = 0;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The Convex file's beforeEach, run inside each test.
function setUp() {
  aDeploymentForWorkspace();
  t = testBackend();
  publishedSeen = 0;
}

function flagsOn(backend: TestBackend, ...keys: string[]) {
  return switchWebsite(backend, true, ...keys);
}

async function aTeamIn(backend: TestBackend, junoId?: string) {
  const member = await aMember(backend, juno.user, "member", "T1", { _id: junoId });
  const teammate = await aMember(backend, rowan.user);
  const { asSignedIn } = await aSignedInSession(backend, juno);
  return { backend, member, teammate, asSignedIn };
}

async function aReadyFeatureIn(backend: TestBackend, { alsoOn = [], junoId }: { alsoOn?: string[]; junoId?: string } = {}) {
  await flagsOn(backend, ...questsFlags, ...alsoOn);
  await unlocksShippedBeforeAnyoneJoined(backend);
  const team = await aTeamIn(backend, junoId);
  await reachesLevel(backend, team.member, 3);
  return team;
}

async function aShopperWithABoughtCrate(...alsoOn: string[]) {
  const shopping = ["xp-levels", "unlocks", "achievements", "coins", "crate-store"];
  await flagsOn(t, ...shopping);
  await bookShippedBeforeAnyoneJoined(t);
  const member = await aMember(t, juno.user);
  const { asSignedIn } = await aSignedInSession(t, juno);
  await t.seed.insert("memberProgress", { member, xp: 1000, pointsSpent: 0 });
  await reachesLevel(t, member, 6);
  await opens(t, member, "book");
  await opens(t, member, "coins");
  await t.run((ctx) => recordReward(ctx, "T1", { member, key: "test:earned:120", xp: 0, coins: 120, item: null, catalogueVersion: "2", at: 0 }));
  await flagsOn(t, ...shopping, "collection", ...alsoOn);
  expect(await asSignedIn.buyCrate({ next: 1 })).toEqual({ kind: "bought", crate: "bought:1" });
  return { member, asSignedIn };
}

function packsOn(backend: TestBackend, ...alsoOn: string[]) {
  return flagsOn(backend, ...questsFlags, ...alsoOn, ...packsFlags);
}

function openFeature(caller: Reader, feature: Feature = "quests") {
  return caller.openFeature({ feature });
}

function openCrate(caller: Reader, crate = "bought:1") {
  return caller.openCrate({ crate });
}

function openFromAppHome(backend: TestBackend, command: Command, eventId = "Ev_OPEN") {
  return backend.run((ctx) => receiveHomeClick(ctx, { workspace: "T1", eventId, user: juno.user, commands: [command] }));
}

async function bonusDrawnFor(member: MemberId, crate: string, secret = ""): Promise<Bonus> {
  const digest = new DataView(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${member}:${crate}:pack:1`)));
  const fractionAt = (offset: number) => digest.getUint32(offset) / 2 ** 32;
  return { xp: xpSteps[Math.floor(fractionAt(0) * xpSteps.length)]!, coins: coinAmounts[Math.floor(fractionAt(4) * coinAmounts.length)]! };
}

function standingAt(xp: number, coins = 0) {
  return { xp, level: levelOf(xp), coins, skillPoints: 0 };
}

// Today's `vi.mocked(publish).mockClear()`: what was published so far is no longer read.
async function clearPublished() {
  publishedSeen = (await t.published()).length;
}

async function publishedEvents() {
  return (await t.published()).slice(publishedSeen) as Array<Record<string, unknown> & { type: string }>;
}

// testing/hoggies.ts's withoutExposureOf.
function withoutExposureOf(flag: string, tables: Record<string, Record<string, unknown>[]>): Record<string, Record<string, unknown>[]> {
  return {
    ...tables,
    flagExposures: tables.flagExposures!.filter((exposure) => exposure.flag !== flag),
    analyticsOutbox: tables.analyticsOutbox!.filter(({ properties }) => (properties as Record<string, unknown> | undefined)?.feature_flag !== flag),
  };
}

function packsExposures() {
  const sent = t.postHog.events().filter(({ event, properties }) => event === "$feature_flag_called" && properties.$feature_flag === "packs");
  return [...new Map(sent.map((event) => [event.uuid, event])).values()].map(({ properties }) => properties.$feature_flag_response);
}

function levelUpDmsTo(user: string) {
  return t.slack
    .callsTo("chat.postMessage")
    .filter(({ channel, text }) => channel === user && String(text).startsWith("🎉 You reached level"))
    .map(({ text }) => String(text));
}

describe("CV13: a pack pays its bonus once", () => {
  waitsOn(["S6", "S10", "S15"], "CV2 CV6: a feature's crate opens its feature and pays its bonus, answered as applied beside the drop", async () => {
    setUp();
    const { member, asSignedIn } = await aReadyFeatureIn(t);
    await packsOn(t);
    const bonus = await bonusDrawnFor(member, "unlock:quests");

    expect(await openFeature(asSignedIn)).toEqual({ kind: "opened", applied: { xp: bonus.xp, coins: 0, from: startingOut, to: standingAt(bonus.xp) }, drop: expect.objectContaining({ copy: 1 }) });
  }, 60_000);

  waitsOn(["S6", "S10", "S15"], "CV2 CV6: a bought crate pays its bonus, its coins shown where coins are visible", async () => {
    setUp();
    const { member, asSignedIn } = await aShopperWithABoughtCrate("packs");
    const bonus = await bonusDrawnFor(member, "bought:1");

    expect(await openCrate(asSignedIn)).toEqual({ kind: "opened", applied: { xp: bonus.xp, coins: bonus.coins, from: standingAt(1000, 70), to: standingAt(1000 + bonus.xp, 70 + bonus.coins) }, drop: expect.objectContaining({ copy: 1 }) });
    expect(coinAmounts, "the bonus coins inside band v1").toContain(bonus.coins);
  }, 60_000);

  waitsOn(["S4", "S6", "S10", "S15"], "CV5 CV9: a feature and a bought crate opened from App Home pay their bonus once, and the website answers it", async () => {
    setUp();
    const { member, asSignedIn } = await aShopperWithABoughtCrate("packs");
    await openFromAppHome(t, { type: "openCrate", crate: "bought:1" });
    const bonus = await bonusDrawnFor(member, "bought:1");

    expect(await openCrate(asSignedIn)).toEqual({ kind: "opened", applied: { xp: bonus.xp, coins: bonus.coins, from: standingAt(1000, 70), to: standingAt(1000 + bonus.xp, 70 + bonus.coins) }, drop: expect.anything() });

    // Today's second fresh backend.
    t = await aFreshBackend(t, testBackend);
    const ready = await aReadyFeatureIn(t);
    await packsOn(t);
    await openFromAppHome(t, { type: "openUnlock", feature: "quests" });
    const featureBonus = await bonusDrawnFor(ready.member, "unlock:quests");
    expect(await openFeature(ready.asSignedIn)).toEqual({ kind: "opened", applied: { xp: featureBonus.xp, coins: 0, from: startingOut, to: standingAt(featureBonus.xp) }, drop: expect.anything() });
  }, 60_000);

  waitsOn(["S4", "S6", "S10", "S15"], "CV5: a second website open, a replayed App Home Open and a new App Home Open of an opened crate pay nothing and write nothing", async () => {
    setUp();
    const { asSignedIn } = await aReadyFeatureIn(t);
    await packsOn(t);
    await openFromAppHome(t, { type: "openUnlock", feature: "quests" });
    const first = await openFeature(asSignedIn);
    const before = await everythingWritten(t);
    await clearPublished();
    t.time.advance(60_000);

    await openFromAppHome(t, { type: "openUnlock", feature: "quests" });
    await openFromAppHome(t, { type: "openUnlock", feature: "quests" }, "Ev_OPEN_AGAIN");
    expect(await openFeature(asSignedIn), "the repeated website open").toEqual(first);

    expect((await everythingWritten(t)).tables, "tables after the repeats").toEqual({ ...before.tables, slackReceipts: expect.any(Array) });
    expect(await publishedEvents(), "events of the repeats").toEqual([]);
  }, 60_000);

  waitsOn(["S6", "S10", "S15"], "CV4 CV5: the same member and crate pay the same bonus in a second fresh backend with the same secret", async () => {
    setUp();
    vi.stubEnv("HOGGIE_DRAW_SECRET", "a-deployment-secret");
    // Today's two fresh backends gave Juno the same first ID: here the second starts on the emptied database, and both
    // give Juno one ID.
    const junoId = randomUUID();
    const elsewhere = await aReadyFeatureIn(t, { junoId });
    await packsOn(t);
    const answeredElsewhere = await openFeature(elsewhere.asSignedIn);
    t = await aFreshBackend(t, testBackend);
    const here = await aReadyFeatureIn(t, { junoId });
    await packsOn(t);
    expect(here.member).toBe(elsewhere.member);
    const bonus = await bonusDrawnFor(here.member, "unlock:quests", "a-deployment-secret");

    const answer = await openFeature(here.asSignedIn);

    expect(answer).toEqual(answeredElsewhere);
    expect(answer).toMatchObject({ applied: { xp: bonus.xp } });
  }, 60_000);

  waitsOn(["S4", "S6", "S10", "S15"], "CV5 CV9: a bonus that crosses a level publishes levelReached and sends the level-up DM, as any XP does", async () => {
    setUp();
    const { member } = await aReadyFeatureIn(t);
    await packsOn(t);
    await t.seed.insert("memberProgress", { member, xp: 15, pointsSpent: 0 });
    await settleInTimeOrder(t);
    const earlierDms = levelUpDmsTo(juno.user).length;
    await clearPublished();

    await openFromAppHome(t, { type: "openUnlock", feature: "quests" });
    await settleInTimeOrder(t);

    expect((await publishedEvents()).filter(({ type }) => type === "levelReached")).toEqual([expect.objectContaining({ member, level: 2 })]);
    expect(levelUpDmsTo(juno.user).slice(earlierDms)).toEqual([expect.stringContaining("level 2")]);
  }, 60_000);

  waitsOn(["S6", "S15"], "CV5: a refused open pays nothing", async () => {
    setUp();
    await packsOn(t);
    await unlocksShippedBeforeAnyoneJoined(t);
    const { member, asSignedIn } = await aTeamIn(t);

    expect(await openFeature(asSignedIn)).toEqual({ kind: "refused" });
    expect(await t.seed.all("memberProgress")).toEqual([]);
    expect((await t.seed.all("drops")).filter((drop) => drop.member === member)).toEqual([]);
  }, 60_000);

  waitsOn(["S6", "S10", "S15"], "CV5: a crate opened while packs was off keeps no bonus once packs turns on, and a pack paid stays paid when packs turns off", async () => {
    setUp();
    const { asSignedIn } = await aReadyFeatureIn(t, { alsoOn: ["everyone-board"] });
    await flagsOn(t, ...questsFlags, "everyone-board", "collection");
    const openedWhileOff = await openFeature(asSignedIn);
    await packsOn(t, "everyone-board");

    expect(await openFeature(asSignedIn), "the crate opened while packs was off").toEqual({ ...openedWhileOff, applied: null });
    const paid = await openFeature(asSignedIn, "leaderboard");
    expect(paid).toMatchObject({ applied: { xp: expect.any(Number) } });
    await flagsOn(t, ...questsFlags, "everyone-board", "collection");
    expect(await openFeature(asSignedIn, "leaderboard"), "the paid crate with packs off again").toEqual({ kind: "opened", drop: (paid as { drop: unknown }).drop });
  }, 60_000);
});

describe("CV3 CV4: the pack draw", () => {
  test("is SHA-256 of the secret, member, crate key, 'pack' and band version, bytes 0–3 picking the XP step and 4–7 the coins", async () => {
    for (const crate of ["journey:first-thanks", `weekly:${thisWeek}:1`, "group:g1:2026-10-12", "unlock:quests", "bought:7"] as CrateKey[]) {
      expect(await packBonusOf({ secret: "s", member: "m1", crate }), crate).toEqual(await bonusDrawnFor("m1" as MemberId, crate, "s"));
    }
  });

  test("over 10,000 crate keys, each XP step and each coin amount is drawn within one percentage point of its share", async () => {
    const keys = Array.from({ length: 10_000 }, (_, index): CrateKey => `bought:${index + 1}`);
    const bonuses = await Promise.all(keys.map((crate) => packBonusOf({ secret: "s", member: "m1", crate })));
    const shareOf = (count: number) => count / keys.length;

    for (const step of xpSteps) expect(Math.abs(shareOf(bonuses.filter((bonus) => bonus?.xp === step).length) - 0.2), `share of ${step} XP`).toBeLessThan(0.01);
    for (const amount of coinAmounts) expect(Math.abs(shareOf(bonuses.filter((bonus) => bonus?.coins === amount).length) - 0.2), `share of ${amount} coins`).toBeLessThan(0.01);
  });
});

describe("CV10: a paid bonus in hoggieDropped and hoggie dropped", () => {
  waitsOn(["S6", "S10", "S15"], "hoggieDropped carries the pack's XP and coins, and hoggie dropped projects them as pack_xp and pack_coins", async () => {
    setUp();
    const { member, asSignedIn } = await aReadyFeatureIn(t);
    await packsOn(t);
    await clearPublished();
    const bonus = await bonusDrawnFor(member, "unlock:quests");

    await openFeature(asSignedIn);
    await settleInTimeOrder(t);

    expect((await publishedEvents()).find(({ type }) => type === "hoggieDropped")).toMatchObject({ type: "hoggieDropped", member, crate: "unlock:quests", pack: bonus });
    const dropped = t.postHog.productEvents().filter(({ event }) => event === "hoggie dropped");
    expect(dropped.map(({ properties: { pack_xp, pack_coins, crate_kind } }) => ({ pack_xp, pack_coins, crate_kind }))).toEqual([{ pack_xp: bonus.xp, pack_coins: bonus.coins, crate_kind: "unlock" }]);
  });
});

describe("CV11: with packs off or unset, the opens pay no bonus", () => {
  for (const { condition, packs } of [
    { condition: "off", packs: [offForEveryone("packs")] },
    { condition: "unset", packs: [] },
  ]) {
    waitsOn(["S6", "S10", "S15"], `with packs ${condition}, the website's opens answer no applied field, and no drop record or hoggieDropped carries a bonus`, async () => {
      setUp();
      const { asSignedIn } = await aReadyFeatureIn(t, { alsoOn: ["everyone-board"] });
      await flagsFromPostHog(t.operations, t.postHog, ...["website", ...questsFlags, "everyone-board", "collection"].map(onForEveryone), ...packs);
      await clearPublished();

      expect(await openFeature(asSignedIn)).toEqual({ kind: "opened", drop: expect.anything() });
      expect(await openFeature(asSignedIn, "leaderboard")).toEqual({ kind: "opened", drop: expect.anything() });
      expect((await publishedEvents()).filter(({ type }) => type === "hoggieDropped")).toEqual([expect.not.objectContaining({ pack: expect.anything() }), expect.not.objectContaining({ pack: expect.anything() })]);
      expect(withoutExposureOf("packs", await everyTable(t)).drops).toEqual([expect.not.objectContaining({ pack: expect.anything() }), expect.not.objectContaining({ pack: expect.anything() })]);
    });
  }

  waitsOn(["S6", "S10", "S15"], "with packs off, a feature's and a bought crate's opens answer opened with the drop and no applied field", async () => {
    setUp();
    const { asSignedIn } = await aShopperWithABoughtCrate();

    expect(await openCrate(asSignedIn)).toEqual({ kind: "opened", drop: expect.objectContaining({ copy: 1 }) });

    // Today's second fresh backend.
    t = await aFreshBackend(t, testBackend);
    const ready = await aReadyFeatureIn(t, { alsoOn: ["collection"] });
    expect(await openFeature(ready.asSignedIn)).toEqual({ kind: "opened", drop: expect.objectContaining({ copy: 1 }) });
  });
});

describe("CV11: packs' exposure", () => {
  waitsOn(["S6", "S10", "S15"], "goes once per member and value, only in a first successful open while collection is on", async () => {
    setUp();
    const { asSignedIn } = await aReadyFeatureIn(t, { alsoOn: ["everyone-board"] });
    await flagsOn(t, ...questsFlags, "packs");
    await openFeature(asSignedIn, "leaderboard");
    await settleInTimeOrder(t);
    expect(packsExposures(), "exposures with collection off").toEqual([]);

    await packsOn(t);
    await openFeature(asSignedIn);
    await openFeature(asSignedIn);
    await settleInTimeOrder(t);

    expect(packsExposures()).toEqual([true]);
  });
});
