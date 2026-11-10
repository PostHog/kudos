// A member opens App Home: today's convex/slack/appHome.test.ts, on the service's test backend. The opening goes through
// the front door to S17's `homeOpened` handler, which reports it and enqueues `publishHome`; the kudos and the clicks go
// through the front door too, guarded until the stacks that handle them register. Today's `settle` ran every scheduled
// function, its fake timers moving to each; here `settle` runs every job, the app's clock moving to each next one.
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, routedFetch } from "../../testing/fakePostHog.ts";
import { httpStatus, rateLimitedFor } from "../../testing/fakeSlack.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { appHomeOpened, emoji, mention, messageEvent, section } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { jobs } from "../db/schema/service.ts";
import { notPorted } from "../notPorted.ts";
import { serviceRegistry } from "../registry.ts";
import type { ClickKind, EventKind } from "./frontDoor.ts";
import { signInWorkspace } from "./signIn.ts";

const now = new Date("2026-10-13T10:00:00Z");
const hourMs = 60 * 60 * 1000;

// What each step reaches past this stack's handlers:
// - an opening: the handler's usage fact (S14) and xp-levels switch (S6), and the publish's Slack lookups (S3), the
//   home's facts (S4) and the home shown (S5);
const opening: Stack[] = ["S3", "S4", "S5", "S6", "S14"];
// - a kudos through Slack, whose events every domain's subscribers take (S4 to S14);
const giving: Stack[] = ["S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14"];
// - the website's front door: the website flag (S15) and the unlock path (S16);
const frontDoor: Stack[] = ["S15", "S16"];
// - a click in App Home: the home click's handler and its commands (S4) and the home it republishes (S5);
const clicking: Stack[] = ["S4", "S5"];
// - the Messages tab, which the front door takes as a message: the message's handler (S4).
const messagesTab: Stack[] = ["S4"];

function stacks(...steps: Stack[][]): [Stack, ...Stack[]] {
  const all = [...new Set(steps.flat())].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return all as [Stack, ...Stack[]];
}

const backend = useTestBackend({ now: now.getTime(), workspace: "T1" });

let t: TestBackend;
// Each Slack call by the app's clock: the fake's own times are real time, which the clock runs ahead of.
let calledAt: Array<{ method: string; at: number }>;

// Today's `vi.useFakeTimers({ now })` and fresh fake Slack: a backend whose clock starts at `at`.
function start(at: Date) {
  t = backend({ now: at.getTime() });
  t.slack.withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL");
  calledAt = [];
  vi.stubGlobal(
    "fetch",
    routedFetch(t.postHog, async (input, init) => {
      const method = new URL(input instanceof Request ? input.url : input).pathname.split("/").pop() ?? "";
      calledAt.push({ method, at: t.clock.now() });
      return t.slack.fetch(input, init);
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  start(now);
});

afterEach(() => void vi.unstubAllEnvs());

describe("R45 R46: a member opens App Home", () => {
  waitsOn(stacks(opening), "before any award it shows a full allowance, nothing given or received, and how to give", async () => {
    const response = await openHome("U_BOB");

    expect(response.status).toBe(200);
    expect(publishedHome("U_BOB")).toEqual([
      "header: Your kudos",
      "section: You have *3* kudos left today. You get *3* more at midnight.",
      "divider",
      "section fields: *Given this week*\n*0* | *Received this week*\n*0* | *Given in total*\n*0* | *Received in total*\n*0*",
      "divider",
      "context: To give kudos, mention a teammate and add :taco: to your message. Each :taco: gives everyone you mention 1 kudos.",
      "context: To add me to a channel, type `/hedgehug` there.",
    ]);
  });

  waitsOn(stacks(giving, opening), "after awards it shows what is left and the kudos given and received this week and in total", async () => {
    await giveKudos("U_ALICE", "U_BOB", slackTs(now), ["taco", "taco"]);
    await giveKudos("U_BOB", "U_CAROL", slackTs(now, 1));

    await openHome("U_BOB");

    expect(allowanceIn(publishedHome("U_BOB"))).toBe("section: You have *2* kudos left today. You get *3* more at midnight.");
    expect(totalsIn(publishedHome("U_BOB"))).toBe(
      "section fields: *Given this week*\n*1* | *Received this week*\n*2* | *Given in total*\n*1* | *Received in total*\n*2*",
    );
  });

  waitsOn(stacks(giving, opening), "with nothing left it says the member has used all their kudos for today", async () => {
    await giveKudos("U_ALICE", "U_BOB", slackTs(now), ["taco", "taco", "taco"]);

    await openHome("U_ALICE");

    expect(allowanceIn(publishedHome("U_ALICE"))).toBe("section: You've used all your kudos for today. You get *3* more at midnight.");
  });

  waitsOn(stacks(giving, opening), "{left} turns at the member's local midnight, just as the next kudos message sees it", async () => {
    const beforeMidnight = new Date("2026-10-13T06:58:00Z");
    const afterMidnight = new Date("2026-10-13T07:01:00Z");
    start(beforeMidnight);
    t.slack.withMember("U_ALICE", { tz: "America/Los_Angeles" });
    await giveKudos("U_ALICE", "U_BOB", slackTs(beforeMidnight), ["taco", "taco", "taco"]);

    await openHome("U_ALICE");
    const beforeMidnightHome = allowanceIn(publishedHome("U_ALICE"));
    setTime(afterMidnight);
    await openHome("U_ALICE");
    const afterMidnightHome = allowanceIn(publishedHome("U_ALICE"));
    await giveKudos("U_ALICE", "U_BOB", slackTs(afterMidnight), ["taco", "taco", "taco"]);

    expect(beforeMidnightHome).toBe("section: You've used all your kudos for today. You get *3* more at midnight.");
    expect(afterMidnightHome).toBe("section: You have *3* kudos left today. You get *3* more at midnight.");
    expect(t.slack.reactionsOn("C1", slackTs(afterMidnight))).toEqual(["taco"]);
  });

  waitsOn(stacks(giving, opening), "the week runs Monday to Sunday in the member's time zone", async () => {
    const lastSunday = new Date("2026-10-11T12:00:00Z");
    const sundayEveningInUtc = new Date("2026-10-18T14:00:00Z");
    const mondayInTokyo = new Date("2026-10-18T16:00:00Z");
    start(lastSunday);
    t.slack.withMember("U_BOB", { tz: "Asia/Tokyo" });
    await giveKudos("U_ALICE", "U_BOB", slackTs(lastSunday));
    setTime(sundayEveningInUtc);
    await giveKudos("U_ALICE", "U_BOB", slackTs(sundayEveningInUtc), ["taco", "taco"]);
    setTime(mondayInTokyo);

    await openHome("U_ALICE");
    await openHome("U_BOB");

    expect(totalsIn(publishedHome("U_ALICE"))).toBe(
      "section fields: *Given this week*\n*2* | *Received this week*\n*0* | *Given in total*\n*3* | *Received in total*\n*0*",
    );
    expect(totalsIn(publishedHome("U_BOB"))).toBe(
      "section fields: *Given this week*\n*0* | *Received this week*\n*0* | *Given in total*\n*0* | *Received in total*\n*3*",
    );
  });

  waitsOn(stacks(opening), "it names the workspace emoji and base in force", async () => {
    await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "pizza", baseAllowance: 5 });

    await openHome("U_BOB");

    expect(allowanceIn(publishedHome("U_BOB"))).toBe("section: You have *5* kudos left today. You get *5* more at midnight.");
    expect(publishedHome("U_BOB")).toContain(
      "context: To give kudos, mention a teammate and add :pizza: to your message. Each :pizza: gives everyone you mention 1 kudos.",
    );
  });
});

describe("R47: someone who isn't a member opens App Home", () => {
  for (const [who, user, profile] of [
    ["a deactivated person", "U_GONE", { deleted: true }],
    ["a person from another workspace", "U_GUEST", { team_id: "T_OTHER" }],
    ["a bot", "U_HELPER", { is_bot: true }],
  ] as const) {
    waitsOn(stacks(opening), `${who} sees the members-only line`, async () => {
      t.slack.withMember(user, profile);

      await openHome(user);

      expect(publishedHome(user)).toEqual(["header: HedgeHug", "section: HedgeHug is for active members of this workspace."]);
    });
  }
});

describe("WS28: App Home links to the website while it is open", () => {
  const siteUrl = "https://kudos-site.test";
  const websiteLink = "section: <https://kudos-site.test/?src=app-home|Open HedgeHug on the web>";
  const homeWithoutLink = [
    "header: Your kudos",
    "section: You have *3* kudos left today. You get *3* more at midnight.",
    "divider",
    "section fields: *Given this week*\n*0* | *Received this week*\n*0* | *Given in total*\n*0* | *Received in total*\n*0*",
    "divider",
    "context: To give kudos, mention a teammate and add :taco: to your message. Each :taco: gives everyone you mention 1 kudos.",
    "context: To add me to a channel, type `/hedgehug` there.",
  ];

  beforeEach(() => {
    // Today's `postHogDeciding()`: the analytics settings, flags key included, for the sandbox.
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
    vi.stubEnv("POSTHOG_HOST", postHogHost);
    vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
    vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
    vi.stubEnv("SITE_URL", siteUrl);
  });

  function websiteButtonsOf(user: string) {
    return publishedHomeBlocks(user)
      .filter((block) => block.type === "actions")
      .flatMap((block) => block.elements as Array<{ text: { text: string }; url?: string }>)
      .flatMap(({ text, url }) => (url === undefined ? [] : [{ label: text.text, url }]));
  }

  // Today's `flagsFromPostHog` with these flags on for everyone, then `website.flag.prepareWebsiteFlag`: the sign-in
  // workspace's key made.
  async function backendWithWebsite(...flagKeys: string[]) {
    await definitionsStored(t.operations, ...flagKeys.map(onForEveryone));
    const workspace = signInWorkspace();
    if (workspace !== undefined) await t.run((ctx) => workspaceKeyOf(ctx, workspace));
  }

  waitsOn(stacks(opening, frontDoor), "while the website flag is on and SITE_URL is set, a member's Home is the front door, its button opening the site's root and carrying no identity", async () => {
    await backendWithWebsite("website");

    await openHome("U_BOB");

    expect(publishedHome("U_BOB")).toEqual([
      "header: Your kudos",
      "section: You have *3* kudos left today. You get *3* more at midnight.",
      "divider",
      "actions: Open HedgeHug",
      "divider",
      "context: To give kudos, mention a teammate and add :taco: to your message. Each :taco: gives everyone you mention 1 kudos.",
      "context: To add me to a channel, type `/hedgehug` there.",
    ]);
    expect(websiteButtonsOf("U_BOB")).toEqual([{ label: "Open HedgeHug", url: `${siteUrl}/?src=app-home` }]);
  });

  waitsOn(stacks(opening, frontDoor, clicking), "with the Everyone board, Profile's buttons and the Settings tab's closing link lead to the site, the tab App Home reopens on included", async () => {
    await backendWithWebsite("website", "everyone-board");
    await openHome("U_BOB");
    const profileTab = publishedHome("U_BOB");
    const profileButtons = websiteButtonsOf("U_BOB");

    await click("U_BOB", "Settings");
    const settingsTab = publishedHome("U_BOB");
    await openHome("U_BOB");
    const reopened = publishedHome("U_BOB");

    expect(profileTab.slice(0, 2)).toEqual(["actions: [Profile] | Settings", "header: Your kudos"]);
    expect(profileButtons).toEqual([
      { label: "Open HedgeHug", url: `${siteUrl}/?src=app-home` },
      { label: "Leaderboard", url: `${siteUrl}/leaderboard?src=app-home` },
    ]);
    expect([settingsTab, reopened].map((home) => [home[1], home.slice(-2)])).toEqual([
      ["header: Settings", ["divider", websiteLink]],
      ["header: Settings", ["divider", websiteLink]],
    ]);
    expect(reopened.filter((line) => line === websiteLink)).toHaveLength(1);
  });

  waitsOn(stacks(opening, frontDoor), "a SITE_URL ending in a slash still links to one root", async () => {
    vi.stubEnv("SITE_URL", `${siteUrl}/`);
    await backendWithWebsite("website");

    await openHome("U_BOB");

    expect(websiteButtonsOf("U_BOB")).toEqual([{ label: "Open HedgeHug", url: `${siteUrl}/?src=app-home` }]);
  });

  const closed: Array<{ condition: string; flags: string[]; env?: Record<string, string>; reaches: Stack[] }> = [
    { condition: "while PostHog has no website flag", flags: ["another-flag"], reaches: ["S15"] },
    { condition: "while SITE_URL is unset", flags: ["website"], env: { SITE_URL: "" }, reaches: [] },
    { condition: "while the website is open for another workspace only", flags: ["website"], env: { SLACK_WORKSPACE_ID: "T_OTHER" }, reaches: [] },
  ];

  for (const { condition, flags, env = {}, reaches } of closed) {
    waitsOn(stacks(opening, reaches), `${condition}, a member's Home is unchanged`, async () => {
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
      await backendWithWebsite(...flags);

      await openHome("U_BOB");

      expect(publishedHome("U_BOB")).toEqual(homeWithoutLink);
    });
  }

  waitsOn(stacks(opening, frontDoor), "someone who isn't a member sees only the members-only line", async () => {
    t.slack.withMember("U_GONE", { deleted: true });
    await backendWithWebsite("website");

    await openHome("U_GONE");

    expect(publishedHome("U_GONE")).toEqual(["header: HedgeHug", "section: HedgeHug is for active members of this workspace."]);
  });
});

waitsOn(stacks(opening), "R49: a redelivered App Home event is acknowledged and publishes once", async () => {
  handledByTheFrontDoor({ event: "homeOpened" });
  const opened = appHomeOpened("U_BOB", { eventTime: new Date(t.clock.now()) });

  const first = await t.send("/events", opened);
  const redelivered = await t.send("/events", opened);
  await delivered(first);
  await delivered(redelivered);
  await settle();

  expect([first.status, redelivered.status]).toEqual([200, 200]);
  expect(t.slack.callsTo("views.publish")).toHaveLength(1);
});

describe("R45: publishing App Home through Slack's failures", () => {
  waitsOn(stacks(opening), "a rate-limited publish is tried again after Slack's Retry-After", async () => {
    t.slack.answering("views.publish", rateLimitedFor(30));

    await openHome("U_BOB");

    const [rateLimitedAt, publishedAt] = timesOf("views.publish");
    expect(publishedAt! - rateLimitedAt!).toBeGreaterThanOrEqual(30_000);
    expect(publishedHome("U_BOB")[0]).toBe("header: Your kudos");
  });

  waitsOn(stacks(opening), "a person whose lookup fails is looked up again, then sees their Home", async () => {
    t.slack.answering("users.info", httpStatus(500));

    await openHome("U_BOB");

    expect(t.slack.callsTo("users.info")).toHaveLength(2);
    expect(publishedHome("U_BOB")[0]).toBe("header: Your kudos");
  });

  waitsOn(stacks(opening), "a rate-limited lookup is tried again after Slack's Retry-After", async () => {
    t.slack.answering("users.info", rateLimitedFor(30));

    await openHome("U_BOB");

    const [rateLimitedAt, lookedUpAt] = timesOf("users.info");
    expect(lookedUpAt! - rateLimitedAt!).toBeGreaterThanOrEqual(30_000);
    expect(publishedHome("U_BOB")[0]).toBe("header: Your kudos");
  });

  waitsOn(stacks(opening), "a publish that keeps failing is tried 3 times and never again", async () => {
    t.slack.answering("views.publish", httpStatus(500), httpStatus(500), httpStatus(500), httpStatus(500));

    await openHome("U_BOB");

    expect(t.slack.callsTo("views.publish")).toHaveLength(3);
  });
});

waitsOn(stacks(messagesTab), "opening the app's Messages tab publishes nothing", async () => {
  const response = await openHome("U_BOB", { tab: "messages" });

  expect(response.status).toBe(200);
  expect(t.slack.calls).toEqual([]);
});

// The front door takes an `app_home_opened` on the Messages tab as a message, as today's event route did.
async function openHome(user: string, options: Parameters<typeof appHomeOpened>[1] = {}) {
  handledByTheFrontDoor({ event: options.tab === "messages" ? "message" : "homeOpened" });
  const response = await t.send("/events", appHomeOpened(user, { eventTime: new Date(t.clock.now()), ...options }));
  await delivered(response);
  await settle();
  return response;
}

async function click(user: string, label: string) {
  handledByTheFrontDoor({ click: "homeClick" });
  await delivered(t.interaction(blockActions(user, buttonInHome(user, label))));
  await settle();
}

async function giveKudos(giver: string, recipient: string, ts: string, kudosEmoji = ["taco"]) {
  handledByTheFrontDoor({ event: "message" });
  const blocks = [section(mention(recipient), ...kudosEmoji.map((name) => emoji(name)))];
  await delivered(t.send("/events", messageEvent(blocks, { user: giver, ts })));
  await settle();
}

function allowanceIn(home: string[]) {
  return home.find((line) => line.startsWith("section: You"));
}

function totalsIn(home: string[]) {
  return home.find((line) => line.startsWith("section fields: *Given this week*"));
}

function slackTs(at: Date, secondsLater = 0) {
  return `${Math.floor(at.getTime() / 1000) + secondsLater}.000100`;
}

// Today's `vi.setSystemTime(at)`, which here only moves the app's clock forward.
function setTime(at: Date) {
  t.time.advance(at.getTime() - t.clock.now());
}

function timesOf(method: string) {
  return calledAt.filter((call) => call.method === method).map(({ at }) => at);
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
