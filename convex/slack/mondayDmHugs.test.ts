import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FakePostHog } from "../../testing/fakePostHog";
import { FakeSlack, httpStatus } from "../../testing/fakeSlack";
import { flagsFromPostHog, flagsLoaded, flagsOnForEveryone, onForEmails, onForEveryone } from "../../testing/flags";
import { signedRequest, signingSecret } from "../../testing/signedSlack";
import { blockActions, optionPickedInHome, publishedHome, publishedHomeBlocks, type BlockAction } from "../../testing/slackInteractions";
import { memberChanged, pendingJobs, react, settleUpTo, setWorkspaceSettings, testBackend, type Backend } from "../../testing/slackBackend";
import { appHomeOpened, emoji, mention, messageEvent, section } from "../../testing/slackMessages";
import { hugCounted } from "../../testing/leaderboard";
import { internal } from "../_generated/api";
import crons from "../crons";
import { recordReward } from "../progression/progression";
import type { MemberId } from "../workspace/directory";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const mondayNineInUtc = Date.parse("2026-10-19T09:00:00Z");
const mondayNineInKolkata = Date.parse("2026-10-19T03:30:00Z");
const mondayNineInNewYork = Date.parse("2026-10-19T13:00:00Z");
const form = { contentType: "application/x-www-form-urlencoded" };
const footer = "<slack://app?team=T1&id=A_KUDOS&tab=home|Change what I send you> in App Home's Settings tab.";
const nudge = "Hugs are a quick thanks. A kudos, a message that mentions a teammate with :taco:, earns much more XP.";
const recapRow = "section: *Weekly hugs recap* — Last week's hugs, the :taco: you and your teammates reacted, with their XP, on Monday morning. [select: As a DM]";
const sendMondayDm = "slack/mondayDm:sendMondayDm";

const everyone = ["U_ALICE", "U_BOB", "U_CAROL", "U_DANA", "U_ERIN"];

let slack: FakeSlack;
let postHog: FakePostHog;

beforeEach(() => {
  vi.useFakeTimers({ now: tuesday });
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  slack = new FakeSlack();
  for (const user of everyone) slack.withMember(user, { profile: { email: emailOf(user) } });
  postHog = flagsOnForEveryone(slack.fetch, "hugs", "xp-levels", "message-settings");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SR12: at Monday 09:00 in their time zone, a member who gave or received hugs last week gets one recap DM", () => {
  test("each member with hugs gets exactly their week in hugs at 09:00, and nobody else gets a recap", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await hug(t, "U_CAROL", "U_ALICE", messageOf(1));
    await hug(t, "U_DANA", "U_ALICE", messageOf(2));
    await hug(t, "U_ALICE", "U_BOB", messageOf(3));
    await hug(t, "U_BOB", "U_ERIN", messageOf(4));
    await hug(t, "U_CAROL", "U_ERIN", messageOf(4));
    await hug(t, "U_DANA", "U_ERIN", messageOf(5));

    await sweepAt(t, tuesday + hourMs);
    await settleUpTo(t, mondayNineInUtc - 1);
    expect(recaps()).toEqual([]);

    await settleUpTo(t, mondayNineInUtc);
    expect(recaps()).toEqual([
      {
        channel: "U_ALICE",
        text: [":taco: Your week in hugs", "You reacted :taco: and gave 1 hug (+1 XP).", "Teammates reacted :taco: on your messages and gave you 3 hugs (+3 XP).", `2 teammates reacted :taco: on your most-hugged message: <${permalinkOf(messageOf(1))}|open it in Slack>`, nudge, footer].join("\n"),
      },
      { channel: "U_BOB", text: [":taco: Your week in hugs", "You reacted :taco: and gave 2 hugs (+2 XP).", "Teammates reacted :taco: on your messages and gave you 1 hug (+1 XP).", `1 teammate reacted :taco: on your most-hugged message: <${permalinkOf(messageOf(3))}|open it in Slack>`, nudge, footer].join("\n") },
      { channel: "U_CAROL", text: [":taco: Your week in hugs", "You reacted :taco: and gave 2 hugs (+2 XP).", nudge, footer].join("\n") },
      { channel: "U_DANA", text: [":taco: Your week in hugs", "You reacted :taco: and gave 2 hugs (+2 XP).", nudge, footer].join("\n") },
      { channel: "U_ERIN", text: [":taco: Your week in hugs", "Teammates reacted :taco: on your messages and gave you 3 hugs (+3 XP).", `2 teammates reacted :taco: on your most-hugged message: <${permalinkOf(messageOf(4))}|open it in Slack>`, nudge, footer].join("\n") },
    ]);
    expect(new Set(recapTimes())).toEqual(new Set([mondayNineInUtc]));
  });

  test("a member who gave and got no hug last week gets no recap, and a week without hugs sends nothing the next Monday", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    await sweepAt(t, tuesday + hourMs);
    await sweepAt(t, mondayNineInUtc + hourMs);
    await sweepAt(t, mondayNineInUtc + 7 * dayMs + hourMs);

    expect(recaps().map(({ channel }) => channel)).toEqual(["U_ALICE", "U_BOB"]);
  });

  test("the most-hugged line is left out while the workspace URL isn't known", async () => {
    const t = await workspace({ urlKnown: false });
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    await recapsSentOnMonday(t);

    expect(recapTo("U_ALICE")).toEqual([":taco: Your week in hugs", "Teammates reacted :taco: on your messages and gave you 1 hug (+1 XP).", nudge, footer].join("\n"));
  });

  test("without message-settings the recap carries no settings footer", async () => {
    const t = await workspace();
    await flagsFromPostHog(t, postHog, onForEveryone("hugs"), onForEveryone("xp-levels"));
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    await recapsSentOnMonday(t);

    expect(recapTo("U_ALICE")).toEqual([":taco: Your week in hugs", "Teammates reacted :taco: on your messages and gave you 1 hug (+1 XP).", `1 teammate reacted :taco: on your most-hugged message: <${permalinkOf(messageOf(1))}|open it in Slack>`, nudge].join("\n"));
  });

  test("in a half-hour time zone the recap arrives at Monday 09:00 there", async () => {
    slack.withMember("U_ALICE", { tz: "Asia/Kolkata", profile: { email: emailOf("U_ALICE") } });
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    await recapsSentOnMonday(t);

    expect(recapTimesTo("U_ALICE")).toEqual([mondayNineInKolkata]);
    expect(recapTimesTo("U_BOB")).toEqual([mondayNineInUtc]);
  });
  test("a member whose time zone moves west after the sweep gets the recap at 09:00 in their new zone", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await sweepAt(t, tuesday + hourMs);

    await memberChanged(t, "user_change", { id: "U_ALICE", tz: "America/New_York", profile: { email: emailOf("U_ALICE") } });
    await settleUpTo(t, mondayNineInNewYork + hourMs);

    expect(recapTimesTo("U_ALICE")).toEqual([mondayNineInNewYork]);
    expect(recapTimesTo("U_BOB")).toEqual([mondayNineInUtc]);
  });
});

describe("HH14: the hugs recap closes on what a kudos earns", () => {
  test("its last line names a kudos as a message that mentions a teammate with the workspace's kudos emoji", async () => {
    const t = await workspace({ urlKnown: false });
    await setWorkspaceSettings(t, { kudosEmoji: "raised_hands" });
    await react(t, { user: "U_BOB", itemUser: "U_ALICE", ts: messageOf(1), reaction: "raised_hands" });
    await settleUpTo(t, Date.now() + minuteMs);

    await recapsSentOnMonday(t);

    const [recap] = slack.callsTo("chat.postMessage").filter(({ channel }) => channel === "U_ALICE");
    expect(String(recap?.text).split("\n").slice(-2)).toEqual(["Hugs are a quick thanks. A kudos, a message that mentions a teammate with :raised_hands:, earns much more XP.", footer]);
  });
});

describe("HH30: the recap reads the week's hugs from Leaderboard and their XP from Progression", () => {
  test("a hug Leaderboard counted that the recap's own week never saw shows, at the hug XP each", async () => {
    const t = await workspace({ urlKnown: false });
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await hugCounted(t, await memberOf(t, "U_BOB"), await memberOf(t, "U_ALICE"), { day: "2026-10-14" });

    await recapsSentOnMonday(t);

    expect(recapTo("U_BOB")).toEqual([":taco: Your week in hugs", "You reacted :taco: and gave 2 hugs (+2 XP).", nudge, footer].join("\n"));
    expect(recapTo("U_ALICE")).toEqual([":taco: Your week in hugs", "Teammates reacted :taco: on your messages and gave you 2 hugs (+2 XP).", nudge, footer].join("\n"));
  });

  test("the day bonuses of the member's seven days add to the XP given and the week's bonus to the XP received, and a bonus of another week adds nothing", async () => {
    const t = await workspace({ urlKnown: false });
    await hug(t, "U_ALICE", "U_BOB", messageOf(1));
    await hug(t, "U_BOB", "U_ALICE", messageOf(2));
    const alice = await memberOf(t, "U_ALICE");
    for (const key of ["hug-day:2026-10-13", "hug-day:2026-10-18"]) await bonusPaid(t, alice, key, 9);
    await bonusPaid(t, alice, "hug-week:2026-10-12", 4);
    for (const key of ["hug-day:2026-10-11", "hug-day:2026-10-19", "hug-week:2026-10-05", "hug-week:2026-10-19"]) await bonusPaid(t, alice, key, 100);

    await recapsSentOnMonday(t);

    expect(recapTo("U_ALICE")).toEqual([":taco: Your week in hugs", "You reacted :taco: and gave 1 hug (+19 XP).", "Teammates reacted :taco: on your messages and gave you 1 hug (+5 XP).", nudge, footer].join("\n"));
    expect(recapsSent().map(({ properties }) => [properties.hugs_given, properties.hugs_received, properties.xp])).toEqual([
      [1, 1, 24],
      [1, 1, 2],
    ]);
  });
});

describe("SR12 SR14: the most-hugged message is the one that got the member the most hugs in their week", () => {
  test("a message hugged 9 times on Sunday and once on Monday loses Monday's week to one hugged twice on Monday", async () => {
    const sunday = Date.parse("2026-10-11T20:00:00Z");
    const monday = Date.parse("2026-10-12T10:00:00Z");
    const givers = Array.from({ length: 10 }, (_, index) => `U_GIVER${index}`);
    for (const giver of givers) slack.withMember(giver);
    vi.setSystemTime(sunday);
    const t = await workspace();
    const sundaysMessage = slackTs(sunday - hourMs);
    for (const giver of givers.slice(0, 9)) await hug(t, giver, "U_ALICE", sundaysMessage);

    await settleUpTo(t, monday);
    const mondaysMessage = slackTs(monday - hourMs);
    await hug(t, givers[9]!, "U_ALICE", sundaysMessage);
    await hug(t, "U_BOB", "U_ALICE", mondaysMessage);
    await hug(t, "U_CAROL", "U_ALICE", mondaysMessage);
    await sweepAt(t, monday + hourMs);
    await settleUpTo(t, mondayNineInUtc);

    expect(recapsTo("U_ALICE").map(({ text }) => text.split("\n").slice(1, 3))).toEqual([
      ["Teammates reacted :taco: on your messages and gave you 9 hugs (+9 XP).", `9 teammates reacted :taco: on your most-hugged message: <${permalinkOf(sundaysMessage)}|open it in Slack>`],
      ["Teammates reacted :taco: on your messages and gave you 3 hugs (+3 XP).", `2 teammates reacted :taco: on your most-hugged message: <${permalinkOf(mondaysMessage)}|open it in Slack>`],
    ]);
  });

  test("on a tie, the message whose last hug came latest", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await hug(t, "U_BOB", "U_ALICE", messageOf(2));
    await hug(t, "U_CAROL", "U_ALICE", messageOf(2));
    await hug(t, "U_CAROL", "U_ALICE", messageOf(1));

    await recapsSentOnMonday(t);

    expect(recapTo("U_ALICE")).toContain(`2 teammates reacted :taco: on your most-hugged message: <${permalinkOf(messageOf(1))}|open it in Slack>`);
  });

  test("a most-hugged kudos posted as a thread reply links to the reply inside its thread, as the timeline does", async () => {
    const t = await workspace();
    const threadRoot = messageOf(1);
    const reply = messageOf(2);
    await t.fetch("/slack/events", await signedRequest(messageEvent([section(mention("U_ALICE"), emoji("taco"))], { user: "U_BOB", ts: reply, threadTs: threadRoot })));
    await settleUpTo(t, Date.now() + minuteMs);
    await hug(t, "U_CAROL", "U_BOB", reply);

    await recapsSentOnMonday(t);

    expect(recapTo("U_ALICE")).toContain(`1 teammate reacted :taco: on your most-hugged message: <${permalinkOf(reply)}?thread_ts=${threadRoot}&cid=C1|open it in Slack>`);
  });
});

describe("SR12 SR14: one recap per member and week, in the Monday DM", () => {
  test("a member whose quests never started gets their week in hugs as a Monday DM with the hugs section alone", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    await recapsSentOnMonday(t);

    expect(mondayDmsSent().map(({ properties }) => properties.sections)).toEqual(["hugs", "hugs"]);
  });

  test("a week the sweep first sees after its Monday 09:00 sends one recap at once", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await settleUpTo(t, mondayNineInUtc + hourMs);

    await sweepAt(t, Date.now());

    expect(recapTimes()).toEqual([mondayNineInUtc + hourMs, mondayNineInUtc + hourMs]);
  });

  test("a redelivered sweep and two sweeps in the same hour send one recap", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    await sweepAt(t, tuesday + hourMs);
    await sweepAt(t, tuesday + hourMs);
    await sweepAt(t, tuesday + hourMs + 20 * minuteMs);
    await sweepAt(t, tuesday + 2 * hourMs);
    await settleUpTo(t, mondayNineInUtc + hourMs);
    await sweepAt(t, mondayNineInUtc + 2 * hourMs);

    expect(recapsTo("U_ALICE")).toHaveLength(1);
    expect(recapsTo("U_BOB")).toHaveLength(1);
  });

  test("a recap Slack answered with an error is not sent again", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await sweepAt(t, tuesday + hourMs);
    slack.answering("chat.postMessage", httpStatus(500));

    await settleUpTo(t, mondayNineInUtc + hourMs);
    await sweepAt(t, mondayNineInUtc + 2 * hourMs);

    expect(slack.callsTo("chat.postMessage").map(({ channel }) => channel).toSorted()).toEqual(["U_ALICE", "U_BOB"]);
    expect(recapsSent()).toHaveLength(1);
  });

  test("the sweep ensures more Monday DMs than one mutation may schedule, within Convex's limits", { timeout: 120_000 }, async () => {
    const t = await workspace({ transactionLimits: true });
    await hugWeeksSeeded(t, 1_100);

    await sweepAt(t, tuesday + hourMs);

    expect(await pendingJobs(t, sendMondayDm)).toBe(1_100);
  });
});

describe("SR12: a hug week carries no field of the retired standalone recap", () => {
  test("a week a hug starts has none of them, and goes out once in the Monday DM", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    expect(await legacyFieldsOnHugWeeks(t)).toEqual([[], []]);
    await recapsSentOnMonday(t);
    expect(recaps().map(({ channel }) => channel)).toEqual(["U_ALICE", "U_BOB"]);
  });

  test("clearing pages through every week, drops only the retired fields, and the cleared weeks go out once in the Monday DM", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await hug(t, "U_CAROL", "U_ALICE", messageOf(1));
    await leftByTheStandaloneRecap(t);
    const before = await hugWeekRows(t);

    expect(await clearedPageByPage(t, 2)).toEqual([2, 1]);

    expect(await legacyFieldsOnHugWeeks(t)).toEqual([[], [], []]);
    expect(await hugWeekRows(t)).toEqual(before.map(({ recap, tries, dueAt, ...kept }) => kept));
    expect(await clearedPageByPage(t, 2)).toEqual([0, 0]);
    await recapsSentOnMonday(t);
    expect(recaps().map(({ channel }) => channel)).toEqual(["U_ALICE", "U_BOB", "U_CAROL"]);
  });
});

describe("SR12 SR13 SR21: the recap goes only while the member wants it", () => {
  test("a member whose hugs-recap place is none gets no recap, and the giver still gets theirs", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await openSettings(t, "U_ALICE");

    await pick(t, "U_ALICE", "Weekly hugs recap", "None");
    await recapsSentOnMonday(t);

    expect(recaps().map(({ channel }) => channel)).toEqual(["U_BOB"]);
  });

  test("a member paid by a flag-on giver while their own hugs is off gets no recap", async () => {
    const t = await workspace();
    await flagsFromPostHog(t, postHog, onForEmails("hugs", emailOf("U_BOB")), onForEveryone("xp-levels"), onForEveryone("message-settings"));
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    await recapsSentOnMonday(t);

    expect(recaps().map(({ channel }) => channel)).toEqual(["U_BOB"]);
    expect(recapsSent()).toHaveLength(1);
  });

  test("while xp-levels is off for the member nobody gets a recap", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await flagsFromPostHog(t, postHog, onForEveryone("hugs"), onForEveryone("message-settings"));

    await recapsSentOnMonday(t);

    expect(recaps()).toEqual([]);
  });

  test("SR13: the Weekly hugs recap row shows in the Settings tab only while hugs is on for the member, as a DM or none", async () => {
    const t = await workspace();
    await flagsFromPostHog(t, postHog, onForEmails("hugs", emailOf("U_BOB")), onForEveryone("xp-levels"), onForEveryone("message-settings"));
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));

    await openSettings(t, "U_ALICE");
    await openSettings(t, "U_BOB");

    expect(publishedHome(slack, "U_ALICE")).not.toContain(recapRow);
    expect(publishedHome(slack, "U_BOB")).toContain(recapRow);
    expect(placesOfferedTo("U_BOB", "Weekly hugs recap")).toEqual(["As a DM", "None"]);
  });

  test("SR13: the notification switches never write the hugs recap's place", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await flagsFromPostHog(t, postHog, onForEveryone("hugs"), onForEveryone("xp-levels"));
    await openSettings(t, "U_ALICE");

    await click(t, "U_ALICE", "Turn off DMs");
    await recapsSentOnMonday(t);

    expect(recaps().map(({ channel }) => channel)).toEqual(["U_ALICE", "U_BOB"]);
  });
});

describe("SR16: hugs recap sent reaches PostHog", () => {
  test("with the hugs given and received, their XP and the Monday DM as its DM, and nothing else", async () => {
    const t = await workspace();
    await hug(t, "U_BOB", "U_ALICE", messageOf(1));
    await hug(t, "U_CAROL", "U_ALICE", messageOf(1));
    await hug(t, "U_ALICE", "U_BOB", messageOf(2));

    await recapsSentOnMonday(t);

    const shared = { environment: "sandbox", workspace_key: expect.any(String), taxonomy_version: expect.any(Number) };
    expect(recapsSent().map(({ properties }) => properties)).toEqual([
      { ...shared, hugs_given: 1, hugs_received: 2, xp: 3, via: "monday" },
      { ...shared, hugs_given: 1, hugs_received: 1, xp: 2, via: "monday" },
      { ...shared, hugs_given: 1, hugs_received: 0, xp: 1, via: "monday" },
    ]);
    expect(JSON.stringify(recapsSent())).not.toMatch(new RegExp(`U_ALICE|U_BOB|U_CAROL|C1|${messageOf(1).split(".")[0]}`));
  });

  test("a recap queued before via existed is sent without it", async () => {
    const t = await workspace();
    const member = await t.run((ctx) => ctx.db.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member" }));

    await t.mutation(internal.analytics.isolatedUsage.recordHugsRecapSent, { workspace: "T1", member, given: 1, received: 2, xp: 3, at: Date.now() });

    await settleUpTo(t, Date.now() + minuteMs);
    expect(recapsSent().map(({ properties }) => Object.keys(properties))).toEqual([expect.not.arrayContaining(["via"])]);
    expect(recapsSent().map(({ properties }) => properties.hugs_received)).toEqual([2]);
  });
});

async function workspace({ transactionLimits = false, urlKnown = true } = {}) {
  const t = testBackend({ transactionLimits });
  await setWorkspaceSettings(t, { kudosEmoji: "taco" });
  if (urlKnown) await t.mutation(internal.workspace.url.rememberWorkspaceUrl, { workspace: "T1", url: "https://t1.slack.com/" });
  return flagsLoaded(t);
}

async function hug(t: Backend, giver: string, author: string, message: string) {
  await react(t, { user: giver, itemUser: author, ts: message });
  await settleUpTo(t, Date.now() + minuteMs);
}

async function memberOf(t: Backend, user: string): Promise<MemberId> {
  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("workspace", "T1").eq("user", user))
      .unique(),
  );
  if (member === null) throw new Error(`no member ${user}`);
  return member._id;
}

async function bonusPaid(t: Backend, member: MemberId, key: string, xp: number) {
  await t.run((ctx) => recordReward(ctx, "T1", { member, key, xp, coins: 0, item: null, catalogueVersion: "hugs-1", at: Date.now() }));
}

async function hugWeeksSeeded(t: Backend, members: number) {
  await t.run(async (ctx) => {
    for (let index = 0; index < members; index += 1) {
      const member = await ctx.db.insert("members", { workspace: "T1", user: `U_SEEDED${index}`, kind: "member" });
      await ctx.db.insert("hugWeeks", { workspace: "T1", member, week: "2026-10-12", given: 1, givenXp: 1, received: 0, receivedXp: 0 });
    }
  });
}

async function leftByTheStandaloneRecap(t: Backend) {
  await t.run(async (ctx) => {
    for (const week of await ctx.db.query("hugWeeks").collect()) await ctx.db.patch(week._id, { recap: "scheduled", dueAt: mondayNineInUtc, tries: 0 });
  });
}

async function hugWeekRows(t: Backend) {
  return t.run(async (ctx) => (await ctx.db.query("hugWeeks").collect()).map((week) => ({ ...week }) as Record<string, unknown>));
}

async function legacyFieldsOnHugWeeks(t: Backend) {
  return (await hugWeekRows(t)).map((week) => ["recap", "tries", "dueAt"].filter((field) => field in week));
}

async function clearedPageByPage(t: Backend, numItems: number) {
  const cleared: number[] = [];
  let cursor: string | null = null;
  do {
    const page: { cleared: number; next: string | null } = await t.mutation(makeFunctionReference<"mutation">("hugs/legacyRecapFields:clearLegacyRecapFields"), { cursor, numItems });
    cleared.push(page.cleared);
    cursor = page.next;
  } while (cursor !== null);
  return cleared;
}

function mondayDmSweep() {
  const job = crons.crons["ensure each member's coming Monday DM"];
  if (job === undefined) throw new Error("no cron job ensures each member's coming Monday DM");
  expect(job.schedule).toEqual({ type: "interval", hours: 1 });
  return makeFunctionReference<"mutation">(job.name);
}

async function sweepAt(t: Backend, at: number) {
  await settleUpTo(t, at);
  await t.mutation(mondayDmSweep(), {});
  await settleUpTo(t, at);
}

async function recapsSentOnMonday(t: Backend) {
  await sweepAt(t, Date.now() + hourMs);
  await settleUpTo(t, mondayNineInUtc + hourMs);
}

async function openHome(t: Backend, user: string) {
  await t.fetch("/slack/events", await signedRequest(appHomeOpened(user)));
  await settleUpTo(t, Date.now());
}

async function openSettings(t: Backend, user: string) {
  await openHome(t, user);
  await click(t, user, "Settings");
}

async function click(t: Backend, user: string, label: string) {
  const button = publishedHomeBlocks(slack, user)
    .flatMap((block) => [...(block.type === "actions" ? (block.elements as BlockAction[]) : []), ...(block.accessory ? [block.accessory as BlockAction] : [])])
    .find((element) => "text" in element && (element.text as { text: string }).text === label);
  expect(button, `${label} in ${user}'s App Home`).toBeDefined();
  await interact(t, user, button!);
}

async function pick(t: Backend, user: string, row: string, option: string) {
  await interact(t, user, optionPickedInHome(slack, user, row, option));
}

async function interact(t: Backend, user: string, action: BlockAction) {
  await t.fetch("/slack/interactivity", await signedRequest(blockActions(user, action), form));
  await settleUpTo(t, Date.now());
}

function placesOfferedTo(user: string, row: string) {
  const picker = publishedHomeBlocks(slack, user).find((block) => block.text?.text.startsWith(`*${row}*`))?.accessory;
  return (picker?.options ?? []).map(({ text }) => text.text);
}

function isRecap({ text }: { text?: unknown }) {
  return String(text).startsWith(":taco: Your week in hugs");
}

function recaps() {
  return everyone.flatMap(recapsTo);
}

function recapsTo(user: string) {
  return slack
    .messagesIn(user)
    .filter(isRecap)
    .map(({ channel, text }) => ({ channel, text }));
}

function recapTo(user: string) {
  const [recap, ...more] = recapsTo(user);
  expect(more).toEqual([]);
  return recap?.text;
}

function recapTimes() {
  return slack.timesOf("chat.postMessage", isRecap);
}

function recapTimesTo(user: string) {
  return slack.timesOf("chat.postMessage", (args) => isRecap(args) && args.channel === user);
}

function recapsSent() {
  return postHog
    .productEvents()
    .filter(({ event }) => event === "hugs recap sent")
    .toSorted((first, second) => Number(second.properties.xp) - Number(first.properties.xp));
}

function messageOf(index: number) {
  return slackTs(tuesday - hourMs + index * minuteMs);
}

function permalinkOf(message: string) {
  return `https://t1.slack.com/archives/C1/p${message.replace(".", "")}`;
}

function emailOf(user: string) {
  return `${user.toLowerCase()}@example.com`;
}

function slackTs(at: number) {
  return `${Math.floor(at / 1000)}.000100`;
}

function mondayDmsSent() {
  return postHog.productEvents().filter(({ event, properties }) => event === "dm sent" && properties.kind === "monday");
}
