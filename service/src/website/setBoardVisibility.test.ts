// The board visibility switch on the website: today's convex/website/setBoardVisibility.test.ts, on the service's test
// backend. Each switch runs settingsCommands.ts's `setBoardVisibility` for a `me` made from the seeded directory row and
// a `person` the directory answers, as S15's member check answers them. The switches whose subject is the member check
// or the route's arguments (closed, signed out, not a member, a call naming a member) call setBoardVisibility by its
// route name through the whole app, signed in through SSO or not at all, so the app's own identity mapping and member
// check (S15) answer them. Today's mocked `publish` is the events committed operations published, and today's scheduled
// functions are the jobs table's rows.
import { asc, eq, getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { achievementsLiveIn } from "../achievements/flag.ts";
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
import { isOnTheBoards } from "../leaderboard/visibility.ts";
import { memberChanged } from "../slack/hugsTesting.ts";
import { receiveHomeClick } from "../slack/receipts.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";
import { setBoardVisibility as setBoardVisibilityCommand } from "./settingsCommands.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const unlocksFlags = ["everyone-board", "xp-levels", "unlocks"];

// What the switch reaches: the unlock path and the board's state (S16), the launch guard (S15), the command runner (S4),
// the boards (S11), unlocks (S6) and App Home's republish (S5, S17).
const theSwitch: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S11", "S15", "S16", "S17"];
// An open board on the unlock path: unlocks shipped and a level reached (S6) with its level-up hoggies (S10), then the switch.
const onTheUnlockPath: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S10", "S11", "S15", "S16", "S17"];
// The member check through the whole app: S15's identity mapping and member check.
const memberCheck: [Stack, ...Stack[]] = ["S15"];

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

// Today's `switchWebsite`: the website open or closed, these flags on for everyone, and the workspace's key made.
async function switchWebsite(open: boolean, ...alsoOn: string[]) {
  await definitionsStored(t.operations, open ? onForEveryone("website") : offForEveryone("website"), ...alsoOn.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

/** Today's `aMember` and `aSignedInSession`: the directory row, the users row and analytics ID, and the member check's answer. */
async function signedIn() {
  const member = (await t.seed.insert("members", { workspace: allowedWorkspace, user: juno.user, kind: "member", asOf: 0 })) as MemberId;
  await t.seed.insert("users", { name: juno.name, chatIdentity: { workspace: allowedWorkspace, user: juno.user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  const me: VerifiedMember = { member, workspace: allowedWorkspace, user: juno.user, name: juno.name };
  return { member, me };
}

/** Today's `aSignedInSession` for the session alone: the person signs in, through SSO here, and the website's requests come as them. */
function aSession(person: { user: string }) {
  return signedInThroughSso(t, person, allowedWorkspace);
}

async function aBoardWithoutUnlocks() {
  await switchWebsite(true, "everyone-board");
  return signedIn();
}

async function anOpenBoard(...alsoOn: string[]) {
  await switchWebsite(true, ...unlocksFlags);
  await unlocksShippedBeforeAnyoneJoined();
  const team = await signedIn();
  await reachesLevel(team.member, 3);
  await opens(team.member, "leaderboard");
  await switchWebsite(true, ...unlocksFlags, ...alsoOn);
  return team;
}

async function aBoardAtLevel(level: number) {
  await switchWebsite(true, ...unlocksFlags);
  await unlocksShippedBeforeAnyoneJoined();
  const team = await signedIn();
  await reachesLevel(team.member, level);
  return team;
}

async function unlocksShippedBeforeAnyoneJoined() {
  await t.run((ctx) => unlocksLiveIn(ctx, allowedWorkspace));
}

async function bookShippedBeforeAnyoneJoined() {
  await unlocksShippedBeforeAnyoneJoined();
  await t.run((ctx) => achievementsLiveIn(ctx, allowedWorkspace));
  await t.settle();
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

/** Runs the switch as the website's route does: the member check's `me`, and the directory's facts of them. */
function setBoardVisibility(me: VerifiedMember, visible: boolean) {
  return t.run(async (ctx) => setBoardVisibilityCommand(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, { visible }));
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

/** The events published since `from`, as today's mocked `publish` saw them: without the fact the bus adds. */
async function eventsSince(from: number) {
  return (await t.published()).slice(from).map(({ fact: _, ...event }) => event);
}

async function scheduledNamed(name: string) {
  const rows = await t.query(({ tx }) => tx.select({ args: jobs.args }).from(jobs).where(eq(jobs.name, name)).orderBy(asc(jobs._creationTime), asc(jobs._id)));
  return rows.map(({ args }) => decodeStored(args) as Row);
}

async function homeRepublishesFor(user: string) {
  return (await scheduledNamed("slack.appHome.publishHome")).filter((args) => args.user === user);
}

function visibilityChangesRecorded() {
  return scheduledNamed("analytics.isolatedUsage.recordLeaderboardVisibilityChanged");
}

function onTheBoards(member: MemberId) {
  return t.query((ctx) => isOnTheBoards(ctx, member));
}

describe("website commands pass one guard", () => {
  describe("WS61: a denial answers as a read does and writes nothing at all", () => {
    waitsOn(memberCheck, "with the website flag off, the switch answers closed", async () => {
      await aBoardWithoutUnlocks();
      const asSignedIn = await aSession(juno);
      await switchWebsite(false, "everyone-board");
      const before = await everythingWritten();

      expect(await asSignedIn.command("website.commands.setBoardVisibility", { visible: false })).toEqual({ kind: "closed" });
      expect(await everythingWritten()).toEqual(before);
    });

    waitsOn(memberCheck, "without a session, the switch answers signed-out", async () => {
      await aBoardWithoutUnlocks();
      const before = await everythingWritten();

      expect(await websiteAs(t, null).command("website.commands.setBoardVisibility", { visible: false })).toEqual({ kind: "signed-out" });
      expect(await everythingWritten()).toEqual(before);
    });

    waitsOn(["S3", ...memberCheck], "a member who left the workspace answers not-a-member", async () => {
      await aBoardWithoutUnlocks();
      const asSignedIn = await aSession(juno);
      await memberChanged(t, "user_change", { id: juno.user, team_id: allowedWorkspace, deleted: true });
      const before = await everythingWritten();

      expect(await asSignedIn.command("website.commands.setBoardVisibility", { visible: false })).toEqual({ kind: "not-a-member" });
      expect(await everythingWritten()).toEqual(before);
    });
  });

  test("WS61: the setting is the only argument, so no call names a member", async () => {
    const { member } = await aBoardWithoutUnlocks();
    const asSignedIn = await aSession(juno);
    const before = await everythingWritten();

    await expect(asSignedIn.command("website.commands.setBoardVisibility", { visible: false, member })).rejects.toThrow(argumentsRefused);
    expect(await everythingWritten()).toEqual(before);
  });
});

describe("a website command never launches unlocks", () => {
  waitsOn(theSwitch, "WS321 WS335 P77: with the boards, xp-levels and unlocks on and no unlocks launch, the switch answers refused and launches nothing", async () => {
    await switchWebsite(true, ...unlocksFlags);
    const { me } = await signedIn();
    const before = await everythingWritten();
    const from = (await t.published()).length;

    expect(await setBoardVisibility(me, false)).toEqual({ kind: "refused" });
    expect(await everythingWritten()).toEqual(before);
    expect(before.unlockLaunches).toEqual([]);
    expect(before.leaderboardSettings).toEqual([]);
    expect(await eventsSince(from)).toEqual([]);
  });

  waitsOn(onTheUnlockPath, "WS321 WS335: with achievements on and no Book launch, an open board's switch answers refused and doesn't launch the Book", async () => {
    const { me } = await anOpenBoard("achievements");
    const before = await everythingWritten();
    const from = (await t.published()).length;

    expect(await setBoardVisibility(me, false)).toEqual({ kind: "refused" });
    expect(await everythingWritten()).toEqual(before);
    expect(before.bookLaunches).toEqual([]);
    expect(await eventsSince(from)).toEqual([]);
  });
});

describe("a website command is a D17 command", () => {
  type Refusal = { condition: string; stacks: [Stack, ...Stack[]]; arrange: () => Promise<{ me: VerifiedMember }> };

  const refusedByTheBoard: Refusal[] = [
    { condition: "a Leaderboard still locked at level 1", stacks: onTheUnlockPath, arrange: () => aBoardAtLevel(1) },
    { condition: "a ready Leaderboard", stacks: onTheUnlockPath, arrange: () => aBoardAtLevel(3) },
    { condition: "the boards switched off while unlocks don't apply", stacks: theSwitch, arrange: async () => (await switchWebsite(true), signedIn()) },
  ];

  for (const { condition, stacks, arrange } of refusedByTheBoard) {
    waitsOn(stacks, `WS321: ${condition} answers refused before D17 and writes nothing at all`, async () => {
      const { me } = await arrange();
      const before = await everythingWritten();
      const from = (await t.published()).length;

      expect(await setBoardVisibility(me, false)).toEqual({ kind: "refused" });

      expect(await everythingWritten()).toEqual(before);
      expect(await eventsSince(from)).toEqual([]);
    });
  }

  waitsOn(onTheUnlockPath, "WS321: an open Leaderboard on the unlock path switches, with the Journey and the Book launched", async () => {
    const { member, me } = await anOpenBoard("quests", "achievements");
    await unlocksShippedBeforeAnyoneJoined();
    await bookShippedBeforeAnyoneJoined();

    expect(await setBoardVisibility(me, false)).toEqual({ kind: "set", visible: false });
    expect(await onTheBoards(member)).toBe(false);
  });

  waitsOn(theSwitch, "WS321: with the board open while unlocks don't apply, a member switches themselves off and on, answering the stored setting", async () => {
    const { member, me } = await aBoardWithoutUnlocks();

    expect(await setBoardVisibility(me, false)).toEqual({ kind: "set", visible: false });
    expect(await onTheBoards(member)).toBe(false);

    expect(await setBoardVisibility(me, true)).toEqual({ kind: "set", visible: true });
    expect(await onTheBoards(member)).toBe(true);
  });

  waitsOn(theSwitch, "WS321: App Home's republish is scheduled after a change, and a second identical call changes nothing and republishes nothing", async () => {
    const { member, me } = await aBoardWithoutUnlocks();
    const republishedBefore = await homeRepublishesFor(juno.user);

    await setBoardVisibility(me, false);
    expect(await homeRepublishesFor(juno.user)).toHaveLength(republishedBefore.length + 1);

    expect(await setBoardVisibility(me, false)).toEqual({ kind: "set", visible: false });
    expect(await homeRepublishesFor(juno.user)).toHaveLength(republishedBefore.length + 1);
    expect(await t.seed.all("leaderboardSettings")).toMatchObject([{ member, visible: false }]);
    expect(await visibilityChangesRecorded()).toHaveLength(1);
  });

  waitsOn(theSwitch, "WS321: switching on a member who was never off changes nothing and republishes nothing", async () => {
    const { me } = await aBoardWithoutUnlocks();
    const republishedBefore = await homeRepublishesFor(juno.user);

    expect(await setBoardVisibility(me, true)).toEqual({ kind: "set", visible: true });
    expect(await homeRepublishesFor(juno.user)).toHaveLength(republishedBefore.length);
  });

  waitsOn(onTheUnlockPath, "WS64 WS335: switching off on the website leaves the domain tables and events Slack's Settings switch leaves, besides Slack's receipt", async () => {
    // Slack's side first, then the website's in the emptied tables: today's two backends.
    const slackSide = await anOpenBoard();
    const slackFrom = (await t.published()).length;
    await t.run((ctx) =>
      receiveHomeClick(ctx, {
        workspace: allowedWorkspace,
        eventId: "Ev_SETTINGS",
        user: juno.user,
        commands: [{ type: "setLeaderboardVisibility", visible: false }],
      }),
    );
    const fromSlack = { tables: await everyTableOfToday(), events: await eventsSince(slackFrom) };
    await emptied();

    const websiteSide = await anOpenBoard();
    const websiteFrom = (await t.published()).length;
    expect(await setBoardVisibility(websiteSide.me, false)).toEqual({ kind: "set", visible: false });
    const fromWebsite = { tables: await everyTableOfToday(), events: await eventsSince(websiteFrom) };

    expect(comparable(fromWebsite, websiteSide.member)).toEqual(comparable(fromSlack, slackSide.member));
    expect(fromWebsite.tables.leaderboardSettings).toMatchObject([{ member: websiteSide.member, visible: false }]);
  });
});

function comparable({ tables, events }: { tables: Record<string, Row[]>; events: unknown[] }, member: MemberId) {
  const domain = { ...tables, slackReceipts: [], analyticsOutbox: [], analyticsDrain: [] };
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
