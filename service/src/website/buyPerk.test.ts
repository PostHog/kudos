// Buying a perk on the website: today's convex/website/buyPerk.test.ts, on the service's test backend. Each purchase runs
// storeCommands.ts's `buyPerk` for a `me` made from the seeded directory row and a `person` the directory answers, as
// S15's member check answers them. The purchases whose subject is the member check or the route's arguments (closed,
// signed out, not a member, a call naming a member) call buyPerk by its route name through the whole app, signed in
// through SSO or not at all, so the app's own identity mapping and member check (S15) answer them.
// Today's mocked `publish` is the events committed operations published, today's scheduled functions are the jobs
// table's rows, and today's second backend is the same one emptied.
import { asc, getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, vi, test } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone, onForPercent } from "../../testing/flags.ts";
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
import { treePerksOf } from "../progression/perks.ts";
import { recordReward } from "../progression/progression.ts";
import type { PerkId } from "../progression/tree.ts";
import { memberChanged } from "../slack/hugsTesting.ts";
import { receiveHomeClick } from "../slack/receipts.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import { balanceOf } from "../wallet/wallet.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";
import { getSkillTree } from "./skillTree.ts";
import { buyPerk as buyPerkCommand } from "./storeCommands.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const treeFlags = ["xp-levels", "unlocks", "skill-tree"];
const levelFive = 600;
const levelSix = 1000;
const levelSeven = 1500;
const firstRequest = "0d6f2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f";
const secondRequest = "7b9e4f3a-2c1d-4e5f-8a9b-0c1d2e3f4a5b";

// An open tree: unlocks shipped, a level reached and the Skill tree opened (S6), with the level's hoggies (S10).
const openTree: [Stack, ...Stack[]] = ["S6", "S10"];
// A purchase through the whole app, past S15's identity mapping and member check, with an open tree (S6, S10).
const buyPerkGuard: [Stack, ...Stack[]] = ["S6", "S10", "S15"];
// The purchase's gate: the unlock path (S16, over S6's unlocks) and the launch guard (S15).
const theGate: [Stack, ...Stack[]] = ["S6", "S15", "S16"];
const anOpenTreesGate: [Stack, ...Stack[]] = ["S6", "S10", "S15", "S16"];
// A purchase past the gate: the command runner (S4), progression's perks and points (S6), the wallet (S7) and App
// Home's republish (S5), on an open tree.
const aPurchase: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S10", "S15", "S16"];
// A purchase beside Slack's App Home: its receipt (S5) and the tab it renders (S17).
const besideAppHome: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S10", "S15", "S16"];

type Row = Record<string, unknown>;
type Written = { tables: Record<string, Row[]>; scheduled: Row[]; own: Record<string, Row[]> };

const backend = useTestBackend({ now: now.getTime(), workspace: allowedWorkspace });

let t: TestBackend;
// Where today's `vi.mocked(publish).mockClear()` left off: the count of events published before it.
let publishedFrom = 0;

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
  publishedFrom = 0;
});

afterEach(() => void vi.unstubAllEnvs());

// Today's `switchWebsite(t, postHog, true, ...keys)`: the website open, these flags on for everyone, and the workspace's key made.
async function flagsOn(...keys: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...keys.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

async function unlocksShippedBeforeAnyoneJoined() {
  await t.run((ctx) => unlocksLiveIn(ctx, allowedWorkspace));
}

async function treeShipped(...alsoOn: string[]) {
  await flagsOn(...treeFlags);
  await unlocksShippedBeforeAnyoneJoined();
  await flagsOn(...treeFlags, ...alsoOn);
}

/** Today's `aMember` and `aSignedInSession`: the directory row, the users row and analytics ID, and the member check's answer. */
async function signedInMember(): Promise<{ member: MemberId; me: VerifiedMember }> {
  const member = (await t.seed.insert("members", { workspace: allowedWorkspace, user: juno.user, kind: "member", asOf: 0 })) as MemberId;
  await t.seed.insert("users", { name: juno.name, chatIdentity: { workspace: allowedWorkspace, user: juno.user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, me: { member, workspace: allowedWorkspace, user: juno.user, name: juno.name } };
}

/** Today's `aSignedInSession`: the person signs in, through SSO here, and the website's requests come as them. */
function aSession(person: { user: string }) {
  return signedInThroughSso(t, person, allowedWorkspace);
}

async function withXp(member: MemberId, xp: number) {
  const progress = (await t.seed.all("memberProgress")).find((row) => row.member === member);
  if (progress === undefined) await t.seed.insert("memberProgress", { member, xp, pointsSpent: 0 });
  else await t.seed.patch("memberProgress", progress._id, { xp });
}

async function aMemberWithTheTreeOpen() {
  const signedIn = await signedInMember();
  await withXp(signedIn.member, levelFive);
  await reachesLevel(signedIn.member, 5);
  await opens(signedIn.member, "skillTree");
  return signedIn;
}

async function aMemberWithTheTreeReady() {
  const signedIn = await signedInMember();
  await withXp(signedIn.member, levelFive);
  await reachesLevel(signedIn.member, 5);
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

function skillTree(me: VerifiedMember) {
  return t.query((ctx) => getSkillTree(ctx, me));
}

// Today's `anIdInHalfOf`: an ID PostHog's rollout hash puts inside, or outside, half of the flag.
async function anIdInHalfOf(flag: string, inside: boolean) {
  for (let attempt = 0; ; attempt++) {
    const id = `id-${inside ? "in" : "out"}-${attempt}`;
    if ((await rolloutHashOf(flag, id)) <= 0.5 === inside) return id;
  }
}

async function rolloutHashOf(flag: string, distinctId: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${flag}.${distinctId}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return parseInt(hex.slice(0, 15), 16) / 0xfffffffffffffff;
}

async function unlocksOnForTheWorkspaceAndOffFor(member: MemberId) {
  const workspaceKey = await anIdInHalfOf("unlocks", true);
  const analyticsId = await anIdInHalfOf("unlocks", false);
  for (const row of await t.seed.all("workspaceKeys")) await t.seed.patch("workspaceKeys", row._id, { workspaceKey });
  for (const row of await t.seed.all("analyticsIds")) if (row.member === member) await t.seed.patch("analyticsIds", row._id, { analyticsId });
  await definitionsStored(t.operations, onForPercent("unlocks", 50), ...["website", "xp-levels", "skill-tree"].map(onForEveryone));
}

/** Runs the purchase as the website's route does: the member check's `me`, and the directory's facts of them. */
function buyPerk(me: VerifiedMember, perk: PerkId = "spark", request = firstRequest) {
  return t.run(async (ctx) => buyPerkCommand(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, { perk, request }));
}

const everyTable = (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).sort((a, b) => getTableName(a).localeCompare(getTableName(b)));
// The service's own tables: none of them is one of today's `schema.tables`.
const servicesOwn = new Set((Object.values({ ...serviceTables, ...loadTables }) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).map(getTableName));
// The job that records each published event for `t.published()`: today's mocked `publish`, not a scheduled function.
const recorderJob = "testing.published";

/** Every table's rows, each in an explicit order: today's tables, today's scheduled functions (the jobs), and the rest of the service's own. */
async function everythingWritten(): Promise<Written> {
  const rows = await t.query(async ({ tx }) => {
    const all: Record<string, Row[]> = {};
    for (const table of everyTable) {
      const columns = getTableColumns(table);
      const order = columns._creationTime && columns._id ? [columns._creationTime, columns._id] : Object.values(columns);
      all[getTableName(table)] = (await tx.select().from(table).orderBy(...order.map((column) => asc(column)))).map((row) => (servicesOwn.has(getTableName(table)) ? row : toDocument<Row>(table, row)));
    }
    return all;
  });
  const tables = Object.fromEntries(Object.entries(rows).filter(([table]) => !servicesOwn.has(table)));
  const own = Object.fromEntries(Object.entries(rows).filter(([table]) => servicesOwn.has(table) && table !== getTableName(jobs)));
  const scheduled = (rows[getTableName(jobs)] ?? []).filter(({ name }) => name !== recorderJob);
  return { tables, scheduled, own };
}

/** Empties every table, so one test runs today's two backends one after the other. */
async function emptied() {
  await t.run(async ({ tx }) => void (await tx.execute(sql.raw(`truncate ${everyTable.map((table) => `"${getTableName(table)}"`).join(", ")}`))));
  publishedFrom = 0;
}

/** Today's `vi.mocked(publish).mockClear()`: the events published from here on are the ones `publishedEvents` answers. */
async function publishedCleared() {
  publishedFrom = (await t.published()).length;
}

/** The events published since the last clear, as today's mocked `publish` saw them: without the fact the bus adds. */
async function publishedEvents(): Promise<Row[]> {
  return (await t.published()).slice(publishedFrom).map(({ fact: _, ...event }) => event);
}

function newScheduledFunctions(before: Row[], after: Row[]) {
  const earlier = new Set(before.map(({ _id }) => _id));
  return after.filter(({ _id }) => !earlier.has(_id));
}

async function homeRepublishesFor(user: string) {
  return (await everythingWritten()).scheduled.filter(({ name, args }) => name === "slack.appHome.publishHome" && (decodeStored(args as string) as { user?: string }).user === user);
}

// Today's read by_member_perk: the member's perks in the perk's order.
async function perksOwnedBy(member: MemberId) {
  return (await t.seed.all("perksOwned")).filter((row) => row.member === member).sort((a, b) => a.perk.localeCompare(b.perk) || a._creationTime - b._creationTime);
}

async function skillPointsOf(member: MemberId) {
  return (await t.query((ctx) => treePerksOf(ctx, member)))?.skillPoints;
}

const exposureTables = ["flagExposures", "analyticsIds", "analyticsOutbox", "analyticsDrain"] as const;

function withoutExposures(tables: Record<string, Row[]>) {
  return { ...tables, ...Object.fromEntries(exposureTables.map((table) => [table, []])) };
}

describe("website commands pass one guard", () => {
  for (const request of ["", "not-a-uuid", "website:someone:else", `${firstRequest}x`]) {
    waitsOn(openTree, `WS88: a request that isn't a UUID (${JSON.stringify(request)}) is rejected and writes nothing`, async () => {
      await treeShipped();
      const { me } = await aMemberWithTheTreeOpen();
      const before = await everythingWritten();

      await expect(buyPerk(me, "spark", request)).rejects.toThrow(/request/);
      expect(await everythingWritten()).toEqual(before);
    });
  }

  describe("WS61 WS88: a purchase's denial answers as a read does and writes nothing at all", () => {
    waitsOn(buyPerkGuard, "with the website flag off, an open tree's purchase answers closed", async () => {
      await treeShipped();
      await aMemberWithTheTreeOpen();
      const asSignedIn = await aSession(juno);
      // Today's switchWebsite(t, postHog, false, ...treeFlags): the website off, the tree's flags on, the workspace's key made.
      await definitionsStored(t.operations, offForEveryone("website"), ...treeFlags.map(onForEveryone));
      await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
      const before = await everythingWritten();

      expect(await asSignedIn.command("website.commands.buyPerk", { perk: "spark", request: firstRequest })).toEqual({ kind: "closed" });
      expect(await everythingWritten()).toEqual(before);
    });

    test("with a flags key but no workspace key yet, the purchase answers closed and makes no key", async () => {
      await definitionsStored(t.operations, { key: "website", filters: { groups: [{ properties: [], rollout_percentage: 100 }] } });
      await t.seed.insert("members", { workspace: allowedWorkspace, user: juno.user, kind: "member", asOf: 0 });
      const asSignedIn = await aSession(juno);
      const before = await everythingWritten();

      expect(await asSignedIn.command("website.commands.buyPerk", { perk: "spark", request: firstRequest })).toEqual({ kind: "closed" });
      expect(await everythingWritten()).toEqual(before);
      expect(before.tables.workspaceKeys).toEqual([]);
    });

    waitsOn(["S6", "S15"], "without a session, the purchase answers signed-out", async () => {
      await treeShipped();
      const before = await everythingWritten();

      expect(await websiteAs(t, null).command("website.commands.buyPerk", { perk: "spark", request: firstRequest })).toEqual({ kind: "signed-out" });
      expect(await everythingWritten()).toEqual(before);
    });

    waitsOn(["S3", ...buyPerkGuard], "a member who left the workspace with an open tree answers not-a-member", async () => {
      await treeShipped();
      await aMemberWithTheTreeOpen();
      const asSignedIn = await aSession(juno);
      await memberChanged(t, "user_change", { id: juno.user, team_id: allowedWorkspace, deleted: true });
      const before = await everythingWritten();

      expect(await asSignedIn.command("website.commands.buyPerk", { perk: "spark", request: firstRequest })).toEqual({ kind: "not-a-member" });
      expect(await everythingWritten()).toEqual(before);
    });
  });

  waitsOn(openTree, "WS61 WS88: the perk and the request are the only arguments, so no call names a member", async () => {
    await treeShipped();
    const { member } = await aMemberWithTheTreeOpen();
    const asSignedIn = await aSession(juno);
    const before = await everythingWritten();

    await expect(asSignedIn.command("website.commands.buyPerk", { perk: "spark", request: firstRequest, member })).rejects.toThrow(argumentsRefused);
    expect(await everythingWritten()).toEqual(before);
  });
});

describe("a website command never launches unlocks", () => {
  waitsOn(theGate, "WS62 WS88 P77: with xp-levels, unlocks and skill-tree on and no launch recorded, the purchase answers refused and launches nothing", async () => {
    await flagsOn(...treeFlags);
    const { me } = await signedInMember();
    const before = await everythingWritten();
    await publishedCleared();

    expect(await buyPerk(me)).toEqual({ kind: "refused", reason: null });
    expect(await everythingWritten()).toEqual(before);
    expect(before.tables.unlockLaunches).toEqual([]);
    expect(await publishedEvents()).toEqual([]);
  });

  waitsOn(anOpenTreesGate, "WS62 WS88: with achievements on, an open tree and no Book launch, the purchase answers refused and doesn't launch the Book", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();
    await flagsOn(...treeFlags, "achievements");
    const before = await everythingWritten();
    await publishedCleared();

    expect(await buyPerk(me)).toEqual({ kind: "refused", reason: null });
    expect(await everythingWritten()).toEqual(before);
    expect(before.tables.bookLaunches).toEqual([]);
    expect(await perksOwnedBy(member)).toEqual([]);
    expect(await publishedEvents()).toEqual([]);
  });
});

describe("a website command is a D17 command", () => {
  waitsOn(aPurchase, "WS88: an available perk is bought for its skill point, and App Home's republish is scheduled", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();
    const republishedBefore = await homeRepublishesFor(juno.user);
    await publishedCleared();

    expect(await buyPerk(me)).toEqual({ kind: "bought" });

    expect(await perksOwnedBy(member)).toMatchObject([{ perk: "spark", boughtAt: now.getTime() }]);
    expect(await skillPointsOf(member)).toBe(0);
    expect(await publishedEvents()).toEqual([{ type: "perkBought", workspace: "T1", member, perk: "spark", at: now.getTime() }]);
    expect(await homeRepublishesFor(juno.user)).toHaveLength(republishedBefore.length + 1);
  });

  waitsOn(aPurchase, "WS88: the purchase is stored under the key website:{member}:{request}", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();

    await buyPerk(me);

    const stored = await t.seed.all("perkPurchases");
    expect(stored).toMatchObject([{ member, key: `website:${member}:${firstRequest}`, outcome: { kind: "bought", perk: "spark" } }]);
  });

  waitsOn(besideAppHome, "WS88: App Home's republished Skill tree tab shows the perk owned", async () => {
    await treeShipped();
    const { me } = await aMemberWithTheTreeOpen();
    await t.run((ctx) => receiveHomeClick(ctx, { workspace: "T1", eventId: "Ev_TAB", user: juno.user, commands: [{ type: "showHomeTab", tab: "skillTree" }] }));
    await t.settle();
    expect(buyButtonsInHome()).toContain("spark");
    const publishedBefore = t.slack.callsTo("views.publish").length;

    await buyPerk(me);
    await t.settle();

    expect(t.slack.callsTo("views.publish").length).toBeGreaterThan(publishedBefore);
    expect(buyButtonsInHome()).not.toContain("spark");
    expect(publishedHomeBlocks(juno.user).map((block) => JSON.stringify(block)).join("\n")).toMatch(/Spark/);
  });

  waitsOn(aPurchase, "WS88: an owned perk is refused with the reason owned, storing only the refusal", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();
    await withXp(member, levelSix);
    await reachesLevel(member, 6);
    await buyPerk(me, "spark", secondRequest);
    const before = await everythingWritten();
    await publishedCleared();

    expect(await buyPerk(me)).toEqual({ kind: "refused", reason: "owned" });

    await expectOnlyTheRefusalStored(before, await everythingWritten(), { kind: "refused", perk: "spark", reason: "owned" });
  });

  waitsOn(aPurchase, "WS88: with no skill points left, a perk is refused with the reason points, storing only the refusal", async () => {
    await treeShipped();
    const { me } = await aMemberWithTheTreeOpen();
    await buyPerk(me, "spark", secondRequest);
    const before = await everythingWritten();
    await publishedCleared();

    expect(await buyPerk(me, "rhythm")).toEqual({ kind: "refused", reason: "points" });

    await expectOnlyTheRefusalStored(before, await everythingWritten(), { kind: "refused", perk: "rhythm", reason: "no-skill-points" });
  });

  type GateRefusal = { condition: string; arrange: () => Promise<{ me: VerifiedMember }> };

  const refusedByTheGate: GateRefusal[] = [
    { condition: "a ready Skill tree the member hasn't opened", arrange: async () => (await treeShipped(), aMemberWithTheTreeReady()) },
    { condition: "a Skill tree still locked at level 1", arrange: async () => (await treeShipped(), signedInMember()) },
    { condition: "an open tree with skill-tree switched off", arrange: async () => (await treeShipped(), await aMemberWithTheTreeOpen().then(async (signedIn) => (await flagsOn("xp-levels", "unlocks"), signedIn))) },
    { condition: "an open tree with unlocks switched off", arrange: async () => (await treeShipped(), await aMemberWithTheTreeOpen().then(async (signedIn) => (await flagsOn("xp-levels", "skill-tree"), signedIn))) },
    { condition: "an open tree with xp-levels switched off", arrange: async () => (await treeShipped(), await aMemberWithTheTreeOpen().then(async (signedIn) => (await flagsOn("unlocks", "skill-tree"), signedIn))) },
  ];

  for (const { condition, arrange } of refusedByTheGate) {
    waitsOn(anOpenTreesGate, `WS88: ${condition} answers refused with no reason before any command and writes nothing at all`, async () => {
      const { me } = await arrange();
      const before = await everythingWritten();
      await publishedCleared();

      expect(await buyPerk(me)).toEqual({ kind: "refused", reason: null });

      expect(await everythingWritten()).toEqual(before);
      expect(await publishedEvents()).toEqual([]);
    });
  }

  waitsOn(aPurchase, "WS88: a refusal at the gate stores nothing, so the same request buys once the gate opens", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();
    await flagsOn("xp-levels", "unlocks");
    expect(await buyPerk(me)).toEqual({ kind: "refused", reason: null });

    await flagsOn(...treeFlags);

    expect(await buyPerk(me)).toEqual({ kind: "bought" });
    expect(await perksOwnedBy(member)).toMatchObject([{ perk: "spark" }]);
  });

  waitsOn(aPurchase, "WS88 P19: a stored refusal replays with its reason after a level up, and a fresh request buys", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();
    await buyPerk(me, "spark", secondRequest);
    expect(await buyPerk(me, "rhythm")).toEqual({ kind: "refused", reason: "points" });

    await withXp(member, levelSix);
    await reachesLevel(member, 6);

    expect(await buyPerk(me, "rhythm")).toEqual({ kind: "refused", reason: "points" });
    expect(await buyPerk(me, "rhythm", "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f")).toEqual({ kind: "bought" });
  });

  waitsOn(besideAppHome, "WS89 WS64: buying on the website leaves the domain tables and events App Home's Buy leaves, besides Slack's receipt", async () => {
    // Slack's side first, then the website's in the emptied tables: today's two backends.
    const slackSide = await anOpenTree();
    await t.run((ctx) =>
      receiveHomeClick(ctx, {
        workspace: "T1",
        eventId: "Ev_BUY",
        user: juno.user,
        commands: [{ type: "buyPerk", perk: "spark" }],
      }),
    );
    const fromSlack = { tables: (await everythingWritten()).tables, events: await publishedEvents() };
    await emptied();

    const websiteSide = await anOpenTree();
    expect(await buyPerk(websiteSide.me)).toEqual({ kind: "bought" });
    const fromWebsite = { tables: (await everythingWritten()).tables, events: await publishedEvents() };

    expect(comparable(fromWebsite, websiteSide.member)).toEqual(comparable(fromSlack, slackSide.member));
    expect(fromWebsite.events.filter(({ type }) => type === "perkBought")).toHaveLength(1);
    expect(fromWebsite.tables.perksOwned).toHaveLength(1);
  });
});

describe("a skill point bought on the website is spent once", () => {
  waitsOn(aPurchase, "WS87 WS88 P19: the same request twice buys once and answers bought twice", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();
    await withXp(member, levelSix);
    await reachesLevel(member, 6);
    expect(await skillPointsOf(member)).toBe(2);
    await publishedCleared();

    expect(await buyPerk(me)).toEqual({ kind: "bought" });
    t.time.advance(60_000);
    expect(await buyPerk(me)).toEqual({ kind: "bought" });

    expect(await perksOwnedBy(member)).toMatchObject([{ perk: "spark", boughtAt: now.getTime() }]);
    expect(await skillPointsOf(member)).toBe(1);
    expect((await publishedEvents()).filter(({ type }) => type === "perkBought")).toHaveLength(1);
  });

  waitsOn(aPurchase, "WS88: two requests for two perks with one skill point buy one", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();

    const answers = [await buyPerk(me, "spark", firstRequest), await buyPerk(me, "rhythm", secondRequest)];

    expect(answers).toEqual([{ kind: "bought" }, { kind: "refused", reason: "points" }]);
    expect(await perksOwnedBy(member)).toMatchObject([{ perk: "spark" }]);
    expect(await skillPointsOf(member)).toBe(0);
  });

  waitsOn(besideAppHome, "WS88: a website request never replays a Slack Buy whose event carries the same string", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();
    await withXp(member, levelSix);
    await reachesLevel(member, 6);
    await t.run((ctx) => receiveHomeClick(ctx, { workspace: "T1", eventId: firstRequest, user: juno.user, commands: [{ type: "buyPerk", perk: "spark" }] }));

    expect(await buyPerk(me, "rhythm")).toEqual({ kind: "bought" });
    expect((await perksOwnedBy(member)).map(({ perk }) => perk).sort()).toEqual(["rhythm", "spark"]);
  });
});

describe("CO14 CO24: a coin perk bought from the website", () => {
  waitsOn(aPurchase, "WS345 CO14: with coins shown and Coins not opened yet, a request for flame is refused with the reason coins-not-open, storing only the refusal and spending nothing", async () => {
    await treeShipped("coins");
    const { member, me } = await aMemberWithTheTreeOpen();
    await withXp(member, levelSeven);
    await reachesLevel(member, 7);
    expect(await buyPerk(me, "spark")).toEqual({ kind: "bought" });
    await publishedCleared();
    const before = await everythingWritten();

    expect(await buyPerk(me, "flame", secondRequest)).toEqual({ kind: "refused", reason: "coins-not-open" });
    await expectOnlyTheRefusalStored(before, await everythingWritten(), { kind: "refused", perk: "flame", reason: "coins-not-open" });
  }, 30_000);

  waitsOn(aPurchase, "WS345 CO24: with Coins open and too few coins, a request for flame is refused with the reason coins, storing only the refusal", async () => {
    await treeShipped("coins");
    const { member, me } = await aMemberWithTheTreeOpen();
    await withXp(member, levelSeven);
    await reachesLevel(member, 7);
    await opens(member, "coins");
    expect(await buyPerk(me, "spark")).toEqual({ kind: "bought" });
    await t.run((ctx) => recordReward(ctx, "T1", { member, key: "test:savings", xp: 0, coins: 149, item: null, catalogueVersion: "2", at: 0 }));
    await publishedCleared();
    const before = await everythingWritten();

    expect(await buyPerk(me, "flame", secondRequest)).toEqual({ kind: "refused", reason: "coins" });
    await expectOnlyTheRefusalStored(before, await everythingWritten(), { kind: "refused", perk: "flame", reason: "no-coins" });
  }, 30_000);
});

describe("CO24 CO30: a purchase spends once per idempotency key", () => {
  waitsOn(aPurchase, "the same website request twice buys flame once, answers bought both times and spends its coins once", async () => {
    await treeShipped("coins");
    const { member, me } = await aMemberWithTheTreeOpen();
    await withXp(member, levelSeven);
    await reachesLevel(member, 7);
    await opens(member, "coins");
    await buyPerk(me, "spark");
    await t.run((ctx) => recordReward(ctx, "T1", { member, key: "test:savings", xp: 0, coins: 300, item: null, catalogueVersion: "2", at: 0 }));

    expect(await buyPerk(me, "flame", secondRequest)).toEqual({ kind: "bought" });
    expect(await buyPerk(me, "flame", secondRequest)).toEqual({ kind: "bought" });

    expect(await t.query((ctx) => balanceOf(ctx, member))).toBe(150);
    expect((await t.seed.all("coinSpends")).map(({ coins, for: paidFor }) => ({ coins, for: paidFor }))).toEqual([{ coins: 150, for: { perk: "flame" } }]);
    expect(await skillPointsOf(member)).toBe(1);
  }, 30_000);
});

type Element = { type?: string; value?: string };
type Block = { type: string; accessory?: Element };

function publishedHomeBlocks(user: string): Block[] {
  const view = t.slack.homeShownTo(user) as { type: string; blocks: Block[] } | undefined;
  expect(view?.type).toBe("home");
  return view?.blocks ?? [];
}

function buyButtonsInHome() {
  return publishedHomeBlocks(juno.user)
    .map((block) => block.accessory?.value)
    .filter((value): value is string => value !== undefined && value.includes("buyPerk"))
    .map((value) => (JSON.parse(value) as { perk: string }).perk);
}

async function expectOnlyTheRefusalStored(before: Written, after: Written, outcome: Row) {
  const unchanged = (tables: Record<string, Row[]>) => withoutExposures({ ...tables, perkPurchases: [], homeSelections: [] });
  expect(unchanged(after.tables)).toEqual(unchanged(before.tables));
  expect(after.tables.perkPurchases!.slice(before.tables.perkPurchases!.length)).toMatchObject([{ outcome }]);
  expect(after.tables.homeSelections!.map(({ tab }) => tab)).toEqual(["skillTree"]);
  expect(newScheduledFunctions(before.scheduled, after.scheduled).filter(({ name }) => !String(name).startsWith("analytics."))).toEqual([]);
  expect(await publishedEvents()).toEqual([]);
}

async function anOpenTree() {
  await flagsOn(...treeFlags);
  await unlocksShippedBeforeAnyoneJoined();
  return aMemberWithTheTreeOpen();
}

function comparable({ tables, events }: { tables: Record<string, Row[]>; events: unknown[] }, member: MemberId) {
  const domain = { ...tables, slackReceipts: [], analyticsOutbox: [], analyticsDrain: [], perkPurchases: tables.perkPurchases!.map((row) => ({ ...row, key: "<key>" })) };
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

describe("F26 F27 F28 F29: a member previews the website by their own decision", () => {
  waitsOn(anOpenTreesGate, "F27: a member whose own unlocks decision is off, while the workspace's is on, reads no Skill tree, and their purchase answers refused with no reason and writes nothing at all", async () => {
    await treeShipped();
    const { member, me } = await aMemberWithTheTreeOpen();
    await unlocksOnForTheWorkspaceAndOffFor(member);
    const before = await everythingWritten();

    expect(await skillTree(me)).toEqual({ kind: "not-found" });
    expect(await buyPerk(me)).toEqual({ kind: "refused", reason: null });
    expect(await everythingWritten()).toEqual(before);
  });
});
