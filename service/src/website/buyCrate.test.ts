// A crate bought on the website for 50 coins, by the number of crates bought so far, and opened later for its one hoggie.
// Today's convex/website/buyCrate.test.ts, on the service's test backend: each purchase runs storeCommands.ts's
// `buyCrate` for a `me` made from the seeded directory row and a `person` the directory answers, as S15's member check
// answers them. getCollection (S16's website read) and openCrate (S15's website command) are handlers the service
// doesn't have yet, so each read or open ends in the stub for it. The purchases whose subject is the member check or the
// route's arguments (closed, signed out, not a member, a call naming a member) go through S15's route transport in S17's
// route pull request. Today's scheduled functions are the jobs table's rows.
import { asc, eq, getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { achievementsLiveIn } from "../achievements/flag.ts";
import { catalogue, hoggieNamed } from "../album/hoggies/catalogue.ts";
import { drawOf } from "../album/hoggies/draw.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { decodeStored } from "../db/codec.ts";
import { toDocument } from "../db/documents.ts";
import * as schema from "../db/schema/index.ts";
import * as loadTables from "../db/schema/load.ts";
import * as serviceTables from "../db/schema/service.ts";
import { jobs } from "../db/schema/service.ts";
import type { HomeMember } from "../feedback/homes.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { recordReward } from "../progression/progression.ts";
import { receiveHomeClick } from "../slack/receipts.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import { balanceOf } from "../wallet/wallet.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { CollectionAnswer } from "./collection.ts";
import type { CrateOpenAnswer } from "./commands.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { commandByRoute, readByRoute } from "./routesTesting.ts";
import { buyCrate as buyCrateCommand } from "./storeCommands.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const rowan = { user: "U_ROWAN", name: "Rowan Pike" };
const crateStoreFlags = ["xp-levels", "unlocks", "achievements", "coins", "collection", "crate-store"];
const levelSix = 1000;

// A shopper: unlocks and the Book shipped, level six reached, the Book and Coins opened, and coins earned (S6), with the
// level's hoggies (S10).
const aShopper: [Stack, ...Stack[]] = ["S6", "S10"];
// A purchase: the launch guard (S15), the crate store and its bought crates (S10), the command runner (S4), the wallet
// (S7), and App Home's republish (S5, S17), after a shopper.
const buying: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S10", "S15", "S17"];
// A purchase read back from the Book's collection: getCollection, the website's read (S16).
const buyingAndReading: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S10", "S15", "S16", "S17"];
// A bought crate opened: openCrate, the website's command (S15), and the drop it opens (S8, S10).
const opening: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S8", "S10", "S15", "S16", "S17"];
// The drop's product event, through the analytics drain (S14).
const openingAndCapturing: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S8", "S10", "S14", "S15", "S16", "S17"];

type Row = Record<string, unknown>;
type Person = { user: string; name: string };

const backend = useTestBackend({ now: now.getTime(), workspace: allowedWorkspace });

let t: TestBackend;

beforeEach(() => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", allowedWorkspace);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  t = backend();
});

afterEach(() => void vi.unstubAllEnvs());

// Today's `switchWebsite(t, postHog, true, ...keys)`: the website open, these flags on for everyone, and the workspace's key made.
async function flagsOn(...keys: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...keys.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

async function bookShippedBeforeAnyoneJoined() {
  await t.run((ctx) => unlocksLiveIn(ctx, allowedWorkspace));
  await t.run((ctx) => achievementsLiveIn(ctx, allowedWorkspace));
  await t.settle();
}

/** Today's `aMember` and `aSignedInSession`: the directory row, the users row and analytics ID, and the member check's answer. */
async function signedIn(identity: Person) {
  const member = (await t.seed.insert("members", { workspace: allowedWorkspace, user: identity.user, kind: "member", asOf: 0 })) as MemberId;
  await t.seed.insert("users", { name: identity.name, chatIdentity: { workspace: allowedWorkspace, user: identity.user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  const me: VerifiedMember = { member, workspace: allowedWorkspace, user: identity.user, name: identity.name };
  return { member, me };
}

async function aShopperWith(coins: number, identity: Person = juno) {
  const shopper = await signedIn(identity);
  await t.seed.insert("memberProgress", { member: shopper.member, xp: levelSix, pointsSpent: 0 });
  await reachesLevel(shopper.member, 6);
  await opens(shopper.member, "book");
  await opens(shopper.member, "coins");
  if (coins > 0) await t.run((ctx) => recordReward(ctx, allowedWorkspace, { member: shopper.member, key: `test:earned:${coins}`, xp: 0, coins, item: null, catalogueVersion: "2", at: 0 }));
  return shopper;
}

async function aCrateStoreShopperWith(coins: number) {
  await flagsOn(...crateStoreFlags.filter((flag) => flag !== "collection"));
  await bookShippedBeforeAnyoneJoined();
  const shopper = await aShopperWith(coins);
  await flagsOn(...crateStoreFlags);
  return shopper;
}

// Today's `reachesLevel`: the levelReached event, through unlocks' `makeReady` and `earnLevelUpHoggies`.
async function reachesLevel(member: MemberId, level: number) {
  const message = { workspace: allowedWorkspace, conversation: "C1", message: `level-${level}-${member}` };
  const event: LevelReachedEvent = { type: "levelReached", workspace: allowedWorkspace, member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at: t.clock.now() };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

async function opens(member: MemberId, feature: Feature) {
  expect(await t.run((ctx) => openUnlock(ctx, member, feature, "slack"))).toBe("done");
}

// S16's collection read and S15's crate opening, by their route names: each ends in `notPorted` until its stack
// registers `website.collection.getCollection` or `website.commands.openCrate`.
function getCollection(ctx: QueryContext, me: VerifiedMember) {
  return readByRoute<CollectionAnswer>("website.collection.getCollection", ctx, me);
}

function openCrateCommand(ctx: MutationContext, me: VerifiedMember, _person: HomeMember, args: { crate: string }) {
  return commandByRoute<CrateOpenAnswer>("website.commands.openCrate", ctx, me, args);
}

/** Runs the purchase as the website's route does: the member check's `me`, and the directory's facts of them. */
function buyCrate(me: VerifiedMember, next: number) {
  return t.run(async (ctx) => buyCrateCommand(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, { next }));
}

function openCrate(me: VerifiedMember, crate: string) {
  return t.run(async (ctx) => openCrateCommand(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, { crate }));
}

async function storeOf(me: VerifiedMember) {
  const answer = await t.query((ctx) => getCollection(ctx, me));
  if (answer.kind !== "collection") throw new Error(`expected a collection, got ${JSON.stringify(answer)}`);
  return { bought: answer.bought, crateStore: answer.crateStore };
}

function coinsOf(member: MemberId) {
  return t.query((ctx) => balanceOf(ctx, member));
}

const everyTable = (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).sort((a, b) => getTableName(a).localeCompare(getTableName(b)));
// The service's own tables: none of them is one of today's `schema.tables`.
const servicesOwn = new Set((Object.values({ ...serviceTables, ...loadTables }) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).map(getTableName));

/** Every table's rows, today's tables and scheduled functions (the jobs) both, each in an explicit order; the service's own as stored. */
function everyTableWritten(): Promise<Record<string, Row[]>> {
  return t.query(async ({ tx }) => {
    const rows: Record<string, Row[]> = {};
    for (const table of everyTable) {
      const columns = getTableColumns(table);
      const order = columns._creationTime && columns._id ? [columns._creationTime, columns._id] : Object.values(columns);
      rows[getTableName(table)] = (await tx.select().from(table).orderBy(...order.map((column) => asc(column)))).map((row) => (servicesOwn.has(getTableName(table)) ? row : toDocument<Row>(table, row)));
    }
    return rows;
  });
}

/** Today's `withoutExposureOf(flag, tables)`: without the flag's exposures and the outbox rows that capture them. */
function withoutExposureOf(flag: string, tables: Record<string, Row[]>) {
  return {
    ...tables,
    flagExposures: (tables.flagExposures ?? []).filter((exposure) => exposure.flag !== flag),
    analyticsOutbox: (tables.analyticsOutbox ?? []).filter(({ properties }) => (properties as Row | undefined)?.feature_flag !== flag),
  };
}

async function everythingWritten() {
  return withoutExposureOf("crate-store", await everyTableWritten());
}

async function homeRepublishesFor(user: string) {
  const rows = await t.query(({ tx }) => tx.select({ args: jobs.args }).from(jobs).where(eq(jobs.name, "slack.appHome.publishHome")).orderBy(asc(jobs._creationTime), asc(jobs._id)));
  return rows.map(({ args }) => decodeStored(args) as Row).filter((args) => args.user === user);
}

// Today's `settleInTimeOrder`: settles, then moves the app's clock to the next pending job, until none is pending.
async function settleInTimeOrder() {
  for (let round = 0; round < 200; round += 1) {
    await t.settle();
    const [next] = await t.query(({ tx }) => tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt)).limit(1));
    if (next === undefined) return;
    if (next.runAt > t.clock.now()) t.time.advance(next.runAt - t.clock.now());
  }
  throw new Error("settleInTimeOrder: jobs were still pending after 200 rounds");
}

async function dropDrawnFor(member: MemberId, crate: string) {
  const { hoggie, rarity } = await drawOf({ secret: "", member, crate, version: catalogue.version });
  return { hoggie, name: hoggieNamed(hoggie)!.name, rarity, art: { kind: "hoggie", slug: hoggie }, copy: 1, isNew: true };
}

describe("CL27 CL30: a member buys a crate for 50 coins, by the number of crates they bought so far", () => {
  waitsOn(buyingAndReading, "with 120 coins, buying crate 1 spends 50, and the Book's collection lists the bought crate and offers crate 2", async () => {
    const { member, me } = await aCrateStoreShopperWith(120);
    expect(await storeOf(me)).toEqual({ bought: [], crateStore: { price: 50, next: 1 } });

    expect(await buyCrate(me, 1)).toEqual({ kind: "bought", crate: "bought:1" });

    expect(await coinsOf(member)).toBe(70);
    expect(await storeOf(me)).toEqual({ bought: ["bought:1"], crateStore: { price: 50, next: 2 } });
    expect(await t.seed.all("coinSpends")).toEqual([expect.objectContaining({ member, coins: 50, for: { crate: "bought:1" }, at: now.getTime() })]);
  });

  waitsOn(buying, "with 49 coins, buying refuses with no-coins and writes nothing", async () => {
    const { member, me } = await aCrateStoreShopperWith(49);
    const before = await everythingWritten();

    expect(await buyCrate(me, 1)).toEqual({ kind: "refused", reason: "no-coins" });

    expect(await everythingWritten()).toEqual(before);
    expect(await coinsOf(member)).toBe(49);
  });

  waitsOn(buyingAndReading, "the same crate number bought twice buys once and answers the same both times", async () => {
    const { member, me } = await aCrateStoreShopperWith(200);

    expect(await buyCrate(me, 1)).toEqual({ kind: "bought", crate: "bought:1" });
    const before = await everythingWritten();
    expect(await buyCrate(me, 1)).toEqual({ kind: "bought", crate: "bought:1" });

    expect(await everythingWritten()).toEqual(before);
    expect(await coinsOf(member)).toBe(150);
    expect(await storeOf(me)).toEqual({ bought: ["bought:1"], crateStore: { price: 50, next: 2 } });
  });

  waitsOn(buyingAndReading, "two crates bought in order both succeed, and a number ahead of the next refuses with stale and writes nothing", async () => {
    const { member, me } = await aCrateStoreShopperWith(200);

    expect(await buyCrate(me, 1)).toEqual({ kind: "bought", crate: "bought:1" });
    expect(await buyCrate(me, 2)).toEqual({ kind: "bought", crate: "bought:2" });
    const before = await everythingWritten();
    for (const next of [4, 0, -1, 2.5, Number.NaN]) expect({ next, answer: await buyCrate(me, next) }).toEqual({ next, answer: { kind: "refused", reason: "stale" } });

    expect(await everythingWritten()).toEqual(before);
    expect(await coinsOf(member)).toBe(100);
    expect(await storeOf(me)).toEqual({ bought: ["bought:1", "bought:2"], crateStore: { price: 50, next: 3 } });
  });

  waitsOn(buyingAndReading, "before Coins is open, buying refuses with coins-not-open, the store offers nothing and nothing is written", async () => {
    await flagsOn(...crateStoreFlags);
    await bookShippedBeforeAnyoneJoined();
    const { member, me } = await signedIn(juno);
    await reachesLevel(member, 4);
    await opens(member, "book");
    const before = await everythingWritten();

    expect(await buyCrate(me, 1)).toEqual({ kind: "refused", reason: "coins-not-open" });

    expect(await everythingWritten()).toEqual(before);
    expect(await storeOf(me)).toEqual({ bought: [], crateStore: null });
  });

  for (const { condition, flags } of [
    { condition: "with crate-store off", flags: crateStoreFlags.filter((flag) => flag !== "crate-store") },
    { condition: "with collection off", flags: crateStoreFlags.filter((flag) => flag !== "collection") },
  ]) {
    waitsOn(buying, `${condition}, buying answers null and writes nothing`, async () => {
      const { member, me } = await aCrateStoreShopperWith(200);
      await flagsOn(...flags);
      const before = await everythingWritten();

      expect(await buyCrate(me, 1)).toBeNull();

      expect(await everythingWritten()).toEqual(before);
      expect(await coinsOf(member)).toBe(200);
    });
  }
});

describe("CL28 CL30: a bought crate waits until its member opens it, and drops one hoggie", () => {
  waitsOn(openingAndCapturing, "a bought crate opens once with its drop, a repeated open answers the same drop and writes nothing, and the crate stops waiting", async () => {
    const { member, me } = await aCrateStoreShopperWith(50);
    await buyCrate(me, 1);
    const drop = await dropDrawnFor(member, "bought:1");

    expect(await openCrate(me, "bought:1")).toEqual({ kind: "opened", drop });
    await settleInTimeOrder();
    const before = await everythingWritten();
    expect(await openCrate(me, "bought:1")).toEqual({ kind: "opened", drop });

    // Today compared the tables without the scheduled functions: the jobs are the service's scheduled functions.
    expect({ ...(await everythingWritten()), jobs: [] }).toEqual({ ...before, jobs: [] });
    expect(await storeOf(me)).toEqual({ bought: [], crateStore: { price: 50, next: 2 } });
    const drops = t.postHog.productEvents().filter(({ event }) => event === "hoggie dropped");
    expect(drops.map(({ properties }) => properties)).toEqual([expect.objectContaining({ rarity: drop.rarity, is_new: true, crate_kind: "bought" })]);
  });

  waitsOn(opening, "a crate the member didn't buy, someone else's bought crate and a quest's crate key refuse and write nothing", async () => {
    const { me } = await aCrateStoreShopperWith(50);
    const rowansShop = await aShopperWith(50, rowan);
    await buyCrate(rowansShop.me, 1);
    const before = await everythingWritten();

    for (const crate of ["bought:1", "bought:2", "journey:first-thanks", "unlock:book"]) expect({ crate, answer: await openCrate(me, crate) }).toEqual({ crate, answer: { kind: "refused" } });

    expect(await everythingWritten()).toEqual(before);
  });

  waitsOn(opening, "with collection off, opening refuses and the crate keeps waiting, and once it is back on the crate opens with its drop", async () => {
    const { member, me } = await aCrateStoreShopperWith(50);
    await buyCrate(me, 1);
    await flagsOn(...crateStoreFlags.filter((flag) => flag !== "collection"));
    const before = await everythingWritten();

    expect(await openCrate(me, "bought:1")).toEqual({ kind: "refused" });

    expect(await everythingWritten()).toEqual(before);
    await flagsOn(...crateStoreFlags);
    expect(await storeOf(me)).toEqual({ bought: ["bought:1"], crateStore: { price: 50, next: 2 } });
    expect(await openCrate(me, "bought:1")).toEqual({ kind: "opened", drop: await dropDrawnFor(member, "bought:1") });
  });

  waitsOn(buyingAndReading, "every waiting bought crate is listed, however many wait", async () => {
    const { member, me } = await aCrateStoreShopperWith(0);
    const crates = Array.from({ length: 101 }, (_, index) => `bought:${index + 1}`);
    for (const [index, crate] of crates.entries()) await t.seed.insert("boughtCrates", { member, crate, n: index + 1, boughtAt: now.getTime() });

    expect(await storeOf(me)).toEqual({ bought: crates, crateStore: { price: 50, next: 102 } });
  });

  waitsOn(opening, "with crate-store off, a bought crate stays listed and still opens, and the store is no longer offered", async () => {
    const { member, me } = await aCrateStoreShopperWith(50);
    await buyCrate(me, 1);
    await flagsOn(...crateStoreFlags.filter((flag) => flag !== "crate-store"));

    expect(await storeOf(me)).toEqual({ bought: ["bought:1"], crateStore: undefined });
    expect(await openCrate(me, "bought:1")).toEqual({ kind: "opened", drop: await dropDrawnFor(member, "bought:1") });
    expect(await storeOf(me)).toEqual({ bought: undefined, crateStore: undefined });
  });
});

describe("a website command never launches unlocks", () => {
  waitsOn(opening, "WS62 P77: with no unlocks launch recorded, buying a crate answers null and opening one refused, and neither launches anything", async () => {
    const { me } = await aCrateStoreShopperWith(100);
    await buyCrate(me, 1);
    for (const launch of await t.seed.all("unlockLaunches")) await t.seed.delete("unlockLaunches", launch._id);
    const before = await everythingWritten();

    expect(await buyCrate(me, 2)).toBeNull();
    expect(await openCrate(me, "bought:1")).toEqual({ kind: "refused" });
    expect(await everythingWritten()).toEqual(before);
  });
});

describe("a website command is a D17 command", () => {
  waitsOn(opening, "CL27: a crate bought and opened on the website leaves the rows App Home's Buy and Open of the same crate leave, and schedules App Home's republish", async () => {
    const { member, me } = await aCrateStoreShopperWith(100);
    const inSlack = await aShopperWith(100, rowan);
    const republishedBefore = (await homeRepublishesFor(juno.user)).length;

    await buyCrate(me, 1);
    await openCrate(me, "bought:1");
    for (const [eventId, command] of [["Ev_BUY", { type: "buyCrate" as const, next: 1 }], ["Ev_OPEN", { type: "openCrate" as const, crate: "bought:1" }]] as const) {
      await t.run((ctx) => receiveHomeClick(ctx, { workspace: allowedWorkspace, eventId, user: rowan.user, commands: [command] }));
    }

    const rowsOf = async (who: MemberId) => {
      const own = async (table: "boughtCrates" | "coinSpends" | "drops") => (await t.seed.all(table)).filter((row) => row.member === who).map(({ _id, _creationTime, member: _, ...row }) => row as Row);
      return { boughtCrates: await own("boughtCrates"), coinSpends: await own("coinSpends"), boughtCratesDropped: (await own("drops")).filter(({ crate }) => String(crate).startsWith("bought:")).map(({ crate }) => crate) };
    };
    expect(await rowsOf(member)).toEqual(await rowsOf(inSlack.member));
    expect(await rowsOf(member)).toMatchObject({ boughtCrates: [{ crate: "bought:1", n: 1, openedAt: now.getTime() }], boughtCratesDropped: ["bought:1"] });
    expect(await homeRepublishesFor(juno.user)).toHaveLength(republishedBefore + 2);
  });

  waitsOn(buying, "CL27: a repeated purchase of the same crate schedules no republish", async () => {
    const { me } = await aCrateStoreShopperWith(100);
    await buyCrate(me, 1);
    const before = await everythingWritten();

    await buyCrate(me, 1);

    expect(await everythingWritten()).toEqual(before);
  });
});
