// The maintainer switches the weekly post on and off and picks its channel from the website's Settings. Today's
// convex/website/weeklyPost.test.ts, on the service's test backend: the read is getSettings and the commands are
// setWeeklyPost and pickWeeklyPostChannel, each for a `me` made from the seeded directory row, as S15's member check
// answers it, and the commands with the person the directory knows, read in the same mutation. The directory rows are
// the ones each `team_join` wrote; the user groups come from the sync as today. A session's length is the member
// check's, so a reader signed in for a week is the same `me`. The guard tests whose subject is the member check (closed,
// signed out, not a member, an argument naming a member or workspace) go through S15's route transport in S17's route
// pull request.
import { asc, eq } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, routedFetch } from "../../testing/fakePostHog.ts";
import { httpStatus, slackError, type SlackArgs } from "../../testing/fakeSlack.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { appHomeOpened, emoji, mention, messageEvent, section } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import { jobs } from "../db/schema/service.ts";
import type { TableName } from "../db/schema/index.ts";
import type { HomeMember } from "../feedback/homes.ts";
import { dataModelTables } from "../load/loader.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import type { ClickKind, EventKind } from "../slack/frontDoor.ts";
import { checkPickedChannel } from "../slack/mondayPost.ts";
import { syncUserGroups } from "../slack/userGroups.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { getSettings } from "./settings.ts";
import { pickWeeklyPostChannel, setWeeklyPost } from "./settingsCommands.ts";

const wednesday = new Date("2026-10-14T10:00:00Z");
const mondayAtNineInBerlin = Date.parse("2026-10-19T07:00:00Z");
const maintainer = "U_MAINTAINER";
const announcementChannel = "C_ANNOUNCE";
const owls = ["U_ANN", "U_BOB"];
const minuteMs = 60_000;
const everyFlag = ["workspace-settings", "monday-post", "xp-levels", "groups"];

const switchedOff = { on: false, timeZone: "Europe/Berlin", channelLink: "https://hedgehug.slack.com/archives/C_ANNOUNCE", cantPost: false, posts: "groups" };

// What each step reaches past this stack's handlers:
// - the workspace's user groups: the sync (S11);
const setUp: Stack[] = ["S11"];
// - getSettings: the unlock path (S16), the board's visibility and groups (S11), message settings and the album's Slack
//   switch (S5), and the xp-levels switch (S6);
const reading: Stack[] = ["S5", "S6", "S11", "S16"];
// - a command: the command runner (S4) and its guard (S15), and the weekly post's switch, which reads the same as getSettings
//   bar the unlock path (S5, S6, S11);
const commanding: Stack[] = ["S4", "S5", "S6", "S11", "S15"];
// - a kudos through Slack, whose events every domain's subscribers take (S4 to S14), and the post going out: its week's
//   board and givers (S11), the album's Slack switch and the delivery (S5);
const posting: Stack[] = ["S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14"];
// - an admin's App Home and its Admin tab (S5's homes, S17's App Home).
const homing: Stack[] = ["S5", "S17"];

function stacks(...steps: Stack[][]): [Stack, ...Stack[]] {
  const all = [...new Set(steps.flat())].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return all as [Stack, ...Stack[]];
}

const backend = useTestBackend({ now: wednesday.getTime(), workspace: "T1" });

let t: TestBackend;
let sentMessages = 0;
// Each post that reached Slack, by the app's clock: the fake's own times are real time, which the clock runs ahead of.
let posts: Array<{ at: number; channel: string; text: string }>;

beforeEach(() => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
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
  t.slack.withMember(maintainer, { tz: "Europe/Berlin" }).withMember("U_ADMIN", { is_admin: true, tz: "America/New_York" });
  for (const user of owls) t.slack.withMember(user);
  t.slack.withUserGroup("S_OWL", { name: "Owls", users: owls });
  sentMessages = 0;
  posts = [];
  vi.stubGlobal(
    "fetch",
    routedFetch(t.postHog, async (input, init) => {
      const answer = await t.slack.fetch(input, init);
      const method = new URL(input instanceof Request ? input.url : input).pathname.split("/").pop();
      if (method === "chat.postMessage" && init?.body && (await answer.clone().json()).ok) {
        const args = JSON.parse(String(init.body)) as SlackArgs;
        posts.push({ at: t.clock.now(), channel: String(args.channel), text: String(args.text) });
      }
      return answer;
    }),
  );
});

afterEach(() => void vi.unstubAllEnvs());

describe("the maintainer switches the weekly post on and off from Settings", () => {
  waitsOn(stacks(setUp, reading), "the maintainer's Settings show the weekly post switched off, with the announcement channel it posts in and their own time zone", async () => {
    const owner = await aWorkspaceWithGroups();

    expect(await owner.weeklyPost()).toEqual(switchedOff);
  }, 60_000);

  waitsOn(stacks(setUp, reading), "before Slack has told me the workspace's address, the channel has no link", async () => {
    const owner = await aWorkspaceWithGroups({ url: null });

    expect(await owner.weeklyPost()).toEqual({ ...switchedOff, channelLink: null });
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "a post an admin switched off in another time zone shows the maintainer's own zone, which switching on books", async () => {
    const owner = await aWorkspaceWithGroups();
    await t.seed.insert("mondayPostSettings", { workspace: "T1", on: false, timeZone: "America/New_York", generation: 2 });

    expect(await owner.weeklyPost()).toEqual(switchedOff);
    await owner.switchWeeklyPost(true);
    expect(await mondayPostSettings()).toMatchObject({ on: true, timeZone: "Europe/Berlin", nextPostAt: mondayAtNineInBerlin });
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding, posting), "switching on books the post for next Monday 9:00 in the maintainer's time zone, the read shows it on, and the post goes out then", async () => {
    const owner = await aWorkspaceWithGroups();

    expect(await owner.switchWeeklyPost(true)).toEqual({ kind: "set" });

    expect(await owner.weeklyPost()).toEqual({ ...switchedOff, on: true });
    expect(await mondayPostSettings()).toMatchObject({ on: true, timeZone: "Europe/Berlin", nextPostAt: mondayAtNineInBerlin });
    await giveKudos("U_ANN", "U_BOB");
    await settleUpTo(mondayAtNineInBerlin);
    expect(weeklyPostTimes()).toEqual([mondayAtNineInBerlin]);
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding, posting), "switching off stops the booked post, and the read shows it off", async () => {
    const owner = await aWorkspaceWithGroups();
    await owner.switchWeeklyPost(true);

    expect(await owner.switchWeeklyPost(false)).toEqual({ kind: "set" });

    expect(await owner.weeklyPost()).toEqual(switchedOff);
    await giveKudos("U_ANN", "U_BOB");
    await settleUpTo(mondayAtNineInBerlin + minuteMs);
    expect(weeklyPostTimes()).toEqual([]);
  }, 60_000);

  waitsOn(stacks(setUp, commanding), "switching on what is already on answers on and books no second post", async () => {
    const owner = await aWorkspaceWithGroups();
    await owner.switchWeeklyPost(true);

    expect(await owner.switchWeeklyPost(true)).toEqual({ kind: "set" });

    expect(await weeklyPostJobs()).toHaveLength(1);
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "the command decides workspace-settings and monday-post with exposure for the maintainer, and the read decides them without", async () => {
    const owner = await aWorkspaceWithGroups();
    await owner.weeklyPost();
    expect(await exposuresOf("workspace-settings", "monday-post")).toEqual([]);

    await owner.switchWeeklyPost(true);

    expect(await exposuresOf("workspace-settings", "monday-post")).toEqual([
      { flag: "workspace-settings", member: owner.member, value: true },
      { flag: "monday-post", member: owner.member, value: true },
    ]);
  }, 60_000);
});

describe("the website switch exposes workspace-settings for the maintainer", () => {
  waitsOn(stacks(setUp, commanding), "a maintainer who is also a workspace admin is exposed to workspace-settings by the website switch", async () => {
    vi.stubEnv("KUDOS_MAINTAINER", "U_ADMIN");
    await aWorkspaceWithGroups();
    const admin = await signedIn("U_ADMIN");

    await admin.switchWeeklyPost(true);

    expect(await exposuresOf("workspace-settings")).toEqual([{ flag: "workspace-settings", member: admin.member, value: true }]);
  }, 60_000);
});

describe("only an admin or the maintainer switches the Monday post", () => {
  waitsOn(stacks(setUp, reading, commanding, homing), "the maintainer's switch shows in an admin's App Home, and the admin's Switch off there shows in the maintainer's Settings", async () => {
    const owner = await aWorkspaceWithGroups();
    await adminTabOpen("U_ADMIN");

    await owner.switchWeeklyPost(true);
    await settleUpTo(t.clock.now() + minuteMs);

    expect(publishedHome("U_ADMIN")).toContain("section: Every Monday I post last week's top groups in <#C_ANNOUNCE>. [button: Switch off]");
    await clickInHome("U_ADMIN", "Switch off");
    expect(await owner.weeklyPost()).toEqual(switchedOff);
  }, 60_000);

  waitsOn(stacks(setUp, commanding), "while monday-post is off for the maintainer, switching off what is already off is refused too", async () => {
    const owner = await aWorkspaceWithGroups({ flags: ["workspace-settings", "xp-levels", "groups"] });

    expect(await owner.switchWeeklyPost(false)).toEqual({ kind: "refused" });
  }, 60_000);

  waitsOn(stacks(setUp, commanding), "once the announcement channel is gone, switching on a post that is still stored on is refused", async () => {
    const owner = await aWorkspaceWithGroups();
    await owner.switchWeeklyPost(true);
    await announcementChannelGone();

    expect(await owner.switchWeeklyPost(true)).toEqual({ kind: "refused" });
  }, 60_000);

  waitsOn(stacks(setUp, commanding), "once the announcement channel is gone, switching off a post that is still stored on is refused and writes nothing", async () => {
    const owner = await aWorkspaceWithGroups();
    await owner.switchWeeklyPost(true);
    await announcementChannelGone();
    const stored = await mondayPostSettings();

    expect(await owner.switchWeeklyPost(false)).toEqual({ kind: "refused" });
    expect(await mondayPostSettings()).toEqual(stored);
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "a workspace admin who isn't the maintainer sees no weekly post in Settings, and their switch is refused and writes nothing", async () => {
    await aWorkspaceWithGroups();
    const admin = await signedIn("U_ADMIN");

    expect(await admin.weeklyPost()).toBeUndefined();
    expect(await admin.switchWeeklyPost(true)).toEqual({ kind: "refused" });
    expect(await mondayPostSettings()).toBeNull();
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "while workspace-settings is off for the maintainer, there is no weekly post in Settings, and the switch is refused and writes nothing", async () => {
    const owner = await aWorkspaceWithGroups({ flags: ["monday-post", "xp-levels", "groups"] });

    expect(await owner.weeklyPost()).toBeUndefined();
    expect(await owner.switchWeeklyPost(true)).toEqual({ kind: "refused" });
    expect(await mondayPostSettings()).toBeNull();
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "while monday-post is off for the maintainer, there is no weekly post in Settings, and the switch is refused and writes nothing", async () => {
    const owner = await aWorkspaceWithGroups({ flags: ["workspace-settings", "xp-levels", "groups"] });

    expect(await owner.weeklyPost()).toBeUndefined();
    expect(await owner.switchWeeklyPost(true)).toEqual({ kind: "refused" });
    expect(await mondayPostSettings()).toBeNull();
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "without an announcement channel there is no weekly post in Settings, and switching on is refused", async () => {
    const owner = await aWorkspaceWithGroups({ channel: null });

    expect(await owner.weeklyPost()).toBeUndefined();
    expect(await owner.switchWeeklyPost(true)).toEqual({ kind: "refused" });
    expect(await mondayPostSettings()).toBeNull();
  }, 60_000);
});

const withPicker = [...everyFlag, "weekly-post-channel"];
const pickedChannel = "C0PICKED1";
const pickedLink = `https://hedgehug.slack.com/archives/${pickedChannel}`;
const unpicked = { ...switchedOff, channelPick: { picked: null, check: null, pick: 0 } };

describe("the maintainer picks the weekly post's channel", () => {
  waitsOn(stacks(setUp, reading, commanding, posting), "while no channel is picked, the read offers the picker beside the announcement channel, and the post goes to the announcement channel", async () => {
    const owner = await aWorkspaceWithGroups({ flags: withPicker });

    expect(await owner.weeklyPost()).toEqual(unpicked);
    await owner.switchWeeklyPost(true);
    await giveKudos("U_ANN", "U_BOB");
    await settleUpTo(mondayAtNineInBerlin);
    expect(weeklyPostChannels()).toEqual([announcementChannel]);
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding, posting), "a pasted link to a public channel is checked by joining it, then the read names it and links it, and the post goes there", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" });
    const owner = await aWorkspaceWithGroups({ flags: withPicker });

    expect(await owner.pickChannel(pickedLink)).toEqual({ kind: "checking", pick: 1 });
    expect(await owner.weeklyPost()).toEqual({ ...unpicked, channelPick: { picked: null, check: "checking", pick: 1 } });
    await t.settle();

    expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: pickedChannel }]);
    expect(await owner.weeklyPost()).toEqual({ ...unpicked, channelLink: pickedLink, channelPick: { picked: "kudos-weekly", check: "picked", pick: 1 } });
    await owner.switchWeeklyPost(true);
    await giveKudos("U_ANN", "U_BOB");
    await settleUpTo(mondayAtNineInBerlin);
    expect(weeklyPostChannels()).toEqual([pickedChannel]);
  }, 60_000);

  waitsOn(stacks(setUp, commanding, homing), "an admin's App Home names the picked channel for the post, and the announcement channel stays the one for level-ups", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" });
    const owner = await aWorkspaceWithGroups({ flags: withPicker });
    await adminTabOpen("U_ADMIN");

    await owner.pickChannel(pickedLink);
    await settleUpTo(t.clock.now() + minuteMs);

    expect(publishedHome("U_ADMIN")).toContain(`section: I can post last week's top groups in <#${pickedChannel}> every Monday at 9:00. [button: Switch on]`);
    expect((await t.seed.all("workspaces"))[0]?.announcementChannel).toBe(announcementChannel);
  }, 60_000);

  for (const [check, channel] of [
    ["private", { name: "secret-plans", kind: "private" as const }],
    ["archived", { name: "old-news", kind: "archived" as const }],
    ["shared", { name: "partners", kind: "shared" as const }],
    ["customer", { name: "customer-example-internal" }],
  ] as const) {
    waitsOn(stacks(setUp, reading, commanding, posting), `a ${check} channel is refused with why, nothing is picked, and the post stays in the announcement channel`, async () => {
      t.slack.withChannel(pickedChannel, channel);
      const owner = await aWorkspaceWithGroups({ flags: withPicker });

      await owner.pickChannel(pickedLink);
      await t.settle();

      expect(await owner.weeklyPost()).toEqual({ ...unpicked, channelPick: { picked: null, check, pick: 1 } });
      await owner.switchWeeklyPost(true);
      await giveKudos("U_ANN", "U_BOB");
      await settleUpTo(mondayAtNineInBerlin);
      expect(weeklyPostChannels()).toEqual([announcementChannel]);
    }, 60_000);
  }

  describe("the app stays out of shared and customer channels", () => {
    for (const [kind, channel] of [
      ["shared", { name: "partners", kind: "shared" as const }],
      ["customer", { name: "customer-example-internal" }],
      ["posthog-", { name: "posthog-example" }],
      ["ext-", { name: "ext-example" }],
    ] as const) {
      waitsOn(stacks(setUp, commanding), `a ${kind} channel is refused without joining it`, async () => {
        t.slack.withChannel(pickedChannel, channel);
        const owner = await aWorkspaceWithGroups({ flags: withPicker });

        await owner.pickChannel(pickedLink);
        await t.settle();

        expect(t.slack.callsTo("conversations.join")).toEqual([]);
      }, 60_000);
    }

    waitsOn(stacks(setUp, reading, commanding), "a channel shared between Slack describing it and the join is refused as shared", async () => {
      t.slack
        .withChannel(pickedChannel, { name: "partners", kind: "shared" })
        .answering("conversations.info", () => Response.json({ ok: true, channel: { id: pickedChannel, name: "partners", is_ext_shared: false } }));
      const owner = await aWorkspaceWithGroups({ flags: withPicker });

      await owner.pickChannel(pickedLink);
      await t.settle();

      expect(await owner.weeklyPost()).toEqual({ ...unpicked, channelPick: { picked: null, check: "shared", pick: 1 } });
    }, 60_000);

    waitsOn(stacks(setUp, reading, commanding), "a channel renamed into posthog- between Slack describing it and the join is refused as a customer's", async () => {
      t.slack.withChannel(pickedChannel, { name: "posthog-example" }).answering("conversations.info", () => Response.json({ ok: true, channel: { id: pickedChannel, name: "kudos-weekly" } }));
      const owner = await aWorkspaceWithGroups({ flags: withPicker });

      await owner.pickChannel(pickedLink);
      await t.settle();

      expect(await owner.weeklyPost()).toEqual({ ...unpicked, channelPick: { picked: null, check: "customer", pick: 1 } });
    }, 60_000);

    waitsOn(stacks(setUp, reading, commanding), "a channel Slack won't describe is not joined and reads failed", async () => {
      t.slack.withChannel(pickedChannel, { name: "kudos-weekly" }).answering("conversations.info", slackError("missing_scope"));
      const owner = await aWorkspaceWithGroups({ flags: withPicker });

      await owner.pickChannel(pickedLink);
      await t.settle();

      expect(t.slack.callsTo("conversations.join")).toEqual([]);
      expect(await owner.weeklyPost()).toEqual({ ...unpicked, channelPick: { picked: null, check: "failed", pick: 1 } });
    }, 60_000);
  });

  waitsOn(stacks(setUp, reading, commanding), "a channel Slack can't find for me reads not-found, and one Slack gave no answer about reads failed, both keeping the channel picked before", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" }).answering("conversations.join", (answerAsSlackWould) => answerAsSlackWould(), slackError("channel_not_found"), httpStatus(500));
    const owner = await aWorkspaceWithGroups({ flags: withPicker });
    await owner.pickChannel(pickedLink);
    await t.settle();

    await owner.pickChannel("https://hedgehug.slack.com/archives/C0GONE");
    await t.settle();
    expect(await owner.weeklyPost()).toMatchObject({ channelLink: pickedLink, channelPick: { picked: "kudos-weekly", check: "not-found" } });

    await owner.pickChannel("https://hedgehug.slack.com/archives/C0FLAKY");
    await t.settle();
    expect(await owner.weeklyPost()).toMatchObject({ channelLink: pickedLink, channelPick: { picked: "kudos-weekly", check: "failed" } });
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "of two picks in a row, the later one wins, even when the earlier one's check answers last", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" }).withChannel("C0SECOND", { name: "shout-outs" });
    const owner = await aWorkspaceWithGroups({ flags: withPicker });
    await owner.pickChannel(pickedLink);
    const earlierJoin = t.slack.holdNext("conversations.join");
    const earlierCheck = t.operations.action("slack.mondayPost.checkPickedChannel", (ctx) => checkPickedChannel(ctx, { workspace: "T1", channel: pickedChannel, pick: 1 }));
    await earlierJoin.reached;

    await owner.pickChannel("https://app.slack.com/client/T1/C0SECOND");
    await t.settle();
    expect(await owner.weeklyPost()).toMatchObject({ channelPick: { picked: "shout-outs", check: "picked" } });
    earlierJoin.release();
    await earlierCheck;

    expect(await owner.weeklyPost()).toMatchObject({ channelLink: "https://hedgehug.slack.com/archives/C0SECOND", channelPick: { picked: "shout-outs", check: "picked" } });
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "of two picks of the same channel, the later one's check wins even when the earlier one's fails first", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" }).answering("conversations.join", slackError("internal_error"));
    const owner = await aWorkspaceWithGroups({ flags: withPicker });

    await owner.pickChannel(pickedLink);
    await owner.pickChannel(pickedLink);
    await t.settle();

    expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: pickedChannel }, { channel: pickedChannel }]);
    expect(await owner.weeklyPost()).toMatchObject({ channelLink: pickedLink, channelPick: { picked: "kudos-weekly", check: "picked" } });
  }, 60_000);

  waitsOn(stacks(setUp, commanding, posting, homing), "when the post can't go to a picked channel, an admin's App Home sends them to the maintainer rather than to the announcement channel's picker", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" });
    await aWorkspaceWithGroups({ flags: withPicker });
    const owner = await signedIn(maintainer);
    await owner.pickChannel(pickedLink);
    await t.settle();
    await owner.switchWeeklyPost(true);
    await adminTabOpen("U_ADMIN");
    await giveKudos("U_ANN", "U_BOB");
    t.slack.answering("chat.postMessage", slackError("is_archived"));
    await settleUpTo(mondayAtNineInBerlin + minuteMs);

    expect(publishedHome("U_ADMIN")).toContain(`section: I can't post in <#${pickedChannel}>. Ask HedgeHug's maintainer to pick another channel in the website's Settings.`);
  }, 60_000);

  for (const link of ["#kudos-weekly", "https://example.com/archives/C0PICKED1", "http://hedgehug.slack.com/archives/C0PICKED1", "https://hedgehug.slack.com/team/U_ANN", ""]) {
    waitsOn(stacks(setUp), `${JSON.stringify(link)} isn't a channel link: refused as such, and nothing is picked or asked of Slack`, async () => {
      const owner = await aWorkspaceWithGroups({ flags: withPicker });

      expect(await owner.pickChannel(link)).toEqual({ kind: "refused", reason: "not-a-channel-link" });

      expect(await mondayPostSettings()).toBeNull();
      expect(t.slack.callsTo("conversations.join")).toEqual([]);
    }, 60_000);
  }

  waitsOn(stacks(setUp, reading, commanding), "a channel ID pasted on its own is checked like its link", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" });
    const owner = await aWorkspaceWithGroups({ flags: withPicker });

    await owner.pickChannel(` ${pickedChannel} `);
    await t.settle();

    expect(await owner.weeklyPost()).toMatchObject({ channelPick: { picked: "kudos-weekly", check: "picked" } });
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding, posting), "when I can't post in the picked channel, the read says so for it, and picking another channel clears it", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" }).withChannel("C0SECOND", { name: "shout-outs" });
    await aWorkspaceWithGroups({ flags: withPicker });
    const owner = await signedIn(maintainer);
    await owner.pickChannel(pickedLink);
    await t.settle();
    await owner.switchWeeklyPost(true);
    await giveKudos("U_ANN", "U_BOB");
    t.slack.answering("chat.postMessage", slackError("not_in_channel"));
    await settleUpTo(mondayAtNineInBerlin);

    expect(await owner.weeklyPost()).toMatchObject({ cantPost: true, channelPick: { picked: "kudos-weekly", check: "picked" } });
    await owner.pickChannel("https://hedgehug.slack.com/archives/C0SECOND");
    await settleUpTo(t.clock.now() + minuteMs);
    expect(await owner.weeklyPost()).toMatchObject({ cantPost: false, channelPick: { picked: "shout-outs", check: "picked" } });
  }, 60_000);

  waitsOn(stacks(setUp, reading, commanding), "picking decides weekly-post-channel with exposure for the maintainer, and the read decides it without", async () => {
    t.slack.withChannel(pickedChannel, { name: "kudos-weekly" });
    const owner = await aWorkspaceWithGroups({ flags: withPicker });
    await owner.weeklyPost();
    expect(await exposuresOf("weekly-post-channel")).toEqual([]);

    await owner.pickChannel(pickedLink);

    expect(await exposuresOf("weekly-post-channel")).toEqual([{ flag: "weekly-post-channel", member: owner.member, value: true }]);
  }, 60_000);
});

describe("only the maintainer picks the weekly post's channel, and only while weekly-post-channel is on", () => {
  waitsOn(stacks(setUp, commanding), "a workspace admin who isn't the maintainer is refused, and nothing is written or asked of Slack", async () => {
    await aWorkspaceWithGroups({ flags: withPicker });
    const admin = await signedIn("U_ADMIN");
    const before = await everyTable();

    expect(await admin.pickChannel(pickedLink)).toEqual({ kind: "refused", reason: null });

    expect(await everyTable()).toEqual(before);
    expect(t.slack.callsTo("conversations.join")).toEqual([]);
  }, 60_000);

  waitsOn(stacks(setUp, commanding, homing), "a Slack click naming the pick, even from a maintainer who is a workspace admin, is no command at all: nothing is picked or asked of Slack", async () => {
    vi.stubEnv("KUDOS_MAINTAINER", "U_ADMIN");
    await aWorkspaceWithGroups({ flags: withPicker });

    handledByTheFrontDoor({ click: "homeClick" });
    await t.interaction(blockActions("U_ADMIN", staleButtonOf({ type: "pickMondayPostChannel", channel: pickedChannel })));
    await settleUpTo(t.clock.now() + minuteMs);

    expect(await mondayPostSettings()).toBeNull();
    expect(t.slack.callsTo("conversations.join")).toEqual([]);
  }, 60_000);

  waitsOn(stacks(setUp, commanding), "while workspace-settings is off for the maintainer, the pick is refused, and nothing is picked or asked of Slack", async () => {
    const owner = await aWorkspaceWithGroups({ flags: ["monday-post", "xp-levels", "groups", "weekly-post-channel"] });

    expect(await owner.pickChannel(pickedLink)).toEqual({ kind: "refused", reason: null });

    expect(await mondayPostSettings()).toBeNull();
    expect(t.slack.callsTo("conversations.join")).toEqual([]);
  }, 60_000);

  waitsOn(
    stacks(setUp, reading, commanding, posting),
    "while weekly-post-channel is off, the read has no picker, the pick is refused storing nothing, and a channel picked while it was on gets no post: the announcement channel does",
    async () => {
      t.slack.withChannel(pickedChannel, { name: "kudos-weekly" });
      const owner = await aWorkspaceWithGroups({ flags: withPicker });
      await owner.pickChannel(pickedLink);
      await t.settle();
      await switchWebsite(...everyFlag);
      const stored = await mondayPostSettings();

      expect(await owner.weeklyPost()).toEqual(switchedOff);
      expect(await owner.pickChannel("https://hedgehug.slack.com/archives/C0SECOND")).toEqual({ kind: "refused", reason: null });
      expect(await mondayPostSettings()).toEqual(stored);
      expect(t.slack.callsTo("conversations.join")).toEqual([{ channel: pickedChannel }]);
      await owner.switchWeeklyPost(true);
      await giveKudos("U_ANN", "U_BOB");
      await settleUpTo(mondayAtNineInBerlin);
      expect(weeklyPostChannels()).toEqual([announcementChannel]);
    },
    60_000,
  );

  waitsOn(stacks(setUp, commanding), "without an announcement channel there is no weekly post to pick a channel for, and the pick is refused", async () => {
    const owner = await aWorkspaceWithGroups({ flags: withPicker, channel: null });

    expect(await owner.pickChannel(pickedLink)).toEqual({ kind: "refused", reason: null });
    expect(await mondayPostSettings()).toBeNull();
  }, 60_000);
});

type Setup = { channel?: string | null; url?: string | null; flags?: string[] };

// Today's `switchWebsite(t, postHog, true, ...flags)`: the website open, these flags on for everyone, and the workspace's key made.
async function switchWebsite(...flags: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

async function aWorkspaceWithGroups({ channel = announcementChannel, url = "https://hedgehug.slack.com/", flags = everyFlag }: Setup = {}) {
  await switchWebsite(...flags);
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10, ...(channel !== null && { announcementChannel: channel }), ...(url !== null && { url }) });
  // The members rows each `team_join` wrote.
  await aMember(maintainer, { timeZone: "Europe/Berlin", realName: "Mae Maintainer" });
  await aMember("U_ADMIN", { admin: true, timeZone: "America/New_York", realName: "Ada Admin" });
  for (const user of owls) await aMember(user, { realName: `${user} Example` });
  await t.operations.action("slack.userGroups.syncUserGroups", (ctx) => syncUserGroups(ctx, {}));
  await t.settle();
  return signedIn(maintainer);
}

function aMember(user: string, profile: { timeZone?: string; admin?: boolean; realName: string }) {
  return t.seed.insert("members", { workspace: "T1", user, kind: "member", asOf: wednesday.getTime(), ...profile });
}

// A reader signed in as today's `aSignedInSession` left them: the analytics ID the flags decide them by, and the member
// check's answer. Each command reads the person the directory knows in its own mutation, as the route does.
async function signedIn(user: string) {
  const row = (await t.seed.all("members")).find((member) => member.workspace === "T1" && member.user === user);
  if (row === undefined) throw new Error(`${user} is no member`);
  const member = row._id as MemberId;
  await t.run((ctx) => analyticsIdOf(ctx, member));
  const me: VerifiedMember = { member, workspace: "T1", user, name: user };
  const asPerson = <Answer>(command: (ctx: MutationContext, person: HomeMember) => Promise<Answer>) =>
    t.run(async (ctx) => command(ctx, (await lookup(ctx, "T1", user)) as HomeMember));
  return {
    member,
    weeklyPost: async () => ((await t.query((ctx) => getSettings(ctx, me))) as { weeklyPost?: unknown }).weeklyPost,
    switchWeeklyPost: (on: boolean) => asPerson((ctx, person) => setWeeklyPost(ctx, me, person, { on })),
    pickChannel: (link: string) => asPerson((ctx, person) => pickWeeklyPostChannel(ctx, me, person, { link })),
  };
}

async function announcementChannelGone() {
  const [workspace] = await t.seed.all("workspaces");
  await t.seed.patch("workspaces", workspace!._id, { announcementChannel: undefined });
}

// The front door acknowledges an event or click no domain registered a handler for and takes nothing in, so a kudos, an
// App Home opening or a click sent before the stack that handles it lands would go nowhere: until then it ends here, as
// at a stub.
function handledByTheFrontDoor(kind: { event: EventKind } | { click: ClickKind }) {
  const [handlers, name] = "event" in kind ? [serviceRegistry.slack.events, kind.event] : [serviceRegistry.slack.clicks, kind.click];
  if (!Object.hasOwn(handlers ?? {}, name)) throw notPorted(`slack.${"event" in kind ? "events" : "clicks"}.${name}`);
}

async function giveKudos(giver: string, recipient: string) {
  handledByTheFrontDoor({ event: "message" });
  sentMessages += 1;
  await t.send("/events", messageEvent([section(mention(recipient), emoji("taco"))], { user: giver, ts: `${Math.floor(t.clock.now() / 1000) + sentMessages}.000100` }));
  await settleUpTo(t.clock.now() + minuteMs);
}

async function adminTabOpen(user: string) {
  handledByTheFrontDoor({ event: "homeOpened" });
  await t.send("/events", appHomeOpened(user));
  await settleUpTo(t.clock.now() + minuteMs);
  await clickInHome(user, "Admin");
}

async function clickInHome(user: string, label: string) {
  handledByTheFrontDoor({ click: "homeClick" });
  await t.interaction(blockActions(user, buttonInHome(user, label)));
  await settleUpTo(t.clock.now() + minuteMs);
}

/** Runs every job due by `until`, moving the app's clock to each next job, as today's `settleUpTo`. */
async function settleUpTo(until: number) {
  for (;;) {
    await t.settle();
    const [next] = await t.query(({ tx }) => tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt), asc(jobs._id)).limit(1));
    if (next === undefined || next.runAt > until || next.runAt <= t.clock.now()) break;
    t.time.advance(next.runAt - t.clock.now());
  }
  if (until > t.clock.now()) t.time.advance(until - t.clock.now());
}

async function mondayPostSettings() {
  const rows = await t.seed.all("mondayPostSettings");
  if (rows.length > 1) throw new Error(`${rows.length} mondayPostSettings rows, where one is unique`);
  return rows[0] ?? null;
}

async function weeklyPostJobs() {
  const pending = await t.query(({ tx }) => tx.select({ name: jobs.name }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt), asc(jobs._id)));
  return pending.filter(({ name }) => name.includes("mondayPost"));
}

function weeklyPostTimes() {
  return posts.filter(({ channel, text }) => channel === announcementChannel && text.startsWith("🏆 Last week in kudos")).map(({ at }) => at);
}

function weeklyPostChannels() {
  return t.slack
    .callsTo("chat.postMessage")
    .filter((args) => String(args.text).startsWith("🏆 Last week in kudos"))
    .map((args) => args.channel);
}

// Every table of the data model, each in creation order, as today's `everyTable` read every table of the schema.
async function everyTable() {
  const rows: Record<string, unknown[]> = {};
  for (const table of dataModelTables) rows[getTableName(table)] = await t.seed.all(getTableName(table) as TableName);
  return rows;
}

async function exposuresOf(...flags: string[]) {
  return (await t.seed.all("flagExposures")).filter(({ flag }) => flags.includes(flag)).map(({ flag, member, value }) => ({ flag, member, value }));
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
