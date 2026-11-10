// The maintainer's public celebrations switch in Settings: today's convex/website/publicCelebrations.test.ts, on the
// service's test backend. Reads run `getSettings` and switches settingsCommands.ts's `setPublicCelebrations` and
// `setMessageSetting` for a `me` made from the directory row Slack's team_join filled and a `person` the directory
// answers, as S15's member check answers them. The switch whose subject is the route's arguments (a call naming a member)
// is called by its route name through the whole app, signed in through SSO, where the transport refuses it before anyone
// is looked up.
import { asc, getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { appHomeOpened, emoji, mention, messageEvent, section } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import { toDocument } from "../db/documents.ts";
import * as schema from "../db/schema/index.ts";
import * as loadTables from "../db/schema/load.ts";
import * as serviceTables from "../db/schema/service.ts";
import type { HomeMember } from "../feedback/homes.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import { directoryRecordOfEvent, type MemberChanged } from "../slack/directory.ts";
import type { ClickKind, EventKind } from "../slack/frontDoor.ts";
import { receiveMemberChanged } from "../slack/receipts.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { argumentsRefused, signedInThroughSso } from "./routesTesting.ts";
import { getSettings } from "./settings.ts";
import { setMessageSetting, setPublicCelebrations } from "./settingsCommands.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-22T10:00:00Z");
const maintainer = "U_MAINTAINER";
const everyFlag = ["workspace-settings", "celebrations-switch", "message-settings", "xp-levels"];

// A workspace whose people joined through Slack (S3's directory), then the settings read (S5, S6, S11, S12, S15, S16),
// a switch (the launch guard, S15, and the command runner, S4), or a kudos given in Slack and its level up's public
// celebration (S4, S5, S6).
const aWorkspaceRead: [Stack, ...Stack[]] = ["S3", "S4", "S5", "S6", "S11", "S12", "S15", "S16"];
// And besides: the admin's App Home and its click (S4, S5, S17).
const aWorkspaceInAppHome: [Stack, ...Stack[]] = ["S3", "S4", "S5", "S6", "S11", "S12", "S15", "S16", "S17"];

type Row = Record<string, unknown>;

const backend = useTestBackend({ now: now.getTime(), workspace: allowedWorkspace });

let t: TestBackend;
let sentMessages = 0;

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
  vi.stubEnv("KUDOS_EMOJI", "");
  vi.stubEnv("KUDOS_MAINTAINER", maintainer);
  t = backend();
  t.slack.withMember(maintainer).withMember("U_ADMIN", { is_admin: true }).withMember("U_ANN").withMember("U_BOB");
  sentMessages = 0;
});

afterEach(() => void vi.unstubAllEnvs());

describe("the maintainer switches public celebrations off and on from Settings", () => {
  waitsOn(aWorkspaceRead, "the maintainer's Settings show public celebrations on until someone switches them", async () => {
    const owner = await aWorkspace();

    expect(await owner.publicCelebrations()).toBe(true);
  }, 60_000);

  waitsOn(aWorkspaceRead, "switching off answers set, the read shows them off, and the next level up posts nothing in the announcement channel", async () => {
    const owner = await aWorkspace();

    expect(await owner.switchPublicCelebrations(false)).toEqual({ kind: "set" });

    expect(await owner.publicCelebrations()).toBe(false);
    await giveKudos("U_ANN", "U_BOB", 2);
    expect(t.slack.messagesIn("C_ANNOUNCE")).toEqual([]);
  }, 60_000);

  waitsOn(aWorkspaceRead, "switching off what is already off answers set and writes nothing more", async () => {
    const owner = await aWorkspace();
    await owner.switchPublicCelebrations(false);
    const before = await everyTable();

    expect(await owner.switchPublicCelebrations(false)).toEqual({ kind: "set" });
    expect(await everyTable()).toEqual(before);
  }, 60_000);

  waitsOn(aWorkspaceInAppHome, "an admin's Switch on in App Home shows in the maintainer's Settings", async () => {
    const owner = await aWorkspace();
    await owner.switchPublicCelebrations(false);
    await adminTabOpen("U_ADMIN");

    await clickInHome("U_ADMIN", "Switch on");

    expect(await owner.publicCelebrations()).toBe(true);
  }, 60_000);

  waitsOn(aWorkspaceRead, "the command exposes celebrations-switch for the maintainer, and the read decides it without", async () => {
    const owner = await aWorkspace();
    await owner.publicCelebrations();
    expect(await exposuresOf("celebrations-switch")).toEqual([]);

    await owner.switchPublicCelebrations(false);

    expect(await exposuresOf("celebrations-switch")).toEqual([{ flag: "celebrations-switch", member: owner.member, value: true }]);
  }, 60_000);
});

describe("only the maintainer switches public celebrations from Settings, and only while celebrations-switch is on", () => {
  waitsOn(aWorkspaceRead, "a workspace admin who isn't the maintainer sees no switch in Settings, and their switch is refused and writes nothing", async () => {
    await aWorkspace();
    const admin = await signedIn("U_ADMIN");

    expect(await admin.publicCelebrations()).toBeUndefined();
    expect(await admin.switchPublicCelebrations(false)).toEqual({ kind: "refused" });
    expect(await storedSwitches()).toEqual([]);
  }, 60_000);

  waitsOn(aWorkspaceRead, "while celebrations-switch is off, there is no switch in Settings, the switch is refused and writes nothing", async () => {
    const owner = await aWorkspace({ flags: ["workspace-settings", "message-settings", "xp-levels"] });

    expect(await owner.publicCelebrations()).toBeUndefined();
    expect(await owner.switchPublicCelebrations(false)).toEqual({ kind: "refused" });
    expect(await storedSwitches()).toEqual([]);
  }, 60_000);

  waitsOn(aWorkspaceRead, "while workspace-settings is off for the maintainer, there is no switch in Settings, the switch is refused and writes nothing", async () => {
    const owner = await aWorkspace({ flags: ["celebrations-switch", "message-settings", "xp-levels"] });

    expect(await owner.publicCelebrations()).toBeUndefined();
    expect(await owner.switchPublicCelebrations(false)).toEqual({ kind: "refused" });
    expect(await storedSwitches()).toEqual([]);
  }, 60_000);

  waitsOn(["S3"], "WS61: on is setPublicCelebrations's only argument, so no call names a member", async () => {
    const owner = await aWorkspace();
    const asSignedIn = await aSession({ user: maintainer });
    const before = await everyTable();

    await expect(asSignedIn.command("website.commands.setPublicCelebrations", { on: false, member: owner.member })).rejects.toThrow(argumentsRefused);
    expect(await everyTable()).toEqual(before);
  }, 60_000);
});

describe("a website command never launches unlocks", () => {
  waitsOn(aWorkspaceRead, "with unlocks on and no unlocks launch, the maintainer's switch answers refused and launches nothing", async () => {
    const owner = await aWorkspace({ flags: [...everyFlag, "everyone-board", "unlocks"] });
    await t.settle();
    const before = await everyTable();

    expect(await owner.switchPublicCelebrations(false)).toEqual({ kind: "refused" });
    await t.settle();

    expect(await everyTable()).toEqual(before);
    expect(before.unlockLaunches).toEqual([]);
  }, 60_000);
});

describe("members can't pick public celebrations in Settings while the workspace switches them off", () => {
  waitsOn(aWorkspaceRead, "a member's Settings read carries no celebrations kind while off, and their own choice again once on", async () => {
    const owner = await aWorkspace();
    const ann = await signedIn("U_ANN");
    await ann.setMessageSetting("celebrations", "none");

    await owner.switchPublicCelebrations(false);
    const kindsWhileOff = await ann.messageKinds();
    expect(await ann.setMessageSetting("celebrations", "channel")).toEqual({ kind: "refused" });
    await owner.switchPublicCelebrations(true);

    expect(kindsWhileOff).toEqual(["kudos-reply", "level-ups"]);
    expect(await ann.messages()).toContainEqual(expect.objectContaining({ kind: "celebrations", place: "none" }));
  }, 60_000);
});

type Setup = { flags?: string[] };

async function aWorkspace({ flags = everyFlag }: Setup = {}) {
  await definitionsStored(t.operations, onForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
  await t.seed.insert("workspaces", { workspace: allowedWorkspace, kudosEmoji: "taco", baseAllowance: 10, announcementChannel: "C_ANNOUNCE", url: "https://hedgehug.slack.com/" });
  await memberChanged("team_join", { id: maintainer, real_name: "Mae Maintainer" });
  await memberChanged("team_join", { id: "U_ADMIN", is_admin: true, real_name: "Ada Admin" });
  for (const user of ["U_ANN", "U_BOB"]) await memberChanged("team_join", { id: user, real_name: `${user} Example` });
  await t.settle();
  return signedIn(maintainer);
}

type Messages = Array<{ kind: string; place: string }>;

/** Today's `aSignedInSession` for the session alone: the person signs in, through SSO here, and the website's requests come as them. */
function aSession(person: { user: string }) {
  return signedInThroughSso(t, person, allowedWorkspace);
}

/** Today's `aSignedInSession` for a person the directory knows: their users row and analytics ID, and what they do. */
async function signedIn(user: string) {
  const member = (await t.seed.all("members")).find((row) => row.workspace === allowedWorkspace && row.user === user)!._id as MemberId;
  await t.seed.insert("users", { name: user, chatIdentity: { workspace: allowedWorkspace, user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  const me: VerifiedMember = { member, workspace: allowedWorkspace, user, name: user };
  const settings = async () => (await t.query((ctx) => getSettings(ctx, me))) as { publicCelebrations?: boolean; messages?: Messages | null };
  const messages = async () => (await settings()).messages ?? [];
  return {
    member,
    publicCelebrations: async () => (await settings()).publicCelebrations,
    messages,
    messageKinds: async () => (await messages()).map(({ kind }) => kind),
    switchPublicCelebrations: (on: boolean) => command(setPublicCelebrations, me, { on }),
    setMessageSetting: (kind: "celebrations", place: "channel" | "none") => command(setMessageSetting, me, { kind, place }),
  };
}

/** Runs a command as the website's route does: the member check's `me`, and the directory's facts of them. */
function command<Args, Answer>(handler: (ctx: MutationContext, me: VerifiedMember, person: HomeMember, args: Args) => Promise<Answer>, me: VerifiedMember, args: Args) {
  return t.run(async (ctx) => handler(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, args));
}

let memberEvents = 0;

// Today's `memberChanged`: Slack's team_join or user_change event, received as today's front door receives it. No domain
// registers the front door's memberChanged handler yet, so the receipt it would run is called with what it would pass.
async function memberChanged(type: "team_join" | "user_change", user: Record<string, unknown>) {
  memberEvents += 1;
  const event = { type, user: { team_id: allowedWorkspace, ...user } as MemberChanged["user"], event_ts: `${t.clock.now() / 1000}` };
  await t.run((ctx) => receiveMemberChanged(ctx, directoryRecordOfEvent(allowedWorkspace, `Ev_MEMBER_${memberEvents}`, event)!));
}

// Today's `settleUpTo(t, Date.now() + 60_000)`: the jobs due now, then those due within the next minute.
async function settleForAMinute() {
  await t.settle();
  t.time.advance(60_000);
  await t.settle();
}

async function giveKudos(giver: string, recipient: string, kudos: number) {
  handledByTheFrontDoor({ event: "message" });
  sentMessages += 1;
  const blocks = [section(mention(recipient), ...Array.from({ length: kudos }, () => emoji("taco")))];
  await delivered(t.send("/events", messageEvent(blocks, { user: giver, ts: `${Math.floor(t.clock.now() / 1000) + sentMessages}.000100` })));
  await settleForAMinute();
}

async function adminTabOpen(user: string) {
  handledByTheFrontDoor({ event: "homeOpened" });
  await delivered(t.send("/events", appHomeOpened(user, { eventTime: new Date(t.clock.now()) })));
  await settleForAMinute();
  await clickInHome(user, "Admin");
  expect(publishedHome(user)).toContain("section: *Public celebrations*");
}

async function clickInHome(user: string, label: string) {
  handledByTheFrontDoor({ click: "homeClick" });
  const action = buttonInHome(user, label);
  await delivered(t.interaction({
    type: "block_actions",
    team: { id: allowedWorkspace, domain: "kudos" },
    user: { id: user, team_id: allowedWorkspace },
    api_app_id: "A_KUDOS",
    trigger_id: `${sentMessages}.1760349600.trigger`,
    container: { type: "view", view_id: "V_HOME" },
    view: { id: "V_HOME", type: "home" },
    actions: [{ block_id: "b1", ...action, action_ts: "1760349600.000300" }],
  }));
  await settleForAMinute();
}

// Today's testing/slackInteractions.ts readers of the published App Home, as far as these tests read it.
type TextObject = { type: string; text: string };
type Element = { type: string; text?: TextObject; action_id?: string; value?: string };
type Block = { type: string; block_id?: string; text?: TextObject; fields?: TextObject[]; elements?: Element[]; accessory?: Element };

function publishedHomeBlocks(user: string): Block[] {
  const view = t.slack.homeShownTo(user) as { type: string; blocks: Block[] } | undefined;
  expect(view?.type).toBe("home");
  return view?.blocks ?? [];
}

function publishedHome(user: string) {
  return publishedHomeBlocks(user).map((block) => {
    if (block.type !== "section" || block.fields) return block.type;
    return `section: ${block.text?.text}${block.accessory ? ` [${block.accessory.type}: ${block.accessory.text?.text ?? ""}]` : ""}`;
  });
}

function buttonInHome(user: string, label: string) {
  for (const block of publishedHomeBlocks(user)) {
    const elements = [...(block.type === "actions" ? (block.elements ?? []) : []), ...(block.accessory ? [block.accessory] : [])];
    const button = elements.find((element) => element.type === "button" && element.text?.text === label);
    if (button) return { type: "button", action_id: button.action_id!, ...(button.value !== undefined && { value: button.value }), ...(block.block_id && { block_id: block.block_id }) };
  }
  throw new Error(`no ${label} button among the blocks`);
}

function storedSwitches() {
  return t.seed.all("celebrationsSwitches");
}

const everyPgTable = (Object.values(schema) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).sort((a, b) => getTableName(a).localeCompare(getTableName(b)));
// The service's own tables: none of them is one of today's `schema.tables`.
const servicesOwn = new Set((Object.values({ ...serviceTables, ...loadTables }) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).map(getTableName));

/** Today's `everyTable`: the rows of today's tables, without the service's own, each in creation order. */
function everyTable(): Promise<Record<string, Row[]>> {
  return t.query(async ({ tx }) => {
    const rows: Record<string, Row[]> = {};
    for (const table of everyPgTable.filter((each) => !servicesOwn.has(getTableName(each)))) {
      const columns = getTableColumns(table);
      rows[getTableName(table)] = (await tx.select().from(table).orderBy(asc(columns._creationTime!), asc(columns._id!))).map((row) => toDocument<Row>(table, row));
    }
    return rows;
  });
}

async function exposuresOf(...flags: string[]) {
  return (await t.seed.all("flagExposures")).filter(({ flag }) => flags.includes(flag)).map(({ flag, member, value }) => ({ flag, member, value }));
}

// The front door answers 500 when a registered handler fails, and the test would go on as if the event did nothing. A
// failure that reached a stub still waits, as at the stub; any other answer but 200 fails the test as itself.
async function delivered(response: Response | Promise<Response>): Promise<void> {
  const { status } = await response;
  if (status === 200) return;
  const failure = t.logs.findLast(({ message }) => message === "slack request failed");
  if (failure?.fields.error === "NotPortedError") throw notPorted("slack.frontDoor.handler");
  throw new Error(`The front door answered ${status}`);
}

// The front door acknowledges an event or click no domain registered a handler for and takes nothing in, so a kudos, an
// App Home opening or a click sent before the stack that handles it lands would go nowhere: until then it ends here, as
// at a stub.
function handledByTheFrontDoor(kind: { event: EventKind } | { click: ClickKind }) {
  const [handlers, name] = "event" in kind ? [serviceRegistry.slack.events, kind.event] : [serviceRegistry.slack.clicks, kind.click];
  if (!Object.hasOwn(handlers ?? {}, name)) throw notPorted(`slack.${"event" in kind ? "events" : "clicks"}.${name}`);
}
