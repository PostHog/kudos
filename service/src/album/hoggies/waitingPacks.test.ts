// convex/album/hoggies/waitingPacks.test.ts on the service: the waiting packs getCollection lists and openCrate opens.
// ../albumPorts.testing.ts says where a website call stands in as the stub it waits on.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { waitsOn } from "../../../testing/waiting.ts";
import type { Command } from "../../commands/commands.ts";
import { recordReward } from "../../progression/progression.ts";
import { receiveHomeClick } from "../../slack/receipts.ts";
import {
  aDeploymentForWorkspace,
  aFreshBackend,
  aMember,
  aSignedInSession,
  bookShippedBeforeAnyoneJoined,
  everythingWritten,
  opens,
  reachesLevel,
  setTime,
  switchWebsite,
  unlocksShippedBeforeAnyoneJoined,
  type Reader,
} from "../albumPorts.testing.ts";

const now = new Date("2026-10-14T10:00:00Z");
const minuteMs = 60_000;
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const shopping = ["xp-levels", "unlocks", "quests", "achievements", "coins", "crate-store", "everyone-board"];
const packsFlags = ["collection", "packs"];
const everyKindWaiting = [
  { crate: "unlock:leaderboard", kind: "unlock", n: 1 },
  { crate: "bought:1", kind: "bought", n: 2 },
];

type Collector = Awaited<ReturnType<typeof aCollectorWithEveryKindWaiting>>;

const testBackend = useTestBackend({ now: now.getTime() });
let t: TestBackend;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The Convex file's beforeEach, run inside each test.
function setUp() {
  aDeploymentForWorkspace();
  t = testBackend();
}

function flagsOn(backend: TestBackend, ...keys: string[]) {
  return switchWebsite(backend, true, ...keys);
}

async function aShopperIn(backend: TestBackend, { level, coins, flags = shopping, junoId }: { level: number; coins: number; flags?: string[]; junoId?: string }) {
  setTime(backend, now.getTime());
  await flagsOn(backend, ...flags);
  await unlocksShippedBeforeAnyoneJoined(backend);
  await bookShippedBeforeAnyoneJoined(backend);
  const member = await aMember(backend, juno.user, "member", "T1", { _id: junoId });
  const { asSignedIn } = await aSignedInSession(backend, juno);
  await backend.seed.insert("memberProgress", { member, xp: 1000, pointsSpent: 0 });
  await reachesLevel(backend, member, level);
  await opens(backend, member, "book");
  if (level >= 6) await opens(backend, member, "coins");
  await backend.run((ctx) => recordReward(ctx, "T1", { member, key: `test:earned:${coins}`, xp: 0, coins, item: null, catalogueVersion: "2", at: 0 }));
  return { backend, member, asSignedIn };
}

async function aShopperWithEveryFeatureOpenIn(backend: TestBackend, coins: number) {
  const shopper = await aShopperIn(backend, { level: 6, coins });
  for (const feature of ["quests", "leaderboard"] as const) await opens(backend, shopper.member, feature);
  await flagsOn(backend, ...shopping, ...packsFlags);
  return shopper;
}

async function aCollectorWithEveryKindWaiting(backend: TestBackend = t, junoId?: string) {
  const shopper = await aShopperIn(backend, { level: 6, coins: 120, junoId });
  await opens(backend, shopper.member, "quests");
  await flagsOn(backend, ...shopping, ...packsFlags);
  later(backend, 3);
  expect(await shopper.asSignedIn.buyCrate({ next: 1 })).toEqual({ kind: "bought", crate: "bought:1" });
  later(backend, 4);
  return shopper;
}

function later(backend: TestBackend, minutes: number) {
  setTime(backend, now.getTime() + minutes * minuteMs);
}

function secondsLater(backend: TestBackend, seconds: number) {
  setTime(backend, now.getTime() + seconds * 1000);
}

async function packsOf(caller: Reader) {
  const answer = await caller.getCollection();
  if (answer.kind !== "collection") throw new Error(`expected the collection, got ${answer.kind}`);
  return { packs: answer.packs, morePacks: answer.morePacks };
}

function openCrate(caller: Reader, crate: string) {
  return caller.openCrate({ crate });
}

function openFromAppHome(backend: TestBackend, command: Command, eventId: string) {
  return backend.run((ctx) => receiveHomeClick(ctx, { workspace: "T1", eventId, user: juno.user, commands: [command] }));
}

function renumbered(packs: typeof everyKindWaiting) {
  return packs.map((pack, index) => ({ ...pack, n: index + 1 }));
}

function without(...crates: string[]) {
  return renumbered(everyKindWaiting.filter(({ crate }) => !crates.includes(crate)));
}

async function domainTablesOf(backend: TestBackend) {
  const { tables } = await everythingWritten(backend);
  const domain = ["drops", "unlocks", "boughtCrates", "memberProgress", "rewardRecords", "hoggieTallies"] as const;
  return Object.fromEntries(domain.map((table) => [table, tables[table]!.map(withoutGeneratedFields)]));
}

function withoutGeneratedFields({ _id, _creationTime, ...row }: Record<string, unknown>) {
  return row;
}

describe("CV7: every waiting pack in getCollection", () => {
  waitsOn(["S6", "S10", "S15", "S16"], "lists a ready feature and a bought crate, oldest waiting first, with no amount", async () => {
    setUp();
    const { asSignedIn } = await aCollectorWithEveryKindWaiting();

    expect(await packsOf(asSignedIn)).toEqual({ packs: everyKindWaiting, morePacks: false });
  }, 60_000);

  waitsOn(["S4", "S6", "S10", "S15", "S16"], "drops each pack once it is opened, from App Home or on the website, renumbering the rest", async () => {
    setUp();
    const { backend, asSignedIn } = await aCollectorWithEveryKindWaiting();

    await openFromAppHome(backend, { type: "openUnlock", feature: "leaderboard" }, "Ev_FEATURE");
    expect(await packsOf(asSignedIn), "after App Home opened the feature").toEqual({ packs: without("unlock:leaderboard"), morePacks: false });
    await openCrate(asSignedIn, "bought:1");
    expect(await packsOf(asSignedIn), "after every open").toEqual({ packs: [], morePacks: false });
  }, 60_000);

  waitsOn(["S6", "S10", "S15", "S16"], "leaves out features not ready yet", async () => {
    setUp();
    const atLevelTwo = await aShopperIn(t, { level: 2, coins: 0 });
    await flagsOn(atLevelTwo.backend, ...shopping, ...packsFlags);
    expect(await packsOf(atLevelTwo.asSignedIn), "at level 2, with Quests and Coins still locked").toEqual({ packs: [{ crate: "unlock:leaderboard", kind: "unlock", n: 1 }], morePacks: false });
  }, 60_000);

  waitsOn(["S6", "S10", "S15", "S16"], "lists 50 of 60 bought crates in the order they were bought, says more wait, answers the same on every read, and stays inside Convex's limits", async () => {
    setUp();
    const fifty = Array.from({ length: 50 }, (_, index) => ({ crate: `bought:${index + 1}`, kind: "bought", n: index + 1 }));
    const { asSignedIn } = await aShopperWithEveryFeatureOpenIn(t, 60 * 50);
    for (let next = 1; next <= 60; next++) {
      secondsLater(t, next);
      await asSignedIn.buyCrate({ next });
    }

    expect(await packsOf(asSignedIn)).toEqual({ packs: fifty, morePacks: true });
    expect(await packsOf(asSignedIn), "a second read").toEqual({ packs: fifty, morePacks: true });

    // Today's second backend ran with Convex's transaction limits, which the service has none of: this is the same read
    // again, on a fresh backend.
    t = await aFreshBackend(t, testBackend);
    const limited = await aShopperWithEveryFeatureOpenIn(t, 60 * 50);
    for (let next = 1; next <= 60; next++) {
      secondsLater(t, next);
      await limited.asSignedIn.buyCrate({ next });
    }
    expect(await packsOf(limited.asSignedIn), "the read with transaction limits").toEqual({ packs: fifty, morePacks: true });
  }, 60_000);

  waitsOn(["S6", "S10", "S15", "S16"], "orders crates bought in one instant by their number, so the 50 listed are the first 50 bought", async () => {
    setUp();
    const { asSignedIn } = await aShopperWithEveryFeatureOpenIn(t, 60 * 50);
    for (let next = 1; next <= 60; next++) await asSignedIn.buyCrate({ next });

    expect(await packsOf(asSignedIn)).toEqual({ packs: Array.from({ length: 50 }, (_, index) => ({ crate: `bought:${index + 1}`, kind: "bought", n: index + 1 })), morePacks: true });
  }, 60_000);

  waitsOn(["S6", "S10", "S15", "S16"], "with packs off, getCollection answers the collection with no packs and no morePacks", async () => {
    setUp();
    const { asSignedIn } = await aCollectorWithEveryKindWaiting();
    await flagsOn(t, ...shopping, "collection");
    const answer = await asSignedIn.getCollection();

    expect(answer).toMatchObject({ kind: "collection", bought: ["bought:1"] });
    expect(answer).not.toHaveProperty("packs");
    expect(answer).not.toHaveProperty("morePacks");
  }, 60_000);
});

describe("CV8: openCrate opens any listed pack", () => {
  waitsOn(["S6", "S10", "S15"], "opens each kind, answering and leaving what the kind's own command answers and leaves", async () => {
    setUp();
    // Today's two fresh backends gave Juno the same first ID: here the second starts on the emptied database, and both
    // give Juno one ID.
    const junoId = randomUUID();
    const ownCommands: Record<string, (collector: Collector) => Promise<unknown>> = {
      "unlock:leaderboard": ({ asSignedIn }) => asSignedIn.openFeature({ feature: "leaderboard" }),
      "bought:1": ({ asSignedIn }) => openCrate(asSignedIn, "bought:1"),
    };
    const byOwnCommand = await aCollectorWithEveryKindWaiting(t, junoId);
    const ownAnswers = new Map<string, unknown>();
    for (const { crate } of everyKindWaiting) ownAnswers.set(crate, await ownCommands[crate]!(byOwnCommand));
    const leftByOwnCommands = await domainTablesOf(t);
    t = await aFreshBackend(t, testBackend);
    const byOpenCrate = await aCollectorWithEveryKindWaiting(t, junoId);

    for (const { crate } of everyKindWaiting) {
      const answer = await openCrate(byOpenCrate.asSignedIn, crate);
      expect(answer, crate).toEqual(ownAnswers.get(crate));
      expect(answer, crate).toEqual({ kind: "opened", applied: { xp: expect.any(Number), coins: expect.any(Number), from: expect.any(Object), to: expect.any(Object) }, drop: expect.objectContaining({ copy: expect.any(Number) }) });
    }
    expect(await domainTablesOf(t), "the tables the opens leave").toEqual(leftByOwnCommands);
  }, 60_000);

  waitsOn(["S6", "S10", "S15"], "answers a repeat with the same drop and applied, and writes nothing more", async () => {
    setUp();
    const { asSignedIn } = await aCollectorWithEveryKindWaiting();
    const first = [];
    for (const { crate } of everyKindWaiting) first.push(await openCrate(asSignedIn, crate));
    expect(first, "the first opens").toEqual(everyKindWaiting.map(() => expect.objectContaining({ kind: "opened" })));
    const before = await everythingWritten(t);
    later(t, 10);

    for (const [index, { crate }] of everyKindWaiting.entries()) expect(await openCrate(asSignedIn, crate), crate).toEqual(first[index]);
    expect((await everythingWritten(t)).tables, "tables after the repeats").toEqual(before.tables);
  }, 60_000);

  waitsOn(["S6", "S10", "S15"], "answers drop null and applied null for a crate opened elsewhere while collection was off", async () => {
    setUp();
    const { member, asSignedIn } = await aShopperIn(t, { level: 6, coins: 0 });
    await opens(t, member, "quests");
    await flagsOn(t, ...shopping, ...packsFlags);

    expect(await openCrate(asSignedIn, "unlock:quests"), "a feature opened while collection was off").toEqual({ kind: "opened", applied: null, drop: null });
  }, 60_000);

  for (const { why, crate } of [
    { why: "a Journey step's crate", crate: "journey:first-thanks" },
    { why: "a weekly quest's crate", crate: "weekly:2026-10-12:0" },
    { why: "a locked feature", crate: "unlock:skillTree" },
    { why: "a crate not bought yet", crate: "bought:2" },
    { why: "a group crate", crate: "group:a-group:2026-10-12" },
    { why: "an unknown feature", crate: "unlock:nothing" },
    { why: "a key of no kind", crate: "nothing" },
  ]) {
    waitsOn(["S6", "S10", "S15"], `refuses ${why} and writes nothing`, async () => {
      setUp();
      const { member, asSignedIn } = await aShopperIn(t, { level: 6, coins: 120 });
      await opens(t, member, "quests");
      await flagsOn(t, ...shopping, ...packsFlags);
      later(t, 1);
      expect(await asSignedIn.buyCrate({ next: 1 })).toEqual({ kind: "bought", crate: "bought:1" });
      const before = await everythingWritten(t);

      expect(await openCrate(asSignedIn, crate)).toEqual({ kind: "refused" });
      expect(await everythingWritten(t), "everything after the refusal").toEqual(before);
    }, 60_000);
  }

  waitsOn(["S6", "S10", "S15"], "refuses every key while collection is off, writing nothing", async () => {
    setUp();
    const { backend, asSignedIn } = await aCollectorWithEveryKindWaiting();
    await flagsOn(backend, ...shopping, "packs");
    const before = await everythingWritten(t);

    for (const { crate } of everyKindWaiting) expect(await openCrate(asSignedIn, crate), crate).toEqual({ kind: "refused" });
    expect(await everythingWritten(t), "everything after the refusals").toEqual(before);
  }, 60_000);

  waitsOn(["S6", "S10", "S15"], "with packs off, opens bought crates only, as before", async () => {
    setUp();
    const { asSignedIn } = await aCollectorWithEveryKindWaiting();
    await flagsOn(t, ...shopping, "collection");
    const before = await everythingWritten(t);

    for (const crate of ["unlock:leaderboard"]) expect(await openCrate(asSignedIn, crate), crate).toEqual({ kind: "refused" });
    expect(await everythingWritten(t), "everything after the refusals").toEqual(before);
    expect(await openCrate(asSignedIn, "bought:1")).toEqual({ kind: "opened", drop: expect.objectContaining({ copy: 1 }) });
  }, 60_000);
});
