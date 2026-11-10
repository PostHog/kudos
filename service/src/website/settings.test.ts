// The settings page and its commands: today's convex/website/settings.test.ts, on the service's test backend. Each read
// runs `getSettings` and each command its handler of settingsCommands.ts for a `me` made from the seeded directory row
// and a `person` the directory answers, as S15's member check answers them. The reads and commands whose subject is the
// member check or the route's arguments (closed, signed out, not a member, a call naming a member) are called by their
// route names through the whole app, signed in through SSO or not at all, so the app's own identity mapping and member
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
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import { decodeStored } from "../db/codec.ts";
import { toDocument } from "../db/documents.ts";
import * as schema from "../db/schema/index.ts";
import * as loadTables from "../db/schema/load.ts";
import * as serviceTables from "../db/schema/service.ts";
import { jobs } from "../db/schema/service.ts";
import type { HomeMember } from "../feedback/homes.ts";
import { primaryGroupOf } from "../groups/groups.ts";
import { placeOf } from "../messageSettings/messageSettings.ts";
import type { MutationContext } from "../operations.ts";
import { syncUserGroups } from "../slack/userGroups.ts";
import { memberChanged } from "../slack/hugsTesting.ts";
import { receiveHomeClick } from "../slack/receipts.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";
import { getMyProfile } from "./profile.ts";
import { getSettings, type MessageKind, type MessagePlace } from "./settings.ts";
import { pickPrimaryGroup as pickPrimaryGroupCommand, setBoardVisibility as setBoardVisibilityCommand, setMessageSetting as setMessageSettingCommand } from "./settingsCommands.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const messageSettings = "message-settings";
const unlocksFlags = ["everyone-board", "xp-levels", "unlocks"];

// What getSettings reaches: the unlock path (S16), the boards and groups (S11), message settings (S5), unlocks (S6), team
// pages (S12) and the teammate keys (S15).
const settingsRead: [Stack, ...Stack[]] = ["S5", "S6", "S11", "S12", "S15", "S16"];
// What a settings command reaches besides: the command runner (S4), the launch guard (S15), App Home's republish (S5,
// S17) and the Slack directory's user groups (S3).
const settingsCommand: [Stack, ...Stack[]] = ["S3", "S4", "S5", "S6", "S11", "S15", "S16", "S17"];
// Syncing Slack's user groups (S11), then the read or the command.
const withGroups: [Stack, ...Stack[]] = ["S3", "S4", "S5", "S6", "S11", "S12", "S15", "S16", "S17"];
// getMyProfile reaches homeFacts (S4), progression (S6), the wallet (S7), the album and avatar (S9, S10) and the rest.
const profileStacks: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S9", "S10", "S11", "S12", "S15", "S16"];
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
  t.slack.withMember(juno.user);
});

afterEach(() => void vi.unstubAllEnvs());

// Today's `switchWebsite`: the website open or closed, these flags on for everyone, and the workspace's key made.
async function switchWebsite(open: boolean, ...alsoOn: string[]) {
  await definitionsStored(t.operations, open ? onForEveryone("website") : offForEveryone("website"), ...alsoOn.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

function aMember(user: string) {
  return t.seed.insert("members", { workspace: allowedWorkspace, user, kind: "member", asOf: 0 }) as Promise<MemberId>;
}

/** Today's `aSignedInSession`: the member's users row and analytics ID, and the member check's answer for them. */
async function signedIn(member: MemberId, { user, name }: { user: string; name: string }): Promise<VerifiedMember> {
  await t.seed.insert("users", { name, chatIdentity: { workspace: allowedWorkspace, user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: allowedWorkspace, user, name };
}

/** Today's `aSignedInSession` for the session alone: the person signs in, through SSO here, and the website's requests come as them. */
function aSession(person: { user: string }) {
  return signedInThroughSso(t, person, allowedWorkspace);
}

async function signedInWith(...flags: string[]) {
  await switchWebsite(true, ...flags);
  const member = await aMember(juno.user);
  return { member, me: await signedIn(member, juno) };
}

async function inGroups(...names: string[]) {
  for (const name of names) t.slack.withUserGroup(`S_${name.toUpperCase()}`, { name, users: [juno.user] });
  await t.operations.action("test.syncUserGroups", (ctx) => syncUserGroups(ctx, {}));
  await t.settle();
  return Object.fromEntries((await t.seed.all("userGroups")).map(({ name, _id }) => [name, _id as string]));
}

function settingsOf(me: VerifiedMember) {
  return t.query((ctx) => getSettings(ctx, me));
}

/** Runs a settings command as the website's route does: the member check's `me`, and the directory's facts of them. */
function command<Args, Answer>(handler: (ctx: MutationContext, me: VerifiedMember, person: HomeMember, args: Args) => Promise<Answer>, me: VerifiedMember, args: Args) {
  return t.run(async (ctx) => handler(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, args));
}

function setMessageSetting(me: VerifiedMember, kind: MessageKind, place: MessagePlace) {
  return command(setMessageSettingCommand, me, { kind, place });
}

function pickPrimaryGroup(me: VerifiedMember, group: string) {
  return command(pickPrimaryGroupCommand, me, { group });
}

function setBoardVisibility(me: VerifiedMember, visible: boolean) {
  return command(setBoardVisibilityCommand, me, { visible });
}

function placeIn(member: MemberId, kind: MessageKind) {
  return t.query((ctx) => placeOf(ctx, member, kind));
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

async function homeRepublishes() {
  return (await scheduledNamed("slack.appHome.publishHome")).filter((args) => args.user === juno.user);
}

describe("website reads pass one guard", () => {
  waitsOn(memberCheck, "WS11: with the website flag off, the settings read answers closed", async () => {
    await signedInWith(messageSettings);
    const asSignedIn = await aSession({ user: "U_OTHER" });
    await switchWebsite(false, messageSettings);

    expect(await asSignedIn.read("website.settings.getSettings", {})).toEqual({ kind: "closed" });
  });

  waitsOn(memberCheck, "WS11: without a session, the settings read answers signed-out", async () => {
    await signedInWith(messageSettings);

    expect(await websiteAs(t, null).read("website.settings.getSettings", {})).toEqual({ kind: "signed-out" });
  });
});

describe("the settings read", () => {
  waitsOn(settingsRead, "with nothing to set, it answers not-found", async () => {
    const { me } = await signedInWith();

    expect(await settingsOf(me)).toEqual({ kind: "not-found" });
  });

  waitsOn(settingsRead, "with message settings on, it lists each kind that applies to the member in catalogue order, with its place and the places it offers", async () => {
    const { me } = await signedInWith(messageSettings, "xp-levels");

    expect(await settingsOf(me)).toEqual({
      kind: "settings",
      board: null,
      group: null,
      messages: [
        expect.objectContaining({ kind: "kudos-reply", label: "After-kudos reply", on: true, place: "channel", places: ["channel", "dm", "none"] }),
        expect.objectContaining({ kind: "level-ups", label: "Level ups", on: true, place: "dm", places: ["dm", "channel", "none"] }),
        expect.objectContaining({ kind: "celebrations", label: "Public celebrations", on: true, place: "channel", places: ["channel", "none"] }),
      ],
    });
  });

  waitsOn(settingsCommand, "WS321: with the board open while unlocks don't apply, it shows whether the member is on the boards", async () => {
    const { me } = await signedInWith("everyone-board");
    await setBoardVisibility(me, false);

    expect(await settingsOf(me)).toEqual({ kind: "settings", board: { onTheBoards: false }, messages: null, group: null });
  });

  waitsOn(withGroups, "with groups on, a member in two groups picks between them, their primary group first chosen", async () => {
    const { me } = await signedInWith("groups");
    const { Gardeners, Zebras } = await inGroups("Zebras", "Gardeners");

    const settings = await settingsOf(me);

    expect(settings).toMatchObject({ kind: "settings", group: { groups: [{ group: Gardeners, name: "Gardeners" }, { group: Zebras, name: "Zebras" }] } });
    expect([Gardeners, Zebras]).toContain((settings as { group: { primary: { group: string } } }).group.primary.group);
  });

  waitsOn(withGroups, "with groups on, a member in one group has nothing to pick", async () => {
    const { me } = await signedInWith("groups");
    await inGroups("Gardeners");

    expect(await settingsOf(me)).toEqual({ kind: "not-found" });
  });

  waitsOn(profileStacks, "getMyProfile says whether the settings page has something to show", async () => {
    const off = await signedInWith();
    expect(await t.query((ctx) => getMyProfile(ctx, off.me))).toMatchObject({ kind: "member", settings: false });

    await switchWebsite(true, messageSettings);
    expect(await t.query((ctx) => getMyProfile(ctx, off.me))).toMatchObject({ kind: "member", settings: true });
  });
});

describe("website commands pass one guard", () => {
  waitsOn(memberCheck, "WS61: with the website flag off, the message setting answers closed and writes nothing", async () => {
    await signedInWith(messageSettings);
    const asSignedIn = await aSession(juno);
    await switchWebsite(false, messageSettings);
    const before = await everythingWritten();

    expect(await asSignedIn.command("website.commands.setMessageSetting", { kind: "kudos-reply", place: "dm" })).toEqual({ kind: "closed" });
    expect(await everythingWritten()).toEqual(before);
  });

  waitsOn(memberCheck, "WS61: without a session, the message setting and the group pick answer signed-out and write nothing", async () => {
    await signedInWith(messageSettings, "groups");
    const before = await everythingWritten();
    const signedOut = websiteAs(t, null);

    expect(await signedOut.command("website.commands.setMessageSetting", { kind: "kudos-reply", place: "dm" })).toEqual({ kind: "signed-out" });
    expect(await signedOut.command("website.commands.pickPrimaryGroup", { group: "anything" })).toEqual({ kind: "signed-out" });
    expect(await everythingWritten()).toEqual(before);
  });

  waitsOn(["S3", ...memberCheck], "WS61: a member who left the workspace answers not-a-member", async () => {
    await signedInWith(messageSettings);
    const asSignedIn = await aSession(juno);
    await memberChanged(t, "user_change", { id: juno.user, team_id: allowedWorkspace, deleted: true });
    const before = await everythingWritten();

    expect(await asSignedIn.command("website.commands.setMessageSetting", { kind: "kudos-reply", place: "dm" })).toEqual({ kind: "not-a-member" });
    expect(await everythingWritten()).toEqual(before);
  });

  test("WS61: the kind and the place are the only arguments, so no call names a member", async () => {
    const { member } = await signedInWith(messageSettings);
    const asSignedIn = await aSession(juno);

    await expect(asSignedIn.command("website.commands.setMessageSetting", { kind: "kudos-reply", place: "dm", member })).rejects.toThrow(argumentsRefused);
    await expect(asSignedIn.command("website.commands.pickPrimaryGroup", { group: "anything", member })).rejects.toThrow(argumentsRefused);
  });
});

describe("a website command is a D17 command", () => {
  describe("the message setting", () => {
    waitsOn(settingsCommand, "moves a kind to a place it offers, answering the place stored afterwards", async () => {
      const { member, me } = await signedInWith(messageSettings);

      expect(await setMessageSetting(me, "kudos-reply", "dm")).toEqual({ kind: "set", place: "dm" });
      expect(await placeIn(member, "kudos-reply")).toBe("dm");

      expect(await setMessageSetting(me, "kudos-reply", "none")).toEqual({ kind: "set", place: "none" });
      expect(await placeIn(member, "kudos-reply")).toBe("none");
    });

    waitsOn(settingsCommand, "records the usage fact and republishes App Home once, and a repeated request changes nothing", async () => {
      const { me } = await signedInWith(messageSettings);
      const republishedBefore = (await homeRepublishes()).length;

      await setMessageSetting(me, "kudos-reply", "dm");
      expect(await setMessageSetting(me, "kudos-reply", "dm")).toEqual({ kind: "set", place: "dm" });

      const recorded = await scheduledNamed("analytics.isolatedUsage.recordMessageSettingChanged");
      expect(recorded).toEqual([expect.objectContaining({ setting: "kudos-reply", on: true, place: "dm" })]);
      expect(await homeRepublishes()).toHaveLength(republishedBefore + 1);
    });

    const refusals: Array<{ condition: string; flags: string[]; kind: MessageKind; place: MessagePlace }> = [
      { condition: "message settings off for the member", flags: [], kind: "kudos-reply", place: "dm" },
      { condition: "a kind that doesn't apply to the member", flags: [messageSettings], kind: "level-ups", place: "none" },
      { condition: "a place the kind doesn't offer", flags: [messageSettings, "xp-levels"], kind: "celebrations", place: "dm" },
    ];

    for (const { condition, flags, kind, place } of refusals) {
      waitsOn(settingsCommand, `${condition} answers refused before D17 and writes nothing at all`, async () => {
        const { me } = await signedInWith(...flags);
        const before = await everythingWritten();

        expect(await setMessageSetting(me, kind, place)).toEqual({ kind: "refused" });
        expect(await everythingWritten()).toEqual(before);
      });
    }

    waitsOn(settingsCommand, "WS64 WS335: a change on the website leaves the domain tables and events Slack's Settings pick leaves, besides Slack's receipt and the website's own exposure", async () => {
      // Slack's side first, then the website's in the emptied tables: today's two backends.
      await switchWebsite(true, messageSettings);
      const slackMember = await aMember(juno.user);
      const slackFrom = (await t.published()).length;
      await t.run((ctx) => receiveHomeClick(ctx, { workspace: allowedWorkspace, eventId: "Ev_SETTINGS", user: juno.user, commands: [{ type: "setMessageSetting", kind: "kudos-reply", place: "dm" }] }));
      const fromSlack = { tables: await everyTableOfToday(), events: await eventsSince(slackFrom) };
      await emptied();

      const { member, me } = await signedInWith(messageSettings);
      const websiteFrom = (await t.published()).length;
      expect(await setMessageSetting(me, "kudos-reply", "dm")).toEqual({ kind: "set", place: "dm" });
      const fromWebsite = { tables: await everyTableOfToday(), events: await eventsSince(websiteFrom) };

      expect(comparable(fromWebsite, member)).toEqual(comparable(fromSlack, slackMember));
      expect(fromWebsite.tables.messageSettings).toMatchObject([{ member, kind: "kudos-reply", on: true, place: "dm" }]);
    });
  });

  describe("the group pick", () => {
    waitsOn(withGroups, "picks one of the member's groups, records the pick once with the website as its surface, and a repeat changes nothing", async () => {
      const { member, me } = await signedInWith("groups");
      const { Gardeners, Zebras } = await inGroups("Zebras", "Gardeners");
      const primary = await t.query((ctx) => primaryGroupOf(ctx, member));
      const other = primary?.group === Gardeners ? Zebras! : Gardeners!;

      expect(await pickPrimaryGroup(me, other)).toEqual({ kind: "picked", group: other });
      expect(await pickPrimaryGroup(me, other)).toEqual({ kind: "picked", group: other });

      expect((await t.query((ctx) => primaryGroupOf(ctx, member)))?.group).toBe(other);
      const recorded = await scheduledNamed("analytics.isolatedUsage.recordPrimaryGroupPicked");
      expect(recorded).toEqual([expect.objectContaining({ surface: "website" })]);
    });

    waitsOn(withGroups, "a group the member isn't in, or no ID at all, answers refused and writes nothing", async () => {
      const { me } = await signedInWith("groups");
      await inGroups("Zebras", "Gardeners");
      const elsewhere = await t.seed.insert("userGroups", { workspace: allowedWorkspace, group: "S_ELSE", handle: "else", name: "Else", enabled: true, automatic: false, asOf: 0 });
      const before = await everythingWritten();

      expect(await pickPrimaryGroup(me, elsewhere)).toEqual({ kind: "refused" });
      expect(await pickPrimaryGroup(me, "not-an-id")).toEqual({ kind: "refused" });
      expect(await everythingWritten()).toEqual(before);
    });

    waitsOn(withGroups, "a group Slack has removed the member from, before reconciling caught up, answers refused and writes nothing", async () => {
      const { member, me } = await signedInWith("groups");
      const { Gardeners, Zebras } = await inGroups("Zebras", "Gardeners");
      const primary = await t.query((ctx) => primaryGroupOf(ctx, member));
      const other = primary?.group === Gardeners ? Zebras! : Gardeners!;
      const slackGroup = (await t.seed.get("userGroups", other))!.group;
      for (const row of await t.seed.all("userGroupMembers")) if (row.group === slackGroup) await t.seed.delete("userGroupMembers", row._id);
      const before = await everythingWritten();

      expect(await pickPrimaryGroup(me, other)).toEqual({ kind: "refused" });
      expect(await everythingWritten()).toEqual(before);
    });

    waitsOn(withGroups, "with groups off for the member, it answers refused and writes nothing", async () => {
      const { me } = await signedInWith();
      const { Zebras } = await inGroups("Zebras", "Gardeners");
      const before = await everythingWritten();

      expect(await pickPrimaryGroup(me, Zebras!)).toEqual({ kind: "refused" });
      expect(await everythingWritten()).toEqual(before);
    });
  });
});

describe("a website command never launches unlocks", () => {
  waitsOn(settingsCommand, "WS335 P77: with unlocks on and no unlocks launch, the message setting answers refused and launches nothing", async () => {
    const { me } = await signedInWith(messageSettings, ...unlocksFlags);
    const before = await everythingWritten();
    const from = (await t.published()).length;

    expect(await setMessageSetting(me, "kudos-reply", "dm")).toEqual({ kind: "refused" });
    expect(await everythingWritten()).toEqual(before);
    expect(before.unlockLaunches).toEqual([]);
    expect(await eventsSince(from)).toEqual([]);
  });

  waitsOn(withGroups, "WS335 P77: with unlocks on and no unlocks launch, the group pick answers refused and launches nothing", async () => {
    const { me } = await signedInWith("groups", ...unlocksFlags);
    const { Zebras } = await inGroups("Zebras", "Gardeners");
    const before = await everythingWritten();
    const from = (await t.published()).length;

    expect(await pickPrimaryGroup(me, Zebras!)).toEqual({ kind: "refused" });
    expect(await everythingWritten()).toEqual(before);
    expect(before.unlockLaunches).toEqual([]);
    expect(await eventsSince(from)).toEqual([]);
  });
});

function comparable({ tables, events }: { tables: Record<string, Row[]>; events: unknown[] }, member: MemberId) {
  const domain = { ...tables, slackReceipts: [], analyticsOutbox: [], analyticsDrain: [], users: [], flagExposures: (tables.flagExposures ?? []).filter(({ flag }) => flag !== "website") };
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
