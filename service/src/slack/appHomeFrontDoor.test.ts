// App Home is the website's front door: today's convex/slack/frontDoor.test.ts, on the service's test backend, under a
// name beside the service's own front door test. The kudos, the openings and the clicks go through the front door,
// guarded until the stacks that handle them register; the flags are the definitions stored as PostHog serves them.
// Today's `settle` ran every scheduled function, its fake timers moving to each; here `settle` runs every job, the app's
// clock moving to each next one. Rows today's tests wrote with `ctx.db` are seeded; functions they called run as the
// service's own.
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEmails, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { appHomeOpened, emoji, mention, messageEvent, section, text } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { jobs } from "../db/schema/service.ts";
import { isOnTheBoards } from "../leaderboard/visibility.ts";
import { notPorted } from "../notPorted.ts";
import { recordReward } from "../progression/progression.ts";
import type { QuestId } from "../quests/pool.ts";
import { serviceRegistry } from "../registry.ts";
import { makeReady } from "../unlocks/unlocks.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { ClickKind, EventKind } from "./frontDoor.ts";
import { signInWorkspace } from "./signIn.ts";
import { syncUserGroups } from "./userGroups.ts";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const hourMs = 60 * 60 * 1000;
const siteUrl = "https://kudos-site.test";
const alicesEmail = "alice@example.com";
const saysWhy = "thanks for untangling the release notes today";
const sayingWhyThreeWays: QuestId[] = ["say-why", "say-why-twice", "say-why-three-times"];
const everyFlag = ["xp-levels", "unlocks", "quests", "everyone-board", "skill-tree"];
const openOnTheWeb = (path: string) => `[link: Open ${fromAppHome(`${siteUrl}${path}`)}]`;
const onTheWebLine = "You can change this on the web, too.";
const sectionOnTheWeb = (label: string, section: string, entry = "") => `section: ${onTheWebLine} [link: ${label} ${siteUrl}${entry}/settings?section=${section}&src=app-home]`;
const inventoryLine = "Your inventory is on the web, too.";
const inventoryOnTheWeb = `section: ${inventoryLine} [link: Inventory ${siteUrl}/?src=app-home]`;
const hints = [
  "context: To give kudos, mention a teammate and add :taco: to your message. Each :taco: gives everyone you mention 1 kudos.",
  "context: To add me to a channel, type `/hedgehug` there.",
];

// What each step reaches past this stack's handlers:
// - the workspace: unlocks shipped before anyone joined (S6);
const shipping: Stack[] = ["S6"];
// - a kudos through Slack, whose events every domain's subscribers take (S4 to S14);
const giving: Stack[] = ["S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14"];
// - an opening: the handler's usage fact (S14) and xp-levels switch (S6), and the publish's Slack lookups (S3), the
//   home's facts (S4) and the home shown (S5);
const opening: Stack[] = ["S3", "S4", "S5", "S6", "S14"];
// - the website's front door: the website flag (S15) and the unlock path (S16);
const frontDoor: Stack[] = ["S15", "S16"];
// - a click in App Home: the home click's handler and its commands (S4) and the home it republishes (S5);
const clicking: Stack[] = ["S4", "S5"];
// - a level reached: unlocks' makeReady (S6);
const levelling: Stack[] = ["S6"];
// - the workspace's user groups: the sync (S11); the leaderboards' visibility (S11); a reward recorded (S6).
const grouping: Stack[] = ["S11"];

function stacks(...steps: Stack[][]): [Stack, ...Stack[]] {
  const all = [...new Set(steps.flat())].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return all as [Stack, ...Stack[]];
}

// Every step a test of the summary takes: the workspace, a member at level three with quests drawn, and App Home.
const summary = stacks(shipping, giving, levelling, opening, frontDoor);

const backend = useTestBackend({ now: tuesday, workspace: "T1" });

let t: TestBackend;
let sentMessages = 0;

beforeEach(() => {
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("SITE_URL", siteUrl);
  // Today's `flagsOnForEveryone(slack.fetch)`: the analytics settings, flags key included, for the sandbox.
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  t = backend();
  t.slack.withMember("U_ALICE").withMember("U_BOB");
  sentMessages = 0;
});

afterEach(() => void vi.unstubAllEnvs());

describe("SW19 SW20 SW21 SW22: App Home is the website's front door while the website's link function answers a link", () => {
  waitsOn(summary, "a member who opened Quests and the Leaderboard sees the summary: allowance, one level line, and buttons to Home, the Leaderboard and Quests", async () => {
    await workspace(...everyFlag, "website");
    await levelThreeWithQuestsDrawn();
    await openReadyFeatures();
    await giveKudos("U_ALICE", "U_BOB", saysWhy);

    expect(publishedHome("U_ALICE")).toEqual([
      "actions: [Profile] | Settings",
      "header: Your kudos",
      "section: You have *8* kudos left today. You get *10* more at midnight.",
      "section: Level 3 · 190 XP to level 4",
      "divider",
      "actions: Open HedgeHug | Leaderboard | Quests",
      "divider",
      ...hints,
    ]);
    expect(publishedHomeBlocks("U_ALICE").filter((block) => readBlocks([block])[0] === "actions: Open HedgeHug | Leaderboard | Quests")).toEqual([
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Open HedgeHug" }, url: `${siteUrl}/?src=app-home`, action_id: "website-link-0" },
          { type: "button", text: { type: "plain_text", text: "Leaderboard" }, url: `${siteUrl}/leaderboard?src=app-home`, action_id: "website-link-1" },
          { type: "button", text: { type: "plain_text", text: "Quests" }, url: `${siteUrl}/?src=app-home`, action_id: "website-link-2" },
        ],
      },
    ]);
  }, 30_000);

  waitsOn(summary, "a member who hasn't opened the Leaderboard sees it ready with Open, and a button to Home only", async () => {
    await workspace(...everyFlag, "website");
    await levelThreeWithQuestsDrawn();

    const home = publishedHome("U_ALICE");

    expect(home).toContain(`section: *Leaderboard* is ready. ${openOnTheWeb("/leaderboard")}`);
    expect(home).not.toContain("actions: [Profile] | Leaderboard | Settings");
    expect(linkButtonsIn(publishedHomeBlocks("U_ALICE"))).toEqual([{ label: "Open HedgeHug", url: `${siteUrl}/?src=app-home` }]);
  }, 30_000);

  waitsOn(stacks(shipping, opening, frontDoor), "before unlocks apply, the Leaderboard counts as open while the Everyone board is shown, and the summary has no level line", async () => {
    await workspace("everyone-board", "website");

    await openHome("U_ALICE");

    expect(publishedHome("U_ALICE")).toEqual([
      "actions: [Profile] | Settings",
      "header: Your kudos",
      "section: You have *10* kudos left today. You get *10* more at midnight.",
      "divider",
      "actions: Open HedgeHug | Leaderboard",
      "divider",
      ...hints,
    ]);
    expect(linkButtonsIn(publishedHomeBlocks("U_ALICE")).map(({ url }) => url)).toEqual([`${siteUrl}/?src=app-home`, `${siteUrl}/leaderboard?src=app-home`]);
  }, 30_000);

  waitsOn(stacks(shipping, giving, opening, frontDoor), "from level 5 the level line names the skill points to spend while the skill tree ships", async () => {
    await workspace("xp-levels", "website", "skill-tree");
    await giveKudos("U_ALICE", "U_BOB", saysWhy);
    await xpOf("U_ALICE", 600);

    await openHome("U_ALICE");

    expect(publishedHome("U_ALICE")).toContain("section: Level 5 · 400 XP to level 6 · 1 skill point to spend");
  }, 30_000);

  waitsOn(stacks(shipping, giving, opening, frontDoor), "AL35: while the skill tree doesn't ship, the level line names no skill points", async () => {
    await workspace("xp-levels", "website");
    await giveKudos("U_ALICE", "U_BOB", saysWhy);
    await xpOf("U_ALICE", 600);

    await openHome("U_ALICE");

    expect(publishedHome("U_ALICE")).toContain("section: Level 5 · 400 XP to level 6");
  }, 30_000);

  waitsOn(stacks(shipping, opening, clicking, grouping, frontDoor), "a remembered Leaderboard tab opens as Profile once the front door shows", async () => {
    await workspace("everyone-board");
    await openHome("U_ALICE");
    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Leaderboard")));
    expect(publishedHome("U_ALICE")[1]).toBe("header: Leaderboard");
    await definitionsStored(t.operations, onForEveryone("everyone-board"), onForEveryone("website"));
    await prepareWebsiteFlag();

    await openHome("U_ALICE");

    expect(publishedHome("U_ALICE").slice(0, 2)).toEqual(["actions: [Profile] | Settings", "header: Your kudos"]);
  }, 30_000);

  waitsOn(stacks(summary, clicking), "a member who opened the Book and the Skill tree has no tab for either, and buttons to both pages instead", async () => {
    await workspace(...everyFlag, "achievements", "website");
    await everyFeatureOpenedAtLevelFive();

    await openHome("U_ALICE");

    expect(publishedHome("U_ALICE")[0]).toBe("actions: [Profile] | Settings");
    expect(linkButtonsIn(publishedHomeBlocks("U_ALICE"))).toEqual([
      { label: "Open HedgeHug", url: `${siteUrl}/?src=app-home` },
      { label: "Book", url: `${siteUrl}/?src=app-home` },
      { label: "Leaderboard", url: `${siteUrl}/leaderboard?src=app-home` },
      { label: "Quests", url: `${siteUrl}/?src=app-home` },
      { label: "Skill tree", url: `${siteUrl}/?src=app-home` },
    ]);
  }, 30_000);

  for (const tab of ["Book", "Skill tree"]) {
    waitsOn(stacks(summary, clicking), `a remembered ${tab} tab opens as Profile once the front door shows, and its tab switch from an earlier view shows Profile`, async () => {
      await workspace(...everyFlag, "achievements");
      await everyFeatureOpenedAtLevelFive();
      await openHome("U_ALICE");
      const switchToTab = buttonInHome("U_ALICE", tab);
      await send(blockActions("U_ALICE", switchToTab));
      expect(publishedHome("U_ALICE")[1]).toBe(`header: ${tab}`);
      await definitionsStored(t.operations, ...[...everyFlag, "achievements", "website"].map(onForEveryone));
      await prepareWebsiteFlag();

      await openHome("U_ALICE");
      const remembered = publishedHome("U_ALICE").slice(0, 2);
      await send(blockActions("U_ALICE", switchToTab));

      expect(remembered).toEqual(["actions: [Profile] | Settings", "header: Your kudos"]);
      expect(publishedHome("U_ALICE").slice(0, 2)).toEqual(["actions: [Profile] | Settings", "header: Your kudos"]);
    }, 30_000);
  }

  waitsOn(stacks(shipping, opening, clicking, frontDoor), "Settings links each setting that has a section on the website's Settings page to that section, the notice switches having none, and Admin is today's tab, each ending with the link to the website", async () => {
    t.slack.withMember("U_ALICE", { is_admin: true });
    await workspace("xp-levels", "everyone-board", "website");
    await openHome("U_ALICE");

    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));
    const settings = publishedHome("U_ALICE");
    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Admin")));
    const admin = publishedHome("U_ALICE");

    const websiteLink = `section: <${siteUrl}/?src=app-home|Open HedgeHug on the web>`;
    expect(settings).toEqual([
      "actions: Profile | [Settings] | Admin",
      "header: Settings",
      "section: *Show me on the leaderboards*",
      "actions: [On] | Off",
      "context: When it's off, nobody sees you on the leaderboards, you included.",
      sectionOnTheWeb("Leaderboards", "visibility"),
      "divider",
      "section: I'll celebrate your level ups in public once your workspace picks a channel. [button: Mute notices]",
      "section: I send you a DM when you reach a level. [button: Turn off DMs]",
      "divider",
      websiteLink,
    ]);
    expect(admin.slice(0, 2)).toEqual(["actions: Profile | Settings | [Admin]", "header: Admin"]);
    expect(admin.slice(-2)).toEqual(["divider", websiteLink]);
  }, 30_000);

  waitsOn(stacks(shipping, opening, clicking, frontDoor), "each section link names what it changes on the Settings page to screen readers, and clicking it runs no command and publishes App Home no more", async () => {
    await workspace("xp-levels", "everyone-board", "website");
    await openHome("U_ALICE");
    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));
    const published = publishedViews("U_ALICE").length;

    const response = await send(buttonBeside(onTheWebLine, "Leaderboards"));

    expect(accessoryBeside(onTheWebLine)).toEqual({
      type: "button",
      text: { type: "plain_text", text: "Leaderboards" },
      url: `${siteUrl}/settings?section=visibility&src=app-home`,
      action_id: "website-link:settings:visibility",
      accessibility_label: "Change whether you show on the leaderboards on HedgeHug's Settings page",
    });
    expect(response.status).toBe(200);
    expect(publishedViews("U_ALICE")).toHaveLength(published);
  }, 30_000);

  waitsOn(stacks(shipping, opening, clicking, grouping, frontDoor), "Slack's settings still work beside the link: switching the leaderboards off hides the member and keeps the link", async () => {
    await workspace("xp-levels", "everyone-board", "website");
    await openHome("U_ALICE");
    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));

    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Off")));

    expect(publishedHome("U_ALICE").slice(1, 6)).toEqual([
      "header: Settings",
      "section: *Show me on the leaderboards*",
      "actions: On | [Off]",
      "context: When it's off, nobody sees you on the leaderboards, you included.",
      sectionOnTheWeb("Leaderboards", "visibility"),
    ]);
    expect(await onTheBoards("U_ALICE")).toBe(false);
  }, 30_000);

  waitsOn(stacks(shipping, opening, clicking, frontDoor), "what I send you ends with a link to the Settings page's messages section, and the leaderboards with theirs", async () => {
    await workspace("xp-levels", "everyone-board", "message-settings", "website");
    await openHome("U_ALICE");

    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));

    const home = publishedHome("U_ALICE");
    expect(areaOf(home, "section: *Show me on the leaderboards*").at(-1)).toBe(sectionOnTheWeb("Leaderboards", "visibility"));
    expect(areaOf(home, "section: *What I send you*").at(-1)).toBe(sectionOnTheWeb("Messages", "messages"));
    expect(accessoryOf(`${siteUrl}/settings?section=messages&src=app-home`)).toMatchObject({ action_id: "website-link:settings:messages", accessibility_label: "Change what I send you on HedgeHug's Settings page" });
  }, 30_000);

  waitsOn(stacks(shipping, grouping, opening, clicking, frontDoor), "while the primary-group picker shows, it ends with a link to the Settings page's group section", async () => {
    t.slack.withUserGroup("S_GARDEN", { name: "Gardeners", users: ["U_ALICE", "U_BOB"] }).withUserGroup("S_ZEBRA", { name: "Zebras", users: ["U_ALICE"] });
    await workspaceWithUserGroups("xp-levels", "groups", "website");
    await openHome("U_ALICE");

    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));

    const home = publishedHome("U_ALICE");
    const picker = home.findIndex((line) => line.startsWith("section: Which group do you count for on the leaderboard?"));
    expect(home.slice(picker + 1, picker + 3)).toEqual([sectionOnTheWeb("Your group", "group"), "divider"]);
    expect(accessoryOf(`${siteUrl}/settings?section=group&src=app-home`)).toMatchObject({ action_id: "website-link:settings:group", accessibility_label: "Change the group you count for on HedgeHug's Settings page" });
  }, 30_000);

  waitsOn(stacks(shipping, grouping, opening, clicking, frontDoor), "a setting whose section the website's Settings page hides gets no link: the group of a member in one group, and the leaderboards before the member opens the Leaderboard", async () => {
    t.slack.withUserGroup("S_GARDEN", { name: "Gardeners", users: ["U_ALICE", "U_BOB"] });
    await workspaceWithUserGroups("xp-levels", "unlocks", "everyone-board", "groups", "website");
    await openHome("U_ALICE");

    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));

    const home = publishedHome("U_ALICE");
    expect(home).toContain("section: *Show me on the leaderboards*");
    expect(home).toContain("section: You count for Gardeners on the leaderboard.");
    expect(home.filter((line) => line.includes(onTheWebLine))).toEqual([]);
  }, 30_000);

  waitsOn(stacks(shipping, opening, clicking, frontDoor), "while the website's Settings page has no setting for the member, the Settings tab has no link to it", async () => {
    await workspace("xp-levels", "website");
    await openHome("U_ALICE");

    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));

    expect(publishedHome("U_ALICE")).toEqual([
      "actions: Profile | [Settings]",
      "header: Settings",
      "section: I'll celebrate your level ups in public once your workspace picks a channel. [button: Mute notices]",
      "section: I send you a DM when you reach a level. [button: Turn off DMs]",
      "divider",
      `section: <${siteUrl}/?src=app-home|Open HedgeHug on the web>`,
    ]);
  }, 30_000);

  waitsOn(stacks(shipping, opening, clicking, frontDoor), "for a member previewing the website while it is closed for the workspace, a section link goes through the page's sign-in entry", async () => {
    t.slack.withMember("U_ALICE", { profile: { email: alicesEmail } });
    await workspace("xp-levels", "everyone-board", onForEmails("website", alicesEmail));
    await openHome("U_ALICE");

    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));

    expect(publishedHome("U_ALICE")[5]).toBe(sectionOnTheWeb("Leaderboards", "visibility", "/sign-in"));
  }, 30_000);

  waitsOn(stacks(shipping, giving, clicking, opening, frontDoor), "the Inventory tab opens with a link to the home's inventory panel above Slack's inventory, which still works, and names it to screen readers", async () => {
    await workspace("xp-levels", "unlocks", "coins", "store", "custom-kudos-emoji", "website");
    await coinsOpenedBy("U_ALICE");
    await openHome("U_ALICE");

    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Inventory")));

    expect(publishedHome("U_ALICE").slice(0, 7)).toEqual([
      "actions: Profile | [Inventory] | Settings",
      "header: Inventory",
      inventoryOnTheWeb,
      "divider",
      "section: 4 🪙",
      "divider",
      "section: *Your kudos emoji*",
    ]);
    expect(accessoryBeside(inventoryLine)).toEqual({
      type: "button",
      text: { type: "plain_text", text: "Inventory" },
      url: `${siteUrl}/?src=app-home`,
      action_id: "website-link:inventory",
      accessibility_label: "Open your inventory on HedgeHug's home page",
    });

    const alice = await memberOf("U_ALICE");
    await t.seed.insert("customKudosEmoji", { workspace: "T1", name: "shipit", url: "https://emoji.slack-edge.com/T1/shipit/0a1b2c.png", pickedAt: t.clock.now() });
    await t.run((ctx) => recordReward(ctx, "T1", { member: alice, key: "test:savings", xp: 0, coins: 96, item: null, catalogueVersion: "2", at: 0 }));
    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Inventory")));
    const published = publishedViews("U_ALICE").length;

    await send(buttonBeside(":shipit: · 100 🪙", "Buy"));

    expect(publishedViews("U_ALICE")).toHaveLength(published + 1);
    expect(publishedHome("U_ALICE").slice(2, 9)).toEqual([inventoryOnTheWeb, "divider", "section: 0 🪙", "divider", "section: *Your kudos emoji*", "section: 🦔 Hedgehog", "section: :shipit:"]);
  }, 30_000);

  waitsOn(stacks(shipping, giving, clicking, opening, frontDoor), "clicking the Inventory link changes nothing and publishes App Home no more", async () => {
    await workspace("xp-levels", "unlocks", "coins", "store", "website");
    await coinsOpenedBy("U_ALICE");
    await openHome("U_ALICE");
    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Inventory")));
    const published = publishedViews("U_ALICE").length;

    const response = await send(buttonBeside(inventoryLine, "Inventory"));

    expect(response.status).toBe(200);
    expect(publishedViews("U_ALICE")).toHaveLength(published);
    expect(publishedHome("U_ALICE")).toContain("section: 🦔 Hedgehog");
  }, 30_000);

  waitsOn(stacks(summary, clicking), "opening the ready features swaps their Open for page buttons, and a stale Open from before the links still opens its crate", async () => {
    await workspace(...everyFlag, "website");
    await levelThreeWithQuestsDrawn();
    expect(linkButtonsIn(publishedHomeBlocks("U_ALICE")).map(({ label }) => label)).toEqual(["Open HedgeHug"]);

    await openReadyFeatures();

    expect(publishedHome("U_ALICE").filter((line) => line.includes("is ready."))).toEqual([]);
    expect(linkButtonsIn(publishedHomeBlocks("U_ALICE")).map(({ label }) => label)).toEqual(["Open HedgeHug", "Leaderboard", "Quests"]);

    await send(blockActions("U_ALICE", staleButtonOf({ type: "openQuestCrate", quest: { kind: "journey", step: "first-thanks" } })));

    expect(publishedHome("U_ALICE").filter((line) => line.includes("Give a kudos that says why."))).toEqual([]);
  }, 30_000);

  const todaysHome = [
    "actions: [Profile] | Leaderboard | Settings",
    "header: Your kudos",
    "section: You have *8* kudos left today. You get *10* more at midnight.",
    "divider",
    "section fields: *Level*\n*3* | *XP to level 4*\n*190*",
    "section: Next: Skill tree at level 5.",
    "divider",
    "section fields: *Given this week*\n*2* | *Received this week*\n*0* | *Given in total*\n*2* | *Received in total*\n*0*",
    "divider",
    ...hints,
  ];

  const todaysSettings = [
    "actions: Profile | Leaderboard | [Settings]",
    "header: Settings",
    "section: *Show me on the leaderboards*",
    "actions: [On] | Off",
    "context: When it's off, nobody sees you on the leaderboards, you included.",
    "divider",
    "section: I'll celebrate your level ups in public once your workspace picks a channel. [button: Mute notices]",
    "section: I send you a DM when you reach a level. [button: Turn off DMs]",
  ];

  const todaysInventory = [
    "actions: Profile | [Inventory] | Settings",
    "header: Inventory",
    "section: 4 🪙",
    "divider",
    "section: *Your kudos emoji*",
    "section: 🦔 Hedgehog",
    "context: Each of your kudos emoji counts as a kudos, like :taco:.",
    "divider",
    "section: *Store*",
    "context: Nothing for sale right now.",
  ];

  const closed: Array<{ condition: string; website: string[]; env?: Record<string, string> }> = [
    { condition: "while the website flag is off", website: [] },
    { condition: "while SITE_URL is unset", website: ["website"], env: { SITE_URL: "" } },
    { condition: "while the website is open for another workspace only", website: ["website"], env: { SLACK_WORKSPACE_ID: "T_OTHER" } },
  ];

  for (const { condition, website, env = {} } of closed) {
    waitsOn(summary, `${condition}, a member with every other flag on sees today's App Home`, async () => {
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
      await workspace(...everyFlag, ...website);
      await levelThreeWithQuestsDrawn();
      await openReadyFeatures();
      await giveKudos("U_ALICE", "U_BOB", saysWhy);

      expect(publishedHome("U_ALICE")).toEqual(todaysHome);
    }, 30_000);
  }

  for (const { condition, website, env = {} } of closed) {
    waitsOn(stacks(summary, clicking), `${condition}, a member with every other flag on sees today's Settings tab`, async () => {
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
      await workspace(...everyFlag, ...website);
      await levelThreeWithQuestsDrawn();
      await openReadyFeatures();

      await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Settings")));

      expect(publishedHome("U_ALICE")).toEqual(todaysSettings);
    }, 30_000);
  }

  for (const { condition, website, env = {} } of closed) {
    waitsOn(stacks(shipping, giving, clicking, opening, frontDoor), `${condition}, a member who opened Coins and inventory sees today's Inventory tab`, async () => {
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
      await workspace("xp-levels", "unlocks", "coins", "store", ...website);
      await coinsOpenedBy("U_ALICE");
      await openHome("U_ALICE");

      await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Inventory")));

      expect(publishedHome("U_ALICE")).toEqual(todaysInventory);
    }, 30_000);
  }
});

describe("each crate's Open in Slack links to the page where it opens while the website is open", () => {
  waitsOn(summary, "a ready feature's Open links to its crate on its own listed page and names that page to screen readers", async () => {
    await workspace(...everyFlag, "website");
    await levelThreeWithQuestsDrawn();

    expect(publishedHome("U_ALICE").filter((line) => line.includes("is ready."))).toEqual([
      `section: *Leaderboard* is ready. ${openOnTheWeb("/leaderboard")}`,
      `section: *Quests* is ready. ${openOnTheWeb("/")}`,
    ]);
    expect(accessoryBeside("*Quests* is ready.")).toEqual({
      type: "button",
      text: { type: "plain_text", text: "Open" },
      url: `${siteUrl}/?src=app-home`,
      action_id: "website-link:quests",
      accessibility_label: "Open on HedgeHug's Quests page",
    });
  }, 30_000);

  waitsOn(stacks(summary, clicking), "a ready Skill tree links to its crate on its page on the route list, /skills", async () => {
    await workspace(...everyFlag, "website");
    await levelThreeWithQuestsDrawn();
    await openReadyFeatures();
    await t.run(async (ctx) => makeReady(ctx, { event: await levelReached("U_ALICE", 5) }));

    await openHome("U_ALICE");

    expect(publishedHome("U_ALICE")).toContain(`section: *Skill tree* is ready. ${openOnTheWeb("/")}`);
    expect(accessoryBeside("*Skill tree* is ready.")).toMatchObject({ url: `${siteUrl}/?src=app-home`, action_id: "website-link:skillTree", accessibility_label: "Open on HedgeHug's Skill tree page" });
  }, 30_000);

  waitsOn(stacks(summary, clicking), "a ready Book links to its crate on /book, and ready Coins, which has no crate on the home, links to the home", async () => {
    await workspace(...everyFlag, "achievements", "coins", "website");
    await everyFeatureOpenedAtLevelFive(["quests", "leaderboard", "skillTree"]);
    await xpOf("U_ALICE", 1000);
    await t.run(async (ctx) => makeReady(ctx, { event: await levelReached("U_ALICE", 6) }));

    await openHome("U_ALICE");

    expect(publishedHome("U_ALICE").filter((line) => line.includes("is ready."))).toEqual([
      `section: *Book* is ready. ${openOnTheWeb("/")}`,
      `section: *Coins* is ready. ${openOnTheWeb("/")}`,
    ]);
  }, 30_000);

  waitsOn(summary, "for a member previewing the website while it is closed for the workspace, Open links to the crate through the page's sign-in entry", async () => {
    t.slack.withMember("U_ALICE", { profile: { email: alicesEmail } });
    await workspace(...everyFlag, onForEmails("website", alicesEmail));
    await levelThreeWithQuestsDrawn();

    expect(accessoryBeside("*Quests* is ready.")).toMatchObject({ url: `${siteUrl}/sign-in/?src=app-home`, action_id: "website-link:quests" });
  }, 30_000);

  waitsOn(stacks(summary, clicking), "clicking a link button runs no command and publishes App Home no more", async () => {
    await workspace(...everyFlag, "website");
    await levelThreeWithQuestsDrawn();
    const published = publishedViews("U_ALICE").length;

    const response = await send(buttonBeside("*Quests* is ready.", "Open"));
    await send(blockActions("U_ALICE", buttonInHome("U_ALICE", "Open HedgeHug")));

    expect(response.status).toBe(200);
    expect(publishedViews("U_ALICE")).toHaveLength(published);
    expect(publishedHome("U_ALICE")).toContain(`section: *Quests* is ready. ${openOnTheWeb("/")}`);
  }, 30_000);
});

function accessoryOf(url: string) {
  return publishedHomeBlocks("U_ALICE").find((block) => (block.accessory as { url?: string } | undefined)?.url === url)?.accessory;
}

function areaOf(home: string[], heading: string) {
  const start = home.indexOf(heading);
  const end = home.indexOf("divider", start);
  return home.slice(start, end === -1 ? undefined : end);
}

function accessoryBeside(text: string) {
  return publishedHomeBlocks("U_ALICE").find((block) => readBlocks([block])[0]?.startsWith(`section: ${text}`))?.accessory;
}

type LinkButton = { label: string; url: string };

function linkButtonsIn(blocks: Block[]): LinkButton[] {
  return blocks.flatMap((block) =>
    block.type === "actions" ? (block.elements as Array<{ text: { text: string }; url?: string }>).flatMap(({ text, url }) => (url === undefined ? [] : [{ label: text.text, url }])) : [],
  );
}

// Today's `website.flag.prepareWebsiteFlag`: the sign-in workspace's key made.
async function prepareWebsiteFlag() {
  const workspace = signInWorkspace();
  if (workspace !== undefined) await t.run((ctx) => workspaceKeyOf(ctx, workspace));
}

// Today's `flagsFromPostHog` with these flags, the website flag prepared, the workspace, and unlocks shipped before
// anyone joined (`unlocksShippedBeforeAnyoneJoined`).
async function workspace(...flags: Array<string | FlagDefinition>) {
  await definitionsStored(t.operations, ...flags.map((flag) => (typeof flag === "string" ? onForEveryone(flag) : flag)));
  await prepareWebsiteFlag();
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 });
  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));
}

async function workspaceWithUserGroups(...flags: string[]) {
  await workspace(...flags);
  await t.operations.action("slack.userGroups.syncUserGroups", (ctx) => syncUserGroups(ctx, {}));
  await settle();
}

async function coinsOpenedBy(user: string) {
  await giveKudos(user, "U_BOB", saysWhy);
  await xpOf(user, 990);
  await giveKudos(user, "U_BOB", saysWhy);
  await send(blockActions(user, staleButtonOf({ type: "openUnlock", feature: "coins" })));
}

async function levelThreeWithQuestsDrawn() {
  await giveKudos("U_ALICE", "U_BOB", saysWhy);
  await drawFor("U_ALICE", sayingWhyThreeWays);
  await xpOf("U_ALICE", 100);
  await t.run(async (ctx) => makeReady(ctx, { event: await levelReached("U_ALICE", 3) }));
  await openHome("U_ALICE");
}

async function openReadyFeatures() {
  for (const feature of ["quests", "leaderboard"]) {
    await send(blockActions("U_ALICE", staleButtonOf({ type: "openUnlock", feature })));
  }
}

async function everyFeatureOpenedAtLevelFive(features = ["quests", "leaderboard", "book", "skillTree"]) {
  await giveKudos("U_ALICE", "U_BOB", saysWhy);
  await xpOf("U_ALICE", 600);
  for (const level of [2, 3, 4, 5]) await t.run(async (ctx) => makeReady(ctx, { event: await levelReached("U_ALICE", level) }));
  for (const feature of features) {
    await send(blockActions("U_ALICE", staleButtonOf({ type: "openUnlock", feature })));
  }
}

async function drawFor(user: string, quests: QuestId[]) {
  const promised = { reward: { xp: 20, coins: 0, item: null }, catalogueVersion: "1" };
  const slots = quests.map((quest, slot) => ({ slot, quest, ...promised, feasibleBecause: { peopleLeft: 1, recognitionsLeft: 18 } }));
  const member = await memberOf(user);
  await t.seed.insert("questDraws", { member, week: "2026-10-12", drawnAt: t.clock.now(), slots });
}

async function onTheBoards(user: string) {
  const member = await memberOf(user);
  return t.run((ctx) => isOnTheBoards(ctx, member));
}

async function memberOf(user: string): Promise<MemberId> {
  const rows = (await t.seed.all("members")).filter((member) => member.workspace === "T1" && member.user === user);
  if (rows.length > 1) throw new Error(`${rows.length} members rows for ${user}, where one is unique`);
  return rows[0]!._id as MemberId;
}

async function xpOf(user: string, xp: number) {
  const member = await memberOf(user);
  const rows = (await t.seed.all("memberProgress")).filter((progress) => progress.member === member);
  if (rows.length > 1) throw new Error(`${rows.length} memberProgress rows, where one is unique`);
  await t.seed.patch("memberProgress", rows[0]!._id, { xp });
}

async function levelReached(user: string, level: number): Promise<LevelReachedEvent> {
  const member = await memberOf(user);
  const message = { workspace: "T1", conversation: "C1", message: "1760349600.000100" };
  return { type: "levelReached", workspace: "T1", member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at: t.clock.now() };
}

function buttonBeside(text: string, label: string) {
  const blocks = publishedHomeBlocks("U_ALICE").filter((block) => readBlocks([block]).some((line) => line.includes(text)));
  return blockActions("U_ALICE", buttonIn(blocks, label));
}

async function giveKudos(giver: string, recipient: string, words: string) {
  handledByTheFrontDoor({ event: "message" });
  sentMessages += 1;
  const blocks = [section(mention(recipient), text(` ${words} `), emoji("taco"))];
  await delivered(t.send("/events", messageEvent(blocks, { user: giver, ts: `${t.clock.now() / 1000 + sentMessages}.000100` })));
  await settle();
}

async function openHome(user: string) {
  handledByTheFrontDoor({ event: "homeOpened" });
  await delivered(t.send("/events", appHomeOpened(user, { eventTime: new Date(t.clock.now()) })));
  await settle();
}

async function send(interaction: Record<string, unknown>) {
  handledByTheFrontDoor({ click: "homeClick" });
  const response = await t.interaction(interaction);
  await delivered(response);
  await settle();
  return response;
}

function fromAppHome(url: string) {
  const link = new URL(url);
  link.searchParams.set("src", "app-home");
  return link.toString();
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
type Element = { type: string; text?: TextObject; action_id?: string; value?: string; url?: string; style?: string; accessibility_label?: string };
type Block = { type: string; block_id?: string; text?: TextObject; fields?: TextObject[]; elements?: Array<TextObject | Element>; accessory?: Element };
type BlockAction = { type: "button"; action_id: string; value?: string; block_id?: string };

function publishedHomeBlocks(user: string): Block[] {
  const view = t.slack.homeShownTo(user) as { type: string; blocks: Block[] } | undefined;
  expect(view?.type).toBe("home");
  return view?.blocks ?? [];
}

function publishedHome(user: string) {
  return readBlocks(publishedHomeBlocks(user));
}

function publishedViews(user: string) {
  return t.slack
    .callsTo("views.publish")
    .filter((args) => args.user_id === user)
    .map((args) => args.view as { type: string; blocks: Block[] });
}

function readBlocks(blocks: Block[]) {
  return blocks.map(readBlock);
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

function buttonIn(blocks: Block[], label: string): BlockAction {
  for (const block of blocks) {
    const elements = [...(block.type === "actions" ? (block.elements as Element[]) : []), ...(block.accessory ? [block.accessory] : [])];
    const button = elements.find((element) => element.type === "button" && element.text?.text === label);
    if (button) return { type: "button", action_id: button.action_id!, ...(button.value !== undefined && { value: button.value }), ...(block.block_id && { block_id: block.block_id }) };
  }
  throw new Error(`no ${label} button among the blocks`);
}

function buttonInHome(user: string, label: string): BlockAction {
  return buttonIn(publishedHomeBlocks(user), label);
}

function staleButtonOf(command: unknown): BlockAction {
  const encoded = JSON.stringify(command);
  return { type: "button", action_id: encoded, value: encoded };
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
