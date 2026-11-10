// An item bought on the website: the store's gate, the D17 command it runs, and a coin spent once per click. Today's
// convex/website/buyItem.test.ts, on the service's test backend: each purchase runs storeCommands.ts's `buyItem` for a
// `me` made from the seeded directory row and a `person` the directory answers, as S15's member check answers them. The
// purchases whose subject is the member check or the route's arguments (closed, signed out, not a member, a call naming
// a member) call buyItem by its route name through the whole app, signed in through SSO or not at all, so the app's own
// identity mapping and member check (S15) answer them. Today's mocked `publish` is the events committed operations
// published, and today's scheduled functions are the jobs table's rows.
import { asc, eq, getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
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
import { recordReward } from "../progression/progression.ts";
import { memberChanged } from "../slack/hugsTesting.ts";
import { receiveHomeClick } from "../slack/receipts.ts";
import { grantItem } from "../store/inventory.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import { balanceOf } from "../wallet/wallet.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";
import { buyItem as buyItemCommand } from "./storeCommands.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const storeFlags = ["xp-levels", "unlocks", "coins", "store", "custom-kudos-emoji"];
const levelSix = 1000;
const shipit = "custom:shipit";
const partyparrot = "custom:partyparrot";
const firstRequest = "0d6f2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f";
const secondRequest = "7b9e4f3a-2c1d-4e5f-8a9b-0c1d2e3f4a5b";

// An open store: unlocks shipped, level six reached, Coins opened and coins earned (S6), with the level's hoggies (S10).
const anOpenStore: [Stack, ...Stack[]] = ["S6", "S10"];
// A purchase refused at the store's gate: the store's visibility (S7) and the launch guard (S15), after an open store.
const atTheGate: [Stack, ...Stack[]] = ["S6", "S7", "S10", "S15"];
// A purchase through D17: the command runner (S4), the store and the wallet (S7), App Home's republish (S5, S17), with
// the gate and an open store before it; App Home's Buy is Slack's receipt (S5).
const buying: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S10", "S15", "S17"];

type Row = Record<string, unknown>;

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

async function storeShipped(...alsoOn: string[]) {
  await flagsOn(...storeFlags);
  await t.run((ctx) => unlocksLiveIn(ctx, allowedWorkspace));
  await flagsOn(...storeFlags, ...alsoOn);
}

/** Today's `aMember` and `aSignedInSession` at level six: the directory row, the users row and analytics ID, and the member check's answer. */
async function aMemberAtLevelSix() {
  const member = (await t.seed.insert("members", { workspace: allowedWorkspace, user: juno.user, kind: "member", asOf: 0 })) as MemberId;
  await t.seed.insert("users", { name: juno.name, chatIdentity: { workspace: allowedWorkspace, user: juno.user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  await t.seed.insert("memberProgress", { member, xp: levelSix, pointsSpent: 0 });
  await reachesLevel(member, 6);
  const me: VerifiedMember = { member, workspace: allowedWorkspace, user: juno.user, name: juno.name };
  return { member, me };
}

/** Today's `aSignedInSession`: the person signs in, through SSO here, and the website's requests come as them. */
function aSession(person: { user: string }) {
  return signedInThroughSso(t, person, allowedWorkspace);
}

async function aMemberWithTheStoreOpen(coins: number) {
  const signedIn = await aMemberAtLevelSix();
  await opens(signedIn.member, "coins");
  if (coins > 0) await earns(signedIn.member, coins);
  for (const name of ["shipit", "partyparrot"]) await t.seed.insert("customKudosEmoji", { workspace: allowedWorkspace, name, url: `https://emoji.slack-edge.com/T1/${name}/0a1b2c.png`, pickedAt: now.getTime() });
  return signedIn;
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

async function earns(member: MemberId, coins: number) {
  await t.run((ctx) => recordReward(ctx, allowedWorkspace, { member, key: `test:earned:${coins}`, xp: 0, coins, item: null, catalogueVersion: "2", at: 0 }));
}

/** Runs the purchase as the website's route does: the member check's `me`, and the directory's facts of them. */
function buyItem(me: VerifiedMember, item = shipit, request = firstRequest) {
  return t.run(async (ctx) => buyItemCommand(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, { item, request }));
}

function homeClick(eventId: string, command: Parameters<typeof receiveHomeClick>[1]["commands"][number]) {
  return t.run((ctx) => receiveHomeClick(ctx, { workspace: allowedWorkspace, eventId, user: juno.user, commands: [command] }));
}

const everyTable = (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).sort((a, b) => getTableName(a).localeCompare(getTableName(b)));
// The service's own tables: none of them is one of today's `schema.tables`.
const servicesOwn = new Set((Object.values({ ...serviceTables, ...loadTables }) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).map(getTableName));

/** Every table's rows, today's tables and scheduled functions (the jobs) both, each in an explicit order; the service's own as stored. */
function everythingWritten(): Promise<Record<string, Row[]>> {
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

/** Today's `everyTable`: the rows of today's tables, without the service's own. */
async function everyTableOfToday() {
  return Object.fromEntries(Object.entries(await everythingWritten()).filter(([table]) => !servicesOwn.has(table)));
}

/** Empties every table, so one test runs today's two backends one after the other. */
async function emptied() {
  await t.run(async ({ tx }) => void (await tx.execute(sql.raw(`truncate ${everyTable.map((table) => `"${getTableName(table)}"`).join(", ")}`))));
}

/** Where the events published so far end, as today's `vi.mocked(publish).mockClear()` marks it. */
async function publishedSoFar() {
  return (await t.published()).length;
}

/** The events published since `from`, as today's mocked `publish` saw them: without the fact the bus adds. */
async function eventsSince(from: number) {
  return (await t.published()).slice(from).map(({ fact: _, ...event }) => event as Row & { type: string });
}

function newJobs(before: Row[], after: Row[]) {
  const earlier = new Set(before.map(({ _id }) => _id));
  return after.filter(({ _id }) => !earlier.has(_id));
}

async function homeRepublishesFor(user: string) {
  const rows = await t.query(({ tx }) => tx.select({ args: jobs.args }).from(jobs).where(eq(jobs.name, "slack.appHome.publishHome")).orderBy(asc(jobs._creationTime), asc(jobs._id)));
  return rows.map(({ args }) => decodeStored(args) as Row).filter((args) => args.user === user);
}

async function collectionOf(member: MemberId) {
  return (await t.seed.all("collection")).filter((row) => row.member === member).map(({ item, source }) => ({ item, source }));
}

function coinsOf(member: MemberId) {
  return t.query((ctx) => balanceOf(ctx, member));
}

const exposureTables = ["flagExposures", "analyticsIds", "analyticsOutbox", "analyticsDrain"] as const;

function withoutExposures(tables: Record<string, Row[]>) {
  return { ...tables, ...Object.fromEntries(exposureTables.map((table) => [table, []])) };
}

async function expectOnlyTheRefusalStored(before: Record<string, Row[]>, after: Record<string, Row[]>, from: number, outcome: Row) {
  const unchanged = (tables: Record<string, Row[]>) => withoutExposures({ ...tables, itemPurchases: [], homeSelections: [], jobs: [] });
  expect(unchanged(after)).toEqual(unchanged(before));
  expect(after.itemPurchases!.slice(before.itemPurchases!.length)).toMatchObject([{ outcome }]);
  expect(after.homeSelections!.map(({ tab }) => tab)).toEqual(["inventory"]);
  expect(newJobs(before.jobs!, after.jobs!).filter(({ name }) => !String(name).startsWith("analytics.") && name !== "testing.published")).toEqual([]);
  expect(await eventsSince(from)).toEqual([]);
}

type Block = { accessory?: { value?: string }; elements?: Array<{ value?: string }> };

function buyButtonsInHome() {
  const view = t.slack.homeShownTo(juno.user) as { type?: string; blocks?: Block[] } | undefined;
  expect(view?.type).toBe("home");
  return (view?.blocks ?? [])
    .flatMap((block) => [block.accessory?.value, ...(block.elements ?? []).map(({ value }) => value)])
    .filter((value): value is string => value !== undefined && value.includes("buyItem"))
    .map((value) => (JSON.parse(value) as { item: string }).item);
}

describe("website commands pass one guard", () => {
  waitsOn(anOpenStore, "WS61 WS335: an item ID longer than any catalogue or custom emoji ID is rejected before the store and writes nothing", async () => {
    await storeShipped();
    const { me } = await aMemberWithTheStoreOpen(100);
    const before = await everythingWritten();

    await expect(buyItem(me, `custom:${"x".repeat(200)}`)).rejects.toThrow(/item/);
    expect(await everythingWritten()).toEqual(before);
  });

  for (const request of ["", "not-a-uuid", "website:someone:else", `${firstRequest}x`]) {
    waitsOn(anOpenStore, `WS335: an item purchase's request that isn't a UUID (${JSON.stringify(request)}) is rejected and writes nothing`, async () => {
      await storeShipped();
      const { me } = await aMemberWithTheStoreOpen(100);
      const before = await everythingWritten();

      await expect(buyItem(me, shipit, request)).rejects.toThrow(/request/);
      expect(await everythingWritten()).toEqual(before);
    });
  }

  describe("WS61 WS335 WS341: an item purchase's denial answers as a read does and writes nothing at all", () => {
    waitsOn(buying, "with the website flag off, a purchase in an open store answers closed", async () => {
      await storeShipped();
      await aMemberWithTheStoreOpen(100);
      const asSignedIn = await aSession(juno);
      // Today's switchWebsite(t, postHog, false, ...storeFlags): the website off, the store's flags on.
      await definitionsStored(t.operations, offForEveryone("website"), ...storeFlags.map(onForEveryone));
      await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
      const before = await everythingWritten();

      expect(await asSignedIn.command("website.commands.buyItem", { item: shipit, request: firstRequest })).toEqual({ kind: "closed" });
      expect(await everythingWritten()).toEqual(before);
    });

    waitsOn(["S6", "S15"], "without a session, the purchase answers signed-out", async () => {
      await storeShipped();
      const before = await everythingWritten();

      expect(await websiteAs(t, null).command("website.commands.buyItem", { item: shipit, request: firstRequest })).toEqual({ kind: "signed-out" });
      expect(await everythingWritten()).toEqual(before);
    });

    waitsOn(["S3", ...buying], "a member who left the workspace with an open store answers not-a-member", async () => {
      await storeShipped();
      await aMemberWithTheStoreOpen(100);
      const asSignedIn = await aSession(juno);
      await memberChanged(t, "user_change", { id: juno.user, team_id: allowedWorkspace, deleted: true });
      const before = await everythingWritten();

      expect(await asSignedIn.command("website.commands.buyItem", { item: shipit, request: firstRequest })).toEqual({ kind: "not-a-member" });
      expect(await everythingWritten()).toEqual(before);
    });
  });

  waitsOn(anOpenStore, "WS61 WS335: the item and the request are the only arguments, so no call names a member", async () => {
    await storeShipped();
    const { member } = await aMemberWithTheStoreOpen(100);
    const asSignedIn = await aSession(juno);
    const before = await everythingWritten();

    await expect(asSignedIn.command("website.commands.buyItem", { item: shipit, request: firstRequest, member })).rejects.toThrow(argumentsRefused);
    expect(await everythingWritten()).toEqual(before);
  });
});

describe("a website command never launches unlocks", () => {
  waitsOn(atTheGate, "WS62 WS335 P77: with the store's flags on, Coins open and no unlocks launch recorded, an item purchase answers refused and launches nothing", async () => {
    await storeShipped();
    const { me } = await aMemberWithTheStoreOpen(100);
    for (const launch of await t.seed.all("unlockLaunches")) await t.seed.delete("unlockLaunches", launch._id);
    const before = await everythingWritten();
    const from = await publishedSoFar();

    expect(await buyItem(me)).toEqual({ kind: "refused", reason: null });
    expect(await everythingWritten()).toEqual(before);
    expect(before.unlockLaunches).toEqual([]);
    expect(await eventsSince(from)).toEqual([]);
  });

  waitsOn(atTheGate, "WS62 WS335: with achievements on, an open store and no Book launch, an item purchase answers refused and doesn't launch the Book", async () => {
    await storeShipped();
    const { member, me } = await aMemberWithTheStoreOpen(100);
    await flagsOn(...storeFlags, "achievements");
    const before = await everythingWritten();
    const from = await publishedSoFar();

    expect(await buyItem(me)).toEqual({ kind: "refused", reason: null });
    expect(await everythingWritten()).toEqual(before);
    expect(before.bookLaunches).toEqual([]);
    expect(await collectionOf(member)).toEqual([]);
    expect(await eventsSince(from)).toEqual([]);
  });
});

describe("a website command is a D17 command", { timeout: 30_000 }, () => {
  waitsOn(buying, "WS341 ST13: an item on sale is bought for its coins, and App Home's republish is scheduled", async () => {
    await storeShipped();
    const { member, me } = await aMemberWithTheStoreOpen(130);
    const republishedBefore = await homeRepublishesFor(juno.user);
    const from = await publishedSoFar();

    expect(await buyItem(me)).toEqual({ kind: "bought", item: shipit });

    expect(await collectionOf(member)).toEqual([{ item: shipit, source: "store" }]);
    expect(await coinsOf(member)).toBe(30);
    expect(await eventsSince(from)).toEqual([{ type: "itemBought", workspace: allowedWorkspace, member, item: shipit, price: 100, at: now.getTime() }]);
    expect(await homeRepublishesFor(juno.user)).toHaveLength(republishedBefore.length + 1);
  });

  waitsOn(buying, "WS335 ST14: the item purchase is stored under the key website:{member}:{request}", async () => {
    await storeShipped();
    const { member, me } = await aMemberWithTheStoreOpen(100);

    await buyItem(me);

    const stored = await t.seed.all("itemPurchases");
    expect(stored).toMatchObject([{ member, key: `website:${member}:${firstRequest}`, outcome: { kind: "bought", item: shipit } }]);
  });

  waitsOn(buying, "WS335: App Home's republished Inventory tab no longer offers the bought item", async () => {
    await storeShipped();
    const { me } = await aMemberWithTheStoreOpen(100);
    await homeClick("Ev_TAB", { type: "showHomeTab", tab: "inventory" });
    await t.settle();
    expect(buyButtonsInHome()).toContain(shipit);
    const publishedBefore = t.slack.callsTo("views.publish").length;

    await buyItem(me);
    await t.settle();

    expect(t.slack.callsTo("views.publish").length).toBeGreaterThan(publishedBefore);
    expect(buyButtonsInHome()).not.toContain(shipit);
  });

  waitsOn(buying, "WS341 ST13: with too few coins, an item is refused with the reason no-coins, storing only the refusal", async () => {
    await storeShipped();
    const { me } = await aMemberWithTheStoreOpen(60);
    const before = await everythingWritten();
    const from = await publishedSoFar();

    expect(await buyItem(me)).toEqual({ kind: "refused", reason: "no-coins" });

    await expectOnlyTheRefusalStored(before, await everythingWritten(), from, { kind: "refused", item: shipit, reason: "no-coins" });
  });

  waitsOn(buying, "WS341 ST13: an owned item is refused with the reason owned, storing only the refusal", async () => {
    await storeShipped();
    const { me } = await aMemberWithTheStoreOpen(250);
    await buyItem(me, shipit, secondRequest);
    const before = await everythingWritten();
    const from = await publishedSoFar();

    expect(await buyItem(me)).toEqual({ kind: "refused", reason: "owned" });

    await expectOnlyTheRefusalStored(before, await everythingWritten(), from, { kind: "refused", item: shipit, reason: "owned" });
  });

  for (const [what, item] of [
    ["the starter", "kudos-emoji-hedgehog"],
    ["a silver tier's emoji", "kudos-emoji-ribbon"],
    ["an unknown ID", "kudos-emoji-unicorn"],
  ] as const) {
    waitsOn(buying, `WS341 ST13: ${what} is refused with the reason not-for-sale, storing only the refusal`, async () => {
      await storeShipped();
      const { member, me } = await aMemberWithTheStoreOpen(100);
      await t.run((ctx) => grantItem(ctx, { member, item: "kudos-emoji-ribbon", source: "tier", arrivedAt: now.getTime() }));
      const before = await everythingWritten();
      const from = await publishedSoFar();

      expect(await buyItem(me, item)).toEqual({ kind: "refused", reason: "not-for-sale" });

      await expectOnlyTheRefusalStored(before, await everythingWritten(), from, { kind: "refused", item, reason: "not-for-sale" });
    });
  }

  type GateRefusal = { condition: string; arrange: () => Promise<{ me: VerifiedMember }> };

  const refusedByTheGate: GateRefusal[] = [
    { condition: "Coins not opened yet", arrange: async () => (await storeShipped(), aMemberAtLevelSix()) },
    { condition: "an open store with the store flag switched off", arrange: async () => (await storeShipped(), await aMemberWithTheStoreOpen(100).then(async (signedIn) => (await flagsOn("xp-levels", "unlocks", "coins"), signedIn))) },
    { condition: "an open store with the coins flag switched off", arrange: async () => (await storeShipped(), await aMemberWithTheStoreOpen(100).then(async (signedIn) => (await flagsOn("xp-levels", "unlocks", "store"), signedIn))) },
  ];

  for (const { condition, arrange } of refusedByTheGate) {
    waitsOn(atTheGate, `WS335 WS341: ${condition} answers refused with no reason before any command and writes nothing at all`, async () => {
      const { me } = await arrange();
      const before = await everythingWritten();
      const from = await publishedSoFar();

      expect(await buyItem(me)).toEqual({ kind: "refused", reason: null });

      expect(await everythingWritten()).toEqual(before);
      expect(await eventsSince(from)).toEqual([]);
    });
  }

  waitsOn(buying, "WS335: a refusal at the store's gate stores nothing, so the same request buys once the gate opens", async () => {
    await storeShipped();
    const { member, me } = await aMemberWithTheStoreOpen(100);
    await flagsOn("xp-levels", "unlocks", "coins");
    expect(await buyItem(me)).toEqual({ kind: "refused", reason: null });

    await flagsOn(...storeFlags);

    expect(await buyItem(me)).toEqual({ kind: "bought", item: shipit });
    expect(await collectionOf(member)).toEqual([{ item: shipit, source: "store" }]);
  });

  waitsOn(buying, "WS335 ST14: a stored no-coins refusal replays after more coins arrive, and a fresh request buys", async () => {
    await storeShipped();
    const { member, me } = await aMemberWithTheStoreOpen(60);
    expect(await buyItem(me)).toEqual({ kind: "refused", reason: "no-coins" });

    await earns(member, 100);

    expect(await buyItem(me)).toEqual({ kind: "refused", reason: "no-coins" });
    expect(await buyItem(me, shipit, secondRequest)).toEqual({ kind: "bought", item: shipit });
  });

  waitsOn(buying, "WS335 WS64: buying an item on the website leaves the domain tables and events App Home's Buy leaves, besides Slack's receipt", async () => {
    // Slack's side first, then the website's in the emptied tables: today's two backends.
    const slackSide = await anOpenStore130();
    await homeClick("Ev_BUY", { type: "buyItem", item: shipit });
    const fromSlack = { tables: await everyTableOfToday(), events: await eventsSince(0) };
    await emptied();

    const websiteSide = await anOpenStore130();
    expect(await buyItem(websiteSide.me)).toEqual({ kind: "bought", item: shipit });
    const fromWebsite = { tables: await everyTableOfToday(), events: await eventsSince(0) };

    expect(comparable(fromWebsite, websiteSide.member)).toEqual(comparable(fromSlack, slackSide.member));
    expect(fromWebsite.events.filter(({ type }) => type === "itemBought")).toHaveLength(1);
    expect(fromWebsite.tables.collection).toHaveLength(1);
  });
});

describe("a coin spent on the website for an item is spent once", { timeout: 30_000 }, () => {
  waitsOn(buying, "WS335 ST14: the same request twice buys once, answers bought twice and spends its coins once", async () => {
    await storeShipped();
    const { member, me } = await aMemberWithTheStoreOpen(250);
    const from = await publishedSoFar();

    expect(await buyItem(me)).toEqual({ kind: "bought", item: shipit });
    t.time.advance(60_000);
    expect(await buyItem(me)).toEqual({ kind: "bought", item: shipit });

    expect(await collectionOf(member)).toEqual([{ item: shipit, source: "store" }]);
    expect(await coinsOf(member)).toBe(150);
    expect((await eventsSince(from)).filter(({ type }) => type === "itemBought")).toHaveLength(1);
  });

  waitsOn(buying, "WS335: two requests for two items with coins for one buy one", async () => {
    await storeShipped();
    const { member, me } = await aMemberWithTheStoreOpen(150);

    const answers = [await buyItem(me, shipit, firstRequest), await buyItem(me, partyparrot, secondRequest)];

    expect(answers).toEqual([
      { kind: "bought", item: shipit },
      { kind: "refused", reason: "no-coins" },
    ]);
    expect(await collectionOf(member)).toEqual([{ item: shipit, source: "store" }]);
    expect(await coinsOf(member)).toBe(50);
  });

  waitsOn(buying, "WS335: a website request never replays a Slack Buy whose event carries the same string", async () => {
    await storeShipped();
    const { member, me } = await aMemberWithTheStoreOpen(250);
    await homeClick(firstRequest, { type: "buyItem", item: partyparrot });

    expect(await buyItem(me)).toEqual({ kind: "bought", item: shipit });
    expect((await collectionOf(member)).map(({ item }) => item).sort()).toEqual([partyparrot, shipit]);
  });
});

// Today's `anOpenStoreIn(backend)`: a shipped store and a member at level six with it open and 130 coins.
async function anOpenStore130() {
  await storeShipped();
  return aMemberWithTheStoreOpen(130);
}

function comparable({ tables, events }: { tables: Record<string, Row[]>; events: unknown[] }, member: MemberId) {
  const domain = { ...tables, slackReceipts: [], analyticsOutbox: [], analyticsDrain: [], itemPurchases: (tables.itemPurchases ?? []).map((row) => ({ ...row, key: "<key>" })) };
  return normalised({ domain, events }, member);
}

const generatedKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function normalised(value: unknown, member: MemberId): unknown {
  if (value === member) return "<member>";
  if (typeof value === "string" && generatedKey.test(value)) return "<generated key>";
  if (Array.isArray(value)) return value.map((item) => normalised(item, member));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "_id" && key !== "_creationTime")
      .map(([key, field]) => [key, normalised(field, member)]),
  );
}
