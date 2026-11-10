// The App Home tab bar shows each tab only while its own flag is on: today's convex/slack/homeTabBar.test.ts, on the
// service's test backend. The kudos, the openings and the clicks go through the front door, guarded until the stacks
// that handle them register; the flags are the definitions stored as PostHog serves them. Today's `settle` ran every
// scheduled function, its fake timers moving to each; here `settle` runs every job, the app's clock moving to each next one.
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { appHomeOpened, emoji, mention, messageEvent, section } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { jobs } from "../db/schema/service.ts";
import { notPorted } from "../notPorted.ts";
import { serviceRegistry } from "../registry.ts";
import type { ClickKind, EventKind } from "./frontDoor.ts";

const now = new Date("2026-10-13T10:00:00Z");
const hourMs = 60 * 60 * 1000;
const board = "everyone-board";
const xpLevels = "xp-levels";

// What each step reaches past this stack's handlers:
// - a kudos through Slack, whose events every domain's subscribers take (S4 to S14);
const giving: Stack[] = ["S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14"];
// - an opening: the handler's usage fact (S14) and xp-levels switch (S6), and the publish's Slack lookups (S3), the
//   home's facts (S4) and the home shown (S5);
const opening: Stack[] = ["S3", "S4", "S5", "S6", "S14"];
// - a click in App Home: the home click's handler and its commands (S4) and the home it republishes (S5).
const clicking: Stack[] = ["S4", "S5"];

function stacks(...steps: Stack[][]): [Stack, ...Stack[]] {
  const all = [...new Set(steps.flat())].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return all as [Stack, ...Stack[]];
}

const coreHome = [
  "header: Your kudos",
  "section: You have *8* kudos left today. You get *10* more at midnight.",
  "divider",
  "section fields: *Given this week*\n*2* | *Received this week*\n*0* | *Given in total*\n*2* | *Received in total*\n*0*",
  "divider",
  "context: To give kudos, mention a teammate and add :taco: to your message. Each :taco: gives everyone you mention 1 kudos.",
  "context: To add me to a channel, type `/hedgehug` there.",
];

const levelLine = "section fields: *Level*\n*2* | *XP to level 3*\n*80*";
const leaderboardSwitch = "section: *Show me on the leaderboards*";
const muteNotices = "section: I'll celebrate your level ups in public once your workspace picks a channel. [button: Mute notices]";
const dms = "section: I send you a DM when you reach a level. [button: Turn off DMs]";

const backend = useTestBackend({ now: now.getTime(), workspace: "T1" });

let t: TestBackend;
let sentMessages = 0;

beforeEach(() => {
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  // Today's `postHogDeciding()`: the analytics settings, flags key included, for the sandbox.
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  t = backend();
  t.slack.withMember("U_ALICE").withMember("U_BOB");
  sentMessages = 0;
});

afterEach(() => void vi.unstubAllEnvs());

type Flags = { board: boolean; xp: boolean };

const flagsOf = ({ board: boardOn, xp }: Flags) => [boardOn ? onForEveryone(board) : offForEveryone(board), xp ? onForEveryone(xpLevels) : offForEveryone(xpLevels)];

describe("the App Home tab bar shows each tab only while its own flag is on", () => {
  waitsOn(stacks(giving, opening), "with both flags off there is no tab bar, and App Home is the core loop's", async () => {
    await workspaceWith({ board: false, xp: false });

    await openHome("U_ALICE");

    expect(publishedHome("U_ALICE")).toEqual(coreHome);
  });

  for (const [name, flags, admin, tabBar] of [
    ["everyone-board alone", { board: true, xp: false }, false, "actions: [Profile] | Leaderboard | Settings"],
    ["everyone-board alone, for an admin", { board: true, xp: false }, true, "actions: [Profile] | Leaderboard | Settings"],
    ["xp-levels alone", { board: false, xp: true }, false, "actions: [Profile] | Settings"],
    ["xp-levels alone, for an admin", { board: false, xp: true }, true, "actions: [Profile] | Settings | Admin"],
    ["both flags", { board: true, xp: true }, false, "actions: [Profile] | Leaderboard | Settings"],
    ["both flags, for an admin", { board: true, xp: true }, true, "actions: [Profile] | Leaderboard | Settings | Admin"],
  ] as Array<[string, Flags, boolean, string]>) {
    waitsOn(stacks(giving, opening), `with ${name}, the tab bar sits above the Profile tab`, async () => {
      await workspaceWith(flags, { admin });

      await openHome("U_ALICE");

      expect(publishedHome("U_ALICE").slice(0, 2)).toEqual([tabBar, "header: Your kudos"]);
    });
  }

  for (const [name, flags, levelShown] of [
    ["everyone-board alone", { board: true, xp: false }, false],
    ["xp-levels alone", { board: false, xp: true }, true],
    ["both flags", { board: true, xp: true }, true],
  ] as Array<[string, Flags, boolean]>) {
    waitsOn(stacks(giving, opening), `with ${name}, the Profile tab shows the level only while xp-levels is on`, async () => {
      await workspaceWith(flags);

      await openHome("U_ALICE");

      expect(publishedHome("U_ALICE").includes(levelLine)).toBe(levelShown);
    });
  }

  for (const [name, flags, switches] of [
    ["everyone-board alone", { board: true, xp: false }, [leaderboardSwitch]],
    ["xp-levels alone", { board: false, xp: true }, [muteNotices, dms]],
    ["both flags", { board: true, xp: true }, [leaderboardSwitch, muteNotices, dms]],
  ] as Array<[string, Flags, string[]]>) {
    waitsOn(stacks(giving, opening, clicking), `with ${name}, the Settings tab shows the switches of the flags that are on`, async () => {
      await workspaceWith(flags);
      await openHome("U_ALICE");

      await click("U_ALICE", "Settings");

      expect(publishedHome("U_ALICE").filter((line) => [leaderboardSwitch, muteNotices, dms].includes(line))).toEqual(switches);
    });
  }

  for (const [tab, flag, turnedOff, tabBar] of [
    ["Leaderboard", "everyone-board", [offForEveryone(board), onForEveryone(xpLevels)], "actions: [Profile] | Settings | Admin"],
    ["Admin", "xp-levels", [onForEveryone(board), offForEveryone(xpLevels)], "actions: [Profile] | Leaderboard | Settings"],
  ] as Array<[string, string, FlagDefinition[], string]>) {
    waitsOn(stacks(giving, opening, clicking, tab === "Leaderboard" ? ["S11"] : []), `a member left on the ${tab} tab opens App Home on Profile once ${flag} is off`, async () => {
      await workspaceWith({ board: true, xp: true }, { admin: true });
      await openHome("U_ALICE");
      await click("U_ALICE", tab);

      await definitionsStored(t.operations, ...turnedOff);
      await openHome("U_ALICE");

      expect(publishedHome("U_ALICE").slice(0, 3)).toEqual([tabBar, "header: Your kudos", "section: You have *8* kudos left today. You get *10* more at midnight."]);
    });
  }
});

async function workspaceWith(flags: Flags, { admin = false } = {}) {
  if (admin) t.slack.withMember("U_ALICE", { is_admin: true });
  await definitionsStored(t.operations, ...flagsOf(flags));
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 });
  await giveKudos("U_ALICE", "U_BOB", 2);
}

async function giveKudos(giver: string, recipient: string, kudos: number) {
  handledByTheFrontDoor({ event: "message" });
  sentMessages += 1;
  const blocks = [section(mention(recipient), ...Array.from({ length: kudos }, () => emoji("taco")))];
  await delivered(t.send("/events", messageEvent(blocks, { user: giver, ts: `${now.getTime() / 1000 + sentMessages}.000100` })));
  await settle();
}

async function openHome(user: string) {
  handledByTheFrontDoor({ event: "homeOpened" });
  await delivered(t.send("/events", appHomeOpened(user, { eventTime: new Date(t.clock.now()) })));
  await settle();
}

async function click(user: string, label: string) {
  handledByTheFrontDoor({ click: "homeClick" });
  const response = await t.interaction(blockActions(user, buttonInHome(user, label)));
  await delivered(response);
  expect(response.status).toBe(200);
  await settle();
}

// The front door acknowledges an event or click no domain registered a handler for and takes nothing in, so a kudos, an
// App Home opening or a click sent before the stack that handles it lands would go nowhere: until then it ends here, as
// at a stub.
function handledByTheFrontDoor(kind: { event: EventKind } | { click: ClickKind }) {
  const [handlers, name] = "event" in kind ? [serviceRegistry.slack.events, kind.event] : [serviceRegistry.slack.clicks, kind.click];
  if (!Object.hasOwn(handlers ?? {}, name)) throw notPorted(`slack.${"event" in kind ? "events" : "clicks"}.${name}`);
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

/**
 * Runs every job, moving the app's clock to each next one, as today's `settle` ran every scheduled function under fake
 * timers: within an hour, the longest a delivery waits for its next try.
 */
async function settle() {
  const until = t.clock.now() + hourMs;
  for (;;) {
    await t.settle();
    const [next] = await t.query(({ tx }) => tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt), asc(jobs._id)).limit(1));
    if (next === undefined || next.runAt > until || next.runAt <= t.clock.now()) break;
    t.time.advance(next.runAt - t.clock.now());
  }
}

// App Home: today's testing/slackInteractions.ts, as far as these tests read and click it.
type TextObject = { type: string; text: string };
type Element = { type: string; text?: TextObject; action_id?: string; value?: string; url?: string; style?: string };
type Block = { type: string; block_id?: string; text?: TextObject; fields?: TextObject[]; elements?: Array<TextObject | Element>; accessory?: Element };
type BlockAction = { type: "button"; action_id: string; value?: string; block_id?: string };

function publishedHomeBlocks(user: string): Block[] {
  const view = t.slack.homeShownTo(user) as { type: string; blocks: Block[] } | undefined;
  expect(view?.type).toBe("home");
  return view?.blocks ?? [];
}

function publishedHome(user: string) {
  return publishedHomeBlocks(user).map(readBlock);
}

function readBlock(block: Block) {
  if (block.type === "divider") return "divider";
  if (block.type === "header") return `header: ${block.text?.text}`;
  if (block.type === "actions") return `actions: ${(block.elements as Element[]).map((button) => (button.style === "primary" ? `[${button.text?.text}]` : button.text?.text)).join(" | ")}`;
  if (block.type === "context") return `context: ${(block.elements as TextObject[]).map(({ text }) => text).join(" ")}`;
  if (block.fields) return `${block.type} fields: ${block.fields.map(({ text }) => text).join(" | ")}`;
  const accessory = block.accessory?.type === "button" ? (block.accessory.url === undefined ? ` [button: ${block.accessory.text?.text}]` : ` [link: ${block.accessory.text?.text} ${block.accessory.url}]`) : "";
  return `${block.type}: ${block.text?.text}${accessory}`;
}

function buttonInHome(user: string, label: string): BlockAction {
  for (const block of publishedHomeBlocks(user)) {
    const elements = [...(block.type === "actions" ? (block.elements as Element[]) : []), ...(block.accessory ? [block.accessory] : [])];
    const button = elements.find((element) => element.type === "button" && element.text?.text === label);
    if (button) return { type: "button", action_id: button.action_id!, ...(button.value !== undefined && { value: button.value }), ...(block.block_id && { block_id: block.block_id }) };
  }
  throw new Error(`no ${label} button among the blocks`);
}

let interactions = 0;

function blockActions(user: string, action: BlockAction) {
  interactions += 1;
  return {
    type: "block_actions",
    team: { id: "T1", domain: "kudos" },
    user: { id: user, team_id: "T1" },
    api_app_id: "A_KUDOS",
    trigger_id: `${interactions}.1760349600.trigger`,
    container: { type: "view", view_id: "V_HOME" },
    view: { id: "V_HOME", type: "home" },
    actions: [{ block_id: "b1", ...action, action_ts: "1760349600.000300" }],
  };
}
