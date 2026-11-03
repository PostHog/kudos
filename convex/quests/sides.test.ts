import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../testing/fakePostHog";
import { FakeSlack } from "../../testing/fakeSlack";
import { deliverAgain, post, react, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, section, text } from "../../testing/slackMessages";
import { aDeploymentForWorkspace, aSignedInSession, switchWebsite } from "../../testing/website";
import { api, internal } from "../_generated/api";
import type { HugGivenEvent } from "../bus/events";
import { standingOf } from "../progression/progression";
import { rewardOf } from "../progression/rewards";
import type { AlbumAnswer, AlbumRead } from "../website/album";
import type { MemberId } from "../workspace/directory";
import { questsFinishedByMessage } from "./finishedBy";
import { hugQuestPool, mondayQuestPool } from "./pool";

const tuesday = new Date("2026-10-13T10:00:00Z");
const nextMonday = new Date("2026-10-19T10:00:00Z");
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const people = {
  alice: { user: "U_ALICE", name: "Alice Marchetti" },
  bob: { user: "U_BOB", name: "Bob Okonkwo" },
  carol: { user: "U_CAROL", name: "Carol Lindqvist" },
  dave: { user: "U_DAVE", name: "Dave Ishikawa" },
  erin: { user: "U_ERIN", name: "Erin Castillo" },
  frank: { user: "U_FRANK", name: "Frank Adeyemi" },
  gina: { user: "U_GINA", name: "Gina Rossi" },
};
const { alice, bob, carol, dave, erin, frank, gina } = people;
const todaysFlags = ["xp-levels", "album", "collection", "packs", "hidden-items", "onboarding", "hugs"];
const mondayPath = [...todaysFlags, "monday-quest"];
const twoQuests = [...mondayPath, "two-quests"];
const hugSlotKey = (week: string) => `weekly:${week}:3`;
const kudosSlotKey = (week: string) => `weekly:${week}:4`;

type Person = { user: string; name: string };

let postHog: FakePostHog;
let t: Backend;
let messages = 0;

beforeEach(async () => {
  vi.useFakeTimers({ now: tuesday });
  aDeploymentForWorkspace();
  postHog = new FakePostHog();
  const slack = new FakeSlack();
  for (const person of Object.values(people)) slack.withMember(person.user, { real_name: person.name });
  vi.stubGlobal("fetch", routedFetch(postHog, slack.fetch));
  t = testBackend();
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("HH48: once a side's onboarding is finished, that side's quest is drawn each week from its own pool", { timeout: 60_000 }, () => {
  test("a member who finished the kudos onboarding gets one kudos quest at the next trigger, and the kudos it asks for finishes it once with 20 XP and a hoggie", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    expect(await sideDrawsOf(bob), "drawn by the kudos that finished onboarding").toEqual([]);

    await sweep();
    const [drawn] = await sideDrawsOf(bob);
    expect(drawn, "the week's kudos quest").toMatchObject({ week: "2026-10-12", side: "kudos" });
    expect(mondayQuestPool.quests.map(({ quest }) => quest)).toContain(drawn!.quest);

    await doesEveryKudosQuest(bob);

    expect(await finishKeysOf(bob), "the side quests finished").toEqual([kudosSlotKey("2026-10-12")]);
    expect(await paidFor(bob, kudosSlotKey("2026-10-12")), "Progression's reward for the quest").toMatchObject({ xp: 20, coins: 0 });
    expect(await questItemsOf(bob), "the quest hoggies on the board").toContainEqual({ kind: "quest", quest: { kind: "weekly", week: "2026-10-12", slot: 4 } });
  });

  test("a kudos quest's finish names no kudos message as its cause, so no reply or activity names it before PR 5's surfaces", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    await sweep();

    const finishing = await doesEveryKudosQuest(bob);
    const member = await memberOf(bob);
    const answered = await Promise.all(finishing.map((ts) => t.run((ctx) => questsFinishedByMessage(ctx, member, { workspace: "T1", conversation: "C1", message: ts }))));

    expect(await finishKeysOf(bob)).toEqual([kudosSlotKey("2026-10-12")]);
    expect(answered.flat()).toEqual([]);
  });

  test("the activity reads the goal of a stored kudos quest finish that names its kudos, as the release showing the two quests stores it", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    await drawnFor(bob, "kudos", "kudos-once");
    const member = await memberOf(bob);
    const cause = { workspace: "T1", conversation: "C1", message: "1792000000.000900" };
    await t.run((ctx) => ctx.db.insert("rewardRecords", { member, key: kudosSlotKey("2026-10-12"), xp: 20, coins: 0, item: null, catalogueVersion: "monday-1", at: Date.now(), cause }));

    expect(await t.run((ctx) => questsFinishedByMessage(ctx, member, cause))).toEqual([{ kind: "weekly", goal: "Give a kudos to someone.", xp: 20, hoggie: true }]);
  });

  test("a member who finished the hug ladder gets one hug quest at the next trigger, and the hugs it asks for finish it once", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);
    expect(await finishKeysOf(bob, "journey:"), "the ladder").toContain("journey:hugs-10");
    expect(await sideDrawsOf(bob), "drawn by the hug that finished the ladder").toEqual([]);

    await sweep();
    const [drawn] = await sideDrawsOf(bob);
    expect(drawn, "the week's hug quest").toMatchObject({ week: "2026-10-12", side: "hug" });
    expect(hugQuestPool.quests.map(({ quest }) => quest)).toContain(drawn!.quest);

    await doesEveryHugQuest(bob);

    expect(await finishKeysOf(bob), "the side quests finished").toEqual([hugSlotKey("2026-10-12")]);
    expect(await paidFor(bob, hugSlotKey("2026-10-12")), "Progression's reward for the quest").toMatchObject({ xp: 20, coins: 0 });
    expect(await questItemsOf(bob), "the quest hoggies on the board").toContainEqual({ kind: "quest", quest: { kind: "weekly", week: "2026-10-12", slot: 3 } });
  });

  test("a side whose onboarding is unfinished draws nothing: hugs before the ladder's end and a newcomer's kudos", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    for (let hug = 1; hug <= 9; hug += 1) await hugs(bob, alice);
    await thanks(bob, alice);

    await sweep();

    expect(await sideDrawsOf(bob)).toEqual([]);
  });

  test("each side is drawn once a week; the next week draws again, and last week's quest counts nothing then", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    await sweep();
    const drawsScheduled = await drawsScheduledFor(bob);
    await sweep();
    expect(await drawsScheduledFor(bob), "draws the second sweep scheduled").toBe(drawsScheduled);
    expect((await sideDrawsOf(bob)).map(({ week, side }) => `${week} ${side}`), "this week").toEqual(["2026-10-12 kudos"]);

    vi.setSystemTime(nextMonday);
    await sweep();
    await doesEveryKudosQuest(bob);

    expect((await sideDrawsOf(bob)).map(({ week, side }) => `${week} ${side}`), "both weeks").toEqual(["2026-10-12 kudos", "2026-10-19 kudos"]);
    expect(await finishKeysOf(bob), "only this week's quest finished").toEqual([kudosSlotKey("2026-10-19")]);
  });

  test("HH18: kudosGiven and hugGiven delivered to Quests twice finish nothing twice and pay once", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);
    await sweep();
    await doesEveryKudosQuest(bob);
    await doesEveryHugQuest(bob);
    const xp = await xpOf(bob);

    await deliverAgain(t, "quests/quests:followKudosGiven");
    await deliverAgain(t, "quests/quests:followHugGiven");

    expect(await finishKeysOf(bob)).toEqual([hugSlotKey("2026-10-12"), kudosSlotKey("2026-10-12")]);
    expect(await xpOf(bob)).toBe(xp);
  });

  test("the hug that finished the ladder, delivered again, draws nothing", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);

    await deliverAgain(t, "quests/quests:followHugGiven");

    expect(await sideDrawsOf(bob)).toEqual([]);
  });

  test("a kudosGiven from an earlier week, delivered again once two-quests is on, draws and finishes nothing for that week", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await finishKudosOnboarding(bob);
    await thanks(bob, dave, erin, frank);
    vi.setSystemTime(nextMonday);
    await switchWebsite(t, postHog, true, ...twoQuests);

    await deliverAgain(t, "quests/quests:followKudosGiven");

    expect((await sideDrawsOf(bob)).filter(({ week }) => week === "2026-10-12")).toEqual([]);
    expect(await finishKeysOf(bob), "the three-quest week's finishes, from before the flag").not.toContain(kudosSlotKey("2026-10-12"));
  });

  test("HH57: with two-quests off, no side is drawn, the three-quest week is drawn as before, and hugs finish nothing", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await finishKudosOnboarding(bob);
    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);

    await sweep();

    expect(await sideDrawsOf(bob)).toEqual([]);
    expect(await t.run(async (ctx) => (await ctx.db.query("questDraws").collect()).length), "the three-quest draw").toBe(1);
  });
});

describe("HH49, HH50: each quest of the two pools counts what it names, from the facts since its draw", { timeout: 60_000 }, () => {
  const kudosWeek = kudosSlotKey("2026-10-12");
  const hugWeek = hugSlotKey("2026-10-12");
  const nextDay = () => vi.setSystemTime(Date.now() + dayMs);

  test.each([
    ["kudos-once", async () => [], async () => thanks(bob, alice)],
    ["kudos-two-days", async () => [await thanks(bob, alice), await thanks(bob, carol)], async () => (nextDay(), thanks(bob, alice))],
    ["three-in-a-day", async () => [await thanks(bob, alice, carol), nextDay(), await thanks(bob, dave)], async () => thanks(bob, erin, frank)],
    ["someone-new", async () => [await thanks(bob, alice, carol)], async () => thanks(bob, dave)],
    ["two-new", async () => [await thanks(bob, dave), await thanks(bob, dave, alice)], async () => thanks(bob, erin)],
    ["not-in-30-days", async () => [await thanks(bob, alice)], async () => thanks(bob, gina)],
  ] as const)("%s", async (quest, notYet, finishes) => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    await drawnFor(bob, "kudos", quest);

    await notYet();
    expect(await finishKeysOf(bob), "before the kudos that finishes it").toEqual([]);
    await finishes();

    expect(await finishKeysOf(bob)).toEqual([kudosWeek]);
  });

  test.each([
    ["hug-once", 0, async () => hugs(bob, alice)],
    ["hug-two-days", 2, async () => (nextDay(), hugs(bob, alice))],
    ["hug-ten", 9, async () => hugs(bob, alice)],
  ] as const)("%s", async (quest, hugsBefore, finishes) => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await thanks(bob, carol);
    await drawnFor(bob, "hug", quest);

    for (let hug = 1; hug <= hugsBefore; hug += 1) await hugs(bob, alice);
    expect(await finishKeysOf(bob), "before the hug that finishes it").toEqual([]);
    await finishes();

    expect(await finishKeysOf(bob)).toEqual([hugWeek]);
  });

  test("a quest finishes at the fact that first reached its target in time order, whichever order the facts are delivered in", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await thanks(bob, carol);
    await drawnFor(bob, "hug", "hug-two-days");
    const tuesdaysHug = Date.now() + minuteMs;
    nextDay();
    await hugs(bob, alice);
    await hugs(bob, carol);
    const [wednesdays] = await questsHugGivenEvents();
    await t.mutation(internal.quests.quests.followHugGiven, { event: { ...wednesdays!, day: "2026-10-13", at: tuesdaysHug, message: { ...wednesdays!.message, message: tsOf(tuesdaysHug) } } });
    await settle(t);

    expect(await finishKeysOf(bob)).toEqual([hugWeek]);
    expect(await finishedAt(bob, hugWeek), "when Wednesday's first hug reached two days, not its later one").toBe(wednesdays!.at);
  });

  test("a kudos given before the draw counts nothing toward it", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await thanks(bob, dave);
    await finishKudosOnboarding(bob);
    await drawnFor(bob, "kudos", "someone-new");

    await thanks(bob, dave);
    expect(await finishKeysOf(bob), "dave was thanked before the draw, so he is not new").toEqual([]);
    await thanks(bob, erin);

    expect(await finishKeysOf(bob)).toEqual([kudosWeek]);
  });
});

// Stores the week's quest of one side, as a draw at this moment would, so a test picks the quest the rank hash would not.
async function drawnFor(person: Person, side: "hug" | "kudos", quest: (typeof hugQuestPool.quests | typeof mondayQuestPool.quests)[number]["quest"]) {
  const member = await memberOf(person);
  expect(await sideDrawsOf(person), "no draw of its own yet").toEqual([]);
  vi.setSystemTime(Date.now() + minuteMs);
  await t.run((ctx) => ctx.db.insert("questSideDraws", { member, week: "2026-10-12", side, quest, reward: { xp: 20, coins: 0, item: null }, catalogueVersion: "monday-1", feasibleBecause: { hugsLeft: 10 }, drawnAt: Date.now() }));
}

async function finishKudosOnboarding(person: Person) {
  await thanks(person, alice);
  await thanks(person, carol);
  vi.setSystemTime(Date.now() + dayMs);
  await thanks(person, alice);
}

// Every kudos quest of the pool finishes from these: three people never thanked, in one kudos on one day, then one more the next day.
async function doesEveryKudosQuest(person: Person) {
  const first = await thanks(person, dave, erin, frank);
  vi.setSystemTime(Date.now() + dayMs);
  const second = await thanks(person, gina);
  return [first, second];
}

// Every hug quest of the pool finishes from these: ten hugs the next day, and one more the day after.
async function doesEveryHugQuest(person: Person) {
  vi.setSystemTime(Date.now() + dayMs);
  for (let hug = 1; hug <= 10; hug += 1) await hugs(person, carol);
  vi.setSystemTime(Date.now() + dayMs);
  await hugs(person, carol);
}

async function sweep() {
  await t.mutation(internal.quests.newWeek.sweep, {});
  await settle(t);
}

async function thanks(giver: Person, ...recipients: Person[]) {
  vi.setSystemTime(Date.now() + minuteMs);
  const ts = tsOf(Date.now());
  await post(t, [section(text("thanks "), ...recipients.flatMap(({ user }) => [mention(user), text(" ")]), emoji("taco"))], { user: giver.user, ts });
  await settle(t);
  return ts;
}

async function hugs(giver: Person, author: Person) {
  vi.setSystemTime(Date.now() + minuteMs);
  await react(t, { user: giver.user, itemUser: author.user, ts: tsOf(Date.now() - minuteMs / 2) });
  await settle(t);
}

function tsOf(at: number) {
  messages += 1;
  return `${Math.floor(at / 1000)}.${String(messages).padStart(6, "0")}`;
}

async function drawsScheduledFor(person: Person) {
  const member = await memberOf(person);
  return t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).filter(({ name, args }) => name === "quests/weekly:drawNewWeek" && (args[0] as { member: string }).member === member).length);
}

async function sideDrawsOf(person: Person) {
  const member = await memberOf(person);
  return t.run(async (ctx) => (await ctx.db.query("questSideDraws").collect()).filter((row) => row.member === member));
}

async function finishKeysOf(person: Person, prefix = "weekly:") {
  const member = await memberOf(person);
  const rows = await t.run((ctx) => ctx.db.query("questFinishes").withIndex("by_member_key", (q) => q.eq("member", member)).collect());
  return rows.map(({ key }) => key).filter((key) => key.startsWith(prefix)).sort();
}

async function questsHugGivenEvents() {
  return t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).filter(({ name }) => name === "quests/quests:followHugGiven").map(({ args }) => (args[0] as { event: HugGivenEvent }).event));
}

async function finishedAt(person: Person, key: string) {
  const member = await memberOf(person);
  return t.run(async (ctx) => (await ctx.db.query("questFinishes").withIndex("by_member_key", (q) => q.eq("member", member).eq("key", key)).unique())?.at);
}

async function xpOf(person: Person) {
  const member = await memberOf(person);
  return t.run(async (ctx) => (await standingOf(ctx, member)).xp);
}

async function paidFor(person: Person, key: string) {
  const member = await memberOf(person);
  return t.run((ctx) => rewardOf(ctx, member, key));
}

async function questItemsOf(person: Person) {
  const { asSignedIn } = await aSignedInSession(t, { user: person.user, name: person.name });
  const album: AlbumRead | { kind: string } = await asSignedIn.query(api.website.album.getAlbum, {});
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  const { board } = album as AlbumAnswer;
  return (board?.items ?? []).map(({ reason }) => reason).filter((reason) => reason.kind === "quest");
}

async function memberOf(person: Person): Promise<MemberId> {
  const row = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("workspace", "T1").eq("user", person.user))
      .unique(),
  );
  return row!._id;
}
