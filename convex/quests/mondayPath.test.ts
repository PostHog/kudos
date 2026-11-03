import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../testing/fakePostHog";
import { FakeSlack } from "../../testing/fakeSlack";
import { bookShippedBeforeAnyoneJoined, unlocksShippedBeforeAnyoneJoined } from "../../testing/flags";
import { signedRequest } from "../../testing/signedSlack";
import { deliverAgain, memberChanged, post, settle, settleInTimeOrder, testBackend, type Backend } from "../../testing/slackBackend";
import { publishedHomeBlocks } from "../../testing/slackInteractions";
import { appHomeOpened, emoji, mention, section, text } from "../../testing/slackMessages";
import { opens } from "../../testing/unlocks";
import { aDeploymentForWorkspace, aSignedInSession, switchWebsite } from "../../testing/website";
import { api, internal } from "../_generated/api";
import type { KudosGivenEvent, QuestFinishedEvent } from "../bus/events";
import { publish, subscribers } from "../bus/publish";
import { messageSettingsOf } from "../messageSettings/messageSettings";
import { standingOf } from "../progression/progression";
import type { AlbumAnswer, AlbumRead } from "../website/album";
import type { MemberId } from "../workspace/directory";
import { advanceOnboarding, nextOnboardingQuestOf } from "./onboarding";
import { questStartOf } from "./start";
import { weekStartOf } from "./week";
import { weeklyQuestsOf } from "./weekly";

vi.mock("../bus/publish", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bus/publish")>();
  return { ...actual, publish: vi.fn(actual.publish) };
});

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist" };
const dave = { user: "U_DAVE", name: "Dave Achterberg" };
const saysWhy = "thanks for untangling the flaky migration today";
const todaysFlags = ["xp-levels", "album", "collection", "packs", "hidden-items", "onboarding"];
const mondayPath = [...todaysFlags, "monday-quest"];
const drawnReward = { xp: 20, coins: 0, item: null };
const drawnPaid = { xp: 20, coins: 0 };
const firstThanksDone = "Quest done: Give a kudos to someone · +50 XP and an unidentified Hoggie for your collection";
const someoneNewDone = "Quest done: Thank someone new · +50 XP and an unidentified Hoggie for your collection";
const followKudosGiven = "quests/quests:followKudosGiven";

const deliverForReal = vi.mocked(publish).getMockImplementation()!;

type Person = { user: string; name: string };

let postHog: FakePostHog;
let slack: FakeSlack;
let t: Backend;
let messages = 0;

beforeEach(async () => {
  vi.useFakeTimers({ now: tuesday });
  vi.mocked(publish).mockClear();
  vi.mocked(publish).mockImplementation(deliverForReal);
  aDeploymentForWorkspace();
  postHog = new FakePostHog();
  slack = new FakeSlack();
  for (const person of [alice, bob, carol]) slack.withMember(person.user, { real_name: person.name });
  vi.stubGlobal("fetch", routedFetch(postHog, slack.fetch));
  t = testBackend();
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("MQ5 MQ7 MQ10 MQ12: a first kudos on the Monday path finishes the first onboarding quest", { timeout: 60_000 }, () => {
  test("the giver lands at 70 XP, 1 of 3 done, with the quest's Hoggie waiting and the reply's finish line", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);

    await thanks(alice, saysWhy, bob);

    expect(await xpOf(alice), "the giver's XP").toBe(70);
    expect(await nextQuestOf(alice), "the next onboarding quest").toBe("someone-new");
    expect(await questItemsOf(alice), "the quest items on the board").toEqual([{ kind: "quest", quest: { kind: "journey", step: "first-thanks" } }]);
    expect(replyTo(alice), "the after-kudos reply").toContain(firstThanksDone);
    expect(finishDmsTo(alice), "a finish DM").toEqual([]);
  });

  test("HH24: the finish is written to Quests' own finish record, under the member and the reward key", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);

    const ts = await thanks(alice, saysWhy, bob);

    expect(await finishesOf(alice)).toEqual([{ key: "journey:first-thanks", xp: 50, catalogueVersion: "monday-1", at: Number(ts.split(".")[0]) * 1000, cause: { workspace: "T1", conversation: "C1", message: ts } }]);
  });

  test.each([
    ["Quests before Progression", [followKudosGiven, "progression/progression:recordEffects"]],
    ["Progression before Quests", ["progression/progression:recordEffects", followKudosGiven]],
  ])("with %s, the giver still lands at 70 XP", async (_, order) => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    const held = holdingKudosGiven();

    await thanks(alice, saysWhy, bob);
    await deliverInOrder(held[0]!, order);

    expect(await xpOf(alice), "the giver's XP").toBe(70);
    expect(await questItemsOf(alice), "the quest items on the board").toHaveLength(1);
  });

  test("a replayed finish pays the quest once", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    const held = holdingKudosGiven();

    await thanks(alice, saysWhy, bob);
    for (let delivery = 0; delivery < 3; delivery += 1) await deliverInOrder(held[0]!, ["progression/progression:recordEffects", followKudosGiven]);

    expect(await xpOf(alice), "the giver's XP").toBe(70);
    expect(await finishesOf(alice), "the finish records").toHaveLength(1);
    expect(await questItemsOf(alice), "the quest items on the board").toHaveLength(1);
  });

  test("MQ43: with monday-quest off, a first kudos is as before: 20 XP, no quest, no finish line", async () => {
    await switchWebsite(t, postHog, true, ...todaysFlags);

    await thanks(alice, saysWhy, bob);

    expect(await xpOf(alice), "the giver's XP").toBe(20);
    expect(await questItemsOf(alice), "the quest items on the board").toEqual([]);
    expect(replyTo(alice).join("\n"), "the after-kudos reply").not.toContain("Quest done");
  });
});

describe("HH24: Quests publishes its finish and pays nothing; its followers pay from questFinished", { timeout: 60_000 }, () => {
  test("the finish publishes its reward key, reward, catalogue version and cause, names the quest in the reply, and is paid once its facts are delivered", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    const held = holdingQuestFinished();

    const ts = await thanks(alice, saysWhy, bob);

    expect(held.map(({ rewardKey, reward, catalogueVersion, cause }) => ({ rewardKey, reward, catalogueVersion, cause })), "the finish facts").toEqual([
      { rewardKey: "journey:first-thanks", reward: { xp: 50, coins: 0 }, catalogueVersion: "monday-1", cause: { workspace: "T1", conversation: "C1", message: ts } },
    ]);
    expect(replyTo(alice), "the after-kudos reply").toContain(firstThanksDone);
    expect(await xpOf(alice), "the giver's XP before the facts are delivered").toBe(20);
    expect(await questItemsOf(alice), "the quest items before the facts are delivered").toEqual([]);

    for (let delivery = 0; delivery < 2; delivery += 1) await deliverNow(held[0]!);

    expect(await xpOf(alice), "the giver's XP").toBe(70);
    expect(await questItemsOf(alice), "the quest items on the board").toEqual([{ kind: "quest", quest: { kind: "journey", step: "first-thanks" } }]);
  });

  test("with Quests, then Progression, then the finish's followers, the giver still lands at 70 XP", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    const given = holdingKudosGiven();
    await thanks(alice, saysWhy, bob);
    const finished = holdingQuestFinished();

    await runSubscribersInOrder(given[0]!, [followKudosGiven, "progression/progression:recordEffects"]);
    for (const fact of finished) await deliverNow(fact);

    expect(await xpOf(alice), "the giver's XP").toBe(70);
  });

  test("Quests' finish record, not the reward record, answers whether an onboarding quest is finished", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await thanks(alice, saysWhy, bob);

    await withoutRows("rewardRecords", alice, "journey:first-thanks");
    expect(await nextQuestOf(alice), "without the reward record").toBe("someone-new");

    await withoutRows("questFinishes", alice, "journey:first-thanks");
    expect(await nextQuestOf(alice), "without the finish record").toBe("first-thanks");
  });

  test("Quests' finish record answers whether a drawn quest is finished", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await finishOnboarding();
    await thanks(alice, saysWhy, bob);
    const finished = (await weekOf(alice))!.slots.filter(({ finishedAt }) => finishedAt !== null);

    for (const { slot } of finished) await withoutRows("rewardRecords", alice, `weekly:${(await weekOf(alice))!.week}:${slot}`);

    expect((await weekOf(alice))!.slots.filter(({ finishedAt }) => finishedAt !== null), "the finished slots without their reward records").toEqual(finished);
  });
});

describe("MQ3 MQ5 MQ6: the three onboarding quests are active at once", { timeout: 60_000 }, () => {
  test("the first kudos to someone new finishes only the first quest, and a later one to someone new finishes the second", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);

    await thanks(alice, saysWhy, bob);
    await thanks(alice, "thanks", carol);

    expect(await nextQuestOf(alice), "the next onboarding quest").toBe("two-days");
    expect(replyTo(alice), "the second kudos' reply").toContain(someoneNewDone);
    expect(await questItemsOf(alice), "the quest items on the board").toHaveLength(2);
  });

  test("MQ46: kudos on 2 different days finish the third quest, whatever they say and whatever order the steps come in", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await memberChanged(t, "team_join", { id: carol.user, profile: { real_name: carol.name } });

    await thanks(alice, "thanks", bob);
    vi.setSystemTime(Date.now() + 24 * 60 * minuteMs);
    await thanks(alice, "thanks", bob);

    expect(await nextQuestOf(alice), "the next onboarding quest").toBe("someone-new");
    expect(replyTo(alice), "the second day's reply").toContain("Quest done: Thank someone on two different days · +50 XP and an unidentified Hoggie for your collection");
  });

  test("MQ46: a first kudos that doesn't say why starts the quests and finishes the first, landing the giver at 70 XP", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);

    await thanks(alice, "thanks", bob);

    expect(await xpOf(alice), "the giver's XP").toBe(70);
    expect(await nextQuestOf(alice), "the next onboarding quest").toBe("someone-new");
    expect(replyTo(alice), "the plain kudos' reply").toContain(firstThanksDone);
  });
});

describe("MQ5: the onboarding quests count each kudos as of when it was given, whatever order the subscribers run in", { timeout: 60_000 }, () => {
  test.each([
    ["the earlier first", [0, 1]],
    ["the later first", [1, 0]],
  ])("MQ47: two kudos to someone new, each in its own message, pay first-thanks for the earlier and someone-new for the later, delivered %s", async (_, order) => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    const held = holdingKudosGiven();

    const earlier = await thanks(alice, "thanks", bob);
    const later = await thanks(alice, "thanks", carol);
    for (const index of order) await deliverInOrder(held[index]!, []);

    expect(await causesOf(alice, "journey:first-thanks"), "the kudos first-thanks is paid for").toEqual([earlier]);
    expect(await causesOf(alice, "journey:someone-new"), "the kudos someone-new is paid for").toEqual([later]);
  });

  test.each([
    ["the earlier first", [0, 1]],
    ["the later first", [1, 0]],
  ])("MQ47: a kudos to someone thanked before the start and a later one to someone new finish both quests, delivered %s", async (_, order) => {
    await switchWebsite(t, postHog, true, ...todaysFlags);
    await joins(dave);
    await thanks(alice, "thanks", bob);
    await switchWebsite(t, postHog, true, ...mondayPath);
    await sweepForANewWeek();
    const held = holdingKudosGiven();

    const repeat = await thanks(alice, "thanks", bob);
    const someoneNew = await thanks(alice, "thanks", carol);
    for (const index of order) await deliverInOrder(held[index]!, []);

    expect(await causesOf(alice, "journey:first-thanks"), "the kudos first-thanks is paid for").toEqual([repeat]);
    expect(await causesOf(alice, "journey:someone-new"), "the kudos someone-new is paid for").toEqual([someoneNew]);
  });

  test.each([
    ["Quests marked handled", false],
    ["Quests handled before it marked what it handled", true],
  ])("MQ47: a kudos %s, from before any kudos counted, leaves first-thanks to the next kudos, which says so in its reply", async (_, unmarked) => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    await switchWebsite(t, postHog, true, ...todaysFlags);
    await thanks(alice, "thanks", bob);
    if (unmarked) await forgetWhatQuestsHandled();
    vi.setSystemTime(Date.now() + 30 * minuteMs);
    await switchWebsite(t, postHog, true, ...mondayPath);

    const next = await thanks(alice, "thanks", bob);

    expect(await causesOf(alice, "journey:first-thanks"), "the kudos first-thanks is paid for").toEqual([next]);
    expect(replyTo(alice), "the next kudos' reply").toContain(firstThanksDone);
  });

  test("MQ47: a kudos Slack sends late, older than one Quests handled long ago, still takes first-thanks when delivered after a later kudos to someone new", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    vi.setSystemTime(Date.now() + 2 * minuteMs);
    const sentLate = tsOf(Date.now());
    await switchWebsite(t, postHog, true, ...todaysFlags);
    await thanks(alice, "thanks", bob);
    vi.setSystemTime(Date.now() + 30 * minuteMs);
    await switchWebsite(t, postHog, true, ...mondayPath);
    const held = holdingKudosGiven();

    await thanksPostedAt(sentLate, alice, "thanks", bob);
    const someoneNew = await thanks(alice, "thanks", carol);
    await deliverInOrder(held[1]!, []);
    await deliverInOrder(held[0]!, []);

    expect(await causesOf(alice, "journey:first-thanks"), "the kudos first-thanks is paid for").toEqual([sentLate]);
    expect(await causesOf(alice, "journey:someone-new"), "the kudos someone-new is paid for").toEqual([someoneNew]);
  });

  test("MQ47: delivered later first, each kudos counts as done only the quest its own kudos finished", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    const held = holdingKudosGiven();
    await thanks(alice, "thanks", bob);
    await thanks(alice, "thanks", carol);

    expect(await onboardingDoneBy(held[1]!), "the quests the later kudos finished").toEqual(["someone-new"]);
    expect(await onboardingDoneBy(held[0]!), "the quests the earlier kudos finished").toEqual(["first-thanks"]);
  });

  test("MQ47: a kudos to someone new that Slack sends before an earlier one finishes first-thanks, and the earlier one finishes someone-new", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    vi.setSystemTime(Date.now() + 2 * minuteMs);
    const earlier = tsOf(Date.now() - minuteMs);

    const sentFirst = await thanksPostedAt(tsOf(Date.now()), alice, "thanks", bob);
    await thanksPostedAt(earlier, alice, "thanks", carol);

    expect(await causesOf(alice, "journey:first-thanks"), "the kudos first-thanks is paid for").toEqual([sentFirst]);
    expect(await causesOf(alice, "journey:someone-new"), "the kudos someone-new is paid for").toEqual([earlier]);
  });

  test("kudos on 2 different days finish two-days, even when Slack sends the later day's first", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    vi.setSystemTime(Date.now() + 2 * minuteMs);
    const dayOne = tsOf(Date.now());
    vi.setSystemTime(Date.now() + dayMs);

    const dayTwoAt = Date.now();
    await thanksPostedAt(tsOf(dayTwoAt), alice, "thanks", bob);
    await thanksPostedAt(dayOne, alice, "thanks", bob);

    expect(await causesOf(alice, "journey:two-days"), "the kudos two-days is paid for").toEqual([dayOne]);
    expect(await finishTimesOf(alice, "journey:two-days"), "when two-days finished: on the second day").toEqual([dayTwoAt]);
    expect(replyTo(alice), "the reply still to be sent").toContain("Quest done: Thank someone on two different days · +50 XP and an unidentified Hoggie for your collection");
  });

  test("a kudos counts toward two-days only with the kudos given up to it, even when a later day's is already in", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await memberChanged(t, "team_join", { id: carol.user, profile: { real_name: carol.name } });
    const held = holdingKudosGiven();

    await thanks(alice, "thanks", bob);
    vi.setSystemTime(Date.now() + dayMs);
    await thanks(alice, "thanks", bob);
    await deliverInOrder(held[0]!, []);

    expect(await nextQuestOf(alice), "the next onboarding quest after the first day's kudos").toBe("someone-new");
    expect(await questItemsOf(alice), "the quest items after the first day's kudos").toHaveLength(1);

    await deliverInOrder(held[1]!, []);
    expect(await questItemsOf(alice), "the quest items after the second day's kudos").toHaveLength(2);
  });
});

describe("MQ5: someone-new is judged across a leave and a rejoin as on the unlock path", { timeout: 60_000 }, () => {
  test("someone-new finishes when the last member the giver hadn't thanked leaves, without a reply", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await joins(carol);
    await thanks(alice, saysWhy, bob);

    const leftAt = await leaves(carol);

    expect(await someoneNewRecordsOf(alice), "the someone-new rewards").toEqual([{ xp: 50, at: leftAt }]);
    expect(await questItemsOf(alice), "the quest items on the board").toHaveLength(2);
    expect(finishDmsTo(alice), "a finish DM").toEqual([]);
  });

  test("a member who left, and comes back after the last member they hadn't thanked left too, finishes someone-new on their return", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await joins(carol);
    await thanks(alice, saysWhy, bob);
    await leaves(alice);
    await leaves(carol);
    expect(await someoneNewRecordsOf(alice), "the someone-new rewards while away").toEqual([]);

    const backAt = await rejoins(alice);

    expect(await someoneNewRecordsOf(alice), "the someone-new rewards").toEqual([{ xp: 50, at: backAt }]);
  });

  test("a leave delivered twice pays someone-new once", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await joins(carol);
    await thanks(alice, saysWhy, bob);
    const left = { type: "memberLeft", workspace: "T1", member: await memberOf(carol), at: await leaves(carol) } as const;

    for (const delivery of [1, 2]) await t.mutation(internal.quests.journey.recheckSomeoneNew, { event: left });
    await settle(t);

    expect(await someoneNewRecordsOf(alice), "the someone-new rewards").toHaveLength(1);
    expect(await questItemsOf(alice), "the quest items on the board").toHaveLength(2);
  });

  test("a leave that comes in before the kudos that finishes first-thanks is counted still finishes someone-new", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    await joins(carol);
    const held = holdingKudosGiven();
    await thanks(alice, saysWhy, bob);

    const leftAt = await leaves(carol);
    await deliverInOrder(held[0]!, []);

    expect(await someoneNewRecordsOf(alice), "the someone-new rewards").toEqual([{ xp: 50, at: leftAt }]);
    expect(await nextQuestOf(alice), "the next onboarding quest").toBe("two-days");
  });

  test("a teammate thanked before who left and rejoined is no one new", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await joins(carol);
    await thanks(alice, saysWhy, bob);
    await leaves(bob);
    await rejoins(bob);

    await thanks(alice, "thanks", bob);

    expect(await nextQuestOf(alice), "the next onboarding quest").toBe("someone-new");
  });

  test("a giver who had thanked every teammate before the quests started finishes someone-new on the next kudos after first-thanks", async () => {
    await switchWebsite(t, postHog, true, ...todaysFlags);
    await thanks(alice, "thanks", bob, carol);
    await switchWebsite(t, postHog, true, ...mondayPath);
    await sweepForANewWeek();
    await thanks(alice, "thanks", bob);
    expect(await nextQuestOf(alice), "the next onboarding quest after first-thanks").toBe("someone-new");

    await thanks(alice, "thanks", bob);

    expect(await someoneNewRecordsOf(alice), "the someone-new rewards").toEqual([{ xp: 50, at: expect.any(Number) }]);
    expect(await nextQuestOf(alice), "the next onboarding quest").toBe("two-days");
  });

  test("a long history of kudos past the finish pays each onboarding quest once", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await finishOnboarding();

    for (let day = 0; day < 4; day += 1) {
      vi.setSystemTime(Date.now() + dayMs);
      await thanks(alice, saysWhy, bob, carol);
      await thanks(alice, "thanks", carol);
    }

    expect(await onboardingRecordsOf(alice), "the onboarding quests' rewards").toEqual(["journey:first-thanks", "journey:someone-new", "journey:two-days"]);
    expect(await nextQuestOf(alice), "the next onboarding quest").toBeNull();
  });

  test("before first-thanks is done, a leave finishes nothing, even for a giver who thanked everyone before the start", async () => {
    await switchWebsite(t, postHog, true, ...todaysFlags);
    await joins(carol);
    await thanks(alice, "thanks", bob);
    await switchWebsite(t, postHog, true, ...mondayPath);
    await sweepForANewWeek();

    await leaves(carol);

    expect(await someoneNewRecordsOf(alice), "the someone-new rewards").toEqual([]);
  });

  test("MQ43: with monday-quest turned off after the start, a leave finishes nothing", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await joins(carol);
    await thanks(alice, saysWhy, bob);
    await switchWebsite(t, postHog, true, ...todaysFlags);

    await leaves(carol);

    expect(await someoneNewRecordsOf(alice), "the someone-new rewards").toEqual([]);
  });
});

describe("MQ4: the quests message kind applies on the Monday path", { timeout: 60_000 }, () => {
  test.each([
    ["on", mondayPath, true],
    ["off", todaysFlags, false],
  ])("with monday-quest %s, the Quests and Journey setting applies only on the Monday path", async (_, flags, applies) => {
    await switchWebsite(t, postHog, true, ...flags);
    await thanks(alice, saysWhy, bob);

    const member = await memberOf(alice);
    const settings = await t.run((ctx) => messageSettingsOf(ctx, member));

    expect(settings.find(({ kind }) => kind === "quests")?.applies).toBe(applies);
  });
});

describe("MQ9: drawn quests come once the three onboarding quests are finished", { timeout: 60_000 }, () => {
  test("nothing is drawn before the third onboarding quest, nor by the kudos that finishes it; the next sweep draws three", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await aTeammateNotThankedYet(dave);
    await thanks(alice, saysWhy, bob);
    await thanks(alice, "thanks", carol);
    await sweepForANewWeek();
    expect(await weekOf(alice), "the draw with 2 of 3 onboarding quests done").toBeNull();

    vi.setSystemTime(Date.now() + dayMs);
    await thanks(alice, saysWhy, bob);
    expect(await weekOf(alice), "the draw after the kudos that finishes onboarding").toBeNull();
    await sweepForANewWeek();

    expect((await weekOf(alice))?.slots, "this week's drawn quests").toHaveLength(3);
  });

  test("a replay of the kudos that finished onboarding counts toward no drawn quest", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await thanks(alice, saysWhy, bob);
    await thanks(alice, "thanks", carol);
    vi.setSystemTime(Date.now() + dayMs);
    const held = holdingKudosGiven();
    await thanks(alice, saysWhy, bob);
    await deliverInOrder(held[0]!, []);

    await deliverInOrder(held[0]!, []);

    expect((await weekOf(alice))?.slots.map(({ progress }) => progress) ?? [], "each drawn quest's progress").not.toContain(1);
  });

  test("a replay of the later day's kudos that Slack sent first counts toward no drawn quest once the earlier day's finishes two-days", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    await finishedOnTheUnlockPath(alice, "first-thanks", "someone-new");
    vi.setSystemTime(Date.now() + 2 * minuteMs);
    const dayOne = tsOf(Date.now());
    vi.setSystemTime(Date.now() + dayMs);
    const dayTwo = holdingKudosGiven();
    await thanksPostedAt(tsOf(Date.now()), alice, saysWhy, bob);
    await deliverInOrder(dayTwo[0]!, []);
    await thanksPostedAt(dayOne, alice, saysWhy, bob);

    await deliverInOrder(dayTwo[0]!, []);

    expect(await causesOf(alice, "journey:two-days"), "the kudos two-days is paid for").toEqual([dayOne]);
    expect((await weekOf(alice))?.slots.map(({ progress }) => progress) ?? [], "each drawn quest's progress").not.toContain(1);
  });

  test("a replay of Sunday's kudos draws no week once it finishes two-days with Monday's, which Slack sent first", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await startedByTheSweep(alice);
    await finishedOnTheUnlockPath(alice, "first-thanks", "someone-new");
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const sunday = tsOf(Date.now());
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    await thanksPostedAt(tsOf(Date.now()), alice, saysWhy, bob);
    const sundays = holdingKudosGiven();
    await thanksPostedAt(sunday, alice, saysWhy, bob);
    await deliverInOrder(sundays[0]!, []);

    await deliverInOrder(sundays[0]!, []);

    expect(await causesOf(alice, "journey:two-days"), "the kudos two-days is paid for").toEqual([sunday]);
    expect(await drawnWeeksOf(alice), "the weeks drawn").toEqual([]);
  });

  test("the next kudos after onboarding draws this week's quests and counts toward them", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await aTeammateNotThankedYet(dave);
    await finishOnboarding();
    const onboarded = Date.now();

    await thanks(alice, saysWhy, dave);

    const week = await weekOf(alice);
    expect(week?.drawnAt, "when the quests were drawn").toBeGreaterThan(onboarded);
    expect(week?.slots.map(({ progress }) => progress), "each quest's progress").toEqual([1, 1, 1]);
  });

  test("the next week's quests are drawn at Monday 0:00 in the member's zone", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await finishOnboarding();
    await sweepForANewWeek();

    vi.setSystemTime(new Date("2026-10-19T09:00:00Z"));
    await sweepForANewWeek();

    const member = await memberOf(alice);
    const timeZone = await t.run(async (ctx) => (await ctx.db.get(member))?.timeZone);
    const week = await weekOf(alice);
    expect(week?.week, "the week drawn").toBe("2026-10-19");
    expect(week?.drawnAt, "when the week's quests were drawn").toBe(weekStartOf("2026-10-19", timeZone));
  });
});

describe("Quests handles a kudos delivered twice as once", { timeout: 60_000 }, () => {
  test.each([
    ["on the Monday path", mondayPath],
    ["with monday-quest off", todaysFlags],
  ])("%s, a second delivery keeps one judged marker per award and moves, pays and replies nothing more", async (_, flags) => {
    await switchWebsite(t, postHog, true, ...flags);
    await thanks(alice, saysWhy, bob, carol);
    const once = await questStateOf(alice);

    await deliverAgain(t, followKudosGiven);

    expect(await judgedMarkers(), "the judged markers of the kudos's awards").toEqual(once.judgedMarkers);
    expect(await questStateOf(alice), "the giver's quests, XP, items and replies").toEqual(once);
  });

  test("a kudos delivered again in a later week draws no quests, and the sweep still draws that week", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await aTeammateNotThankedYet(dave);
    await finishOnboarding();
    await thanks(alice, saysWhy, dave);
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    const drawnBefore = questsDrawnPublished();

    await deliverAgain(t, followKudosGiven);
    expect(await drawnWeeksOf(alice), "the weeks drawn after the late delivery").toEqual(["2026-10-12"]);
    expect(questsDrawnPublished(), "the questsDrawn facts published").toBe(drawnBefore);

    await sweepForANewWeek();
    expect(await drawnWeeksOf(alice), "the weeks drawn after the sweep").toEqual(["2026-10-12", "2026-10-19"]);
  });
});

describe("HH13: the Monday path draws its quests from the kudos pool", { timeout: 60_000 }, () => {
  const kudosPool = ["kudos-once", "kudos-two-days", "three-in-a-day", "someone-new", "two-new", "not-in-30-days"];

  test("every week's three quests come from the kudos pool, and a short kudos counts toward each", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await aTeammateNotThankedYet(dave);
    await finishOnboarding();
    const drawn = new Set<string>();
    for (let week = 0; week < 6; week += 1) {
      vi.setSystemTime(new Date(Date.parse("2026-10-19T09:00:00Z") + week * 7 * dayMs));
      await sweepForANewWeek();
      for (const { quest } of (await weekOf(alice))?.slots ?? []) drawn.add(quest);
    }

    await thanks(alice, "thanks", dave);

    expect([...drawn].filter((quest) => !kudosPool.includes(quest)), "the quests drawn from outside the kudos pool").toEqual([]);
    expect((await weekOf(alice))?.slots.map(({ progress }) => progress), "each quest's progress after a short kudos to someone new").toEqual([1, 1, 1]);
  });
});

describe("MQ8 MQ10 MQ12: a drawn quest on the Monday path pays 20 XP and a Hoggie, never coins, with no swap", { timeout: 60_000 }, () => {
  test("each drawn quest promises 20 XP and no coins", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await aTeammateNotThankedYet(dave);
    await finishOnboarding();
    await sweepForANewWeek();

    const week = (await weekOf(alice))!;

    expect(week.slots.map(({ reward }) => reward), "each drawn quest's reward").toEqual([drawnReward, drawnReward, drawnReward]);
  });

  test("finishing drawn quests records 20 XP and no coins each, lays a Hoggie each, and the reply says so with no finish DM", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await aTeammateNotThankedYet(dave);
    await finishOnboarding();

    await thanks(alice, "thanks", dave, bob, carol);
    vi.setSystemTime(Date.now() + dayMs);
    await thanks(alice, "thanks", dave, bob, carol);

    expect(await weeklyRewardsOf(alice), "the drawn quests' reward records").toEqual([drawnPaid, drawnPaid, drawnPaid]);
    expect((await questItemsOf(alice)).filter(({ quest }) => quest.kind === "weekly"), "the drawn quests' items").toHaveLength(3);
    expect(finishLinesTo(alice), "the replies' finish lines").toEqual([1, 2, 3].map(() => expect.stringMatching(/^Quest done: [^·]+ · \+20 XP and an unidentified Hoggie for your collection$/)));
    expect(finishDmsTo(alice), "a finish DM").toEqual([]);
  });
});

describe("MQ4 MQ10: with the unlock path on too, the Monday path's quests pay only the Monday way", { timeout: 60_000 }, () => {
  test("a Monday quest's reward waits as no pack in the collection and as no Journey Open on App Home", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath, "unlocks", "quests", "achievements");
    await unlocksShippedBeforeAnyoneJoined(t);
    await bookShippedBeforeAnyoneJoined(t);
    await thanks(alice, saysWhy, bob);
    await opens(t, await memberOf(alice), "book");

    await openHome(alice);

    expect.soft(await packsWaitingFor(alice), "the packs waiting in the collection").toEqual([]);
    expect(journeyOpensInHome(alice), "the Journey lines with an Open on App Home").toEqual([]);
  });

  test("a finished drawn quest waits as no pack in the collection and as no Open on App Home", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath, "unlocks", "quests", "achievements");
    await unlocksShippedBeforeAnyoneJoined(t);
    await bookShippedBeforeAnyoneJoined(t);
    await finishOnboarding();
    await opens(t, await memberOf(alice), "book");
    await opens(t, await memberOf(alice), "quests");
    vi.setSystemTime(Date.now() + dayMs);
    await thanks(alice, saysWhy, bob);

    await openHome(alice);

    expect(await weeklyRewardsOf(alice), "the drawn quests' reward records").toContainEqual(drawnPaid);
    expect(await packsWaitingFor(alice), "the packs waiting in the collection").not.toContainEqual(expect.stringMatching(/^weekly:/));
    const goals = (await weekOf(alice))!.slots.map(({ goal }) => goal.slice(0, -1));
    expect(opensInHome(alice).filter((line) => goals.some((goal) => line?.includes(goal))), "the drawn quests' lines with an Open on App Home").toEqual([]);
  });

  test("a week drawn on the unlock path is left as it is on the Monday path, paying no coins", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await memberChanged(t, "team_join", { id: alice.user, profile: { real_name: alice.name } });
    const member = await memberOf(alice);
    await t.run((ctx) => ctx.db.insert("questDraws", { member, week: "2026-10-12", drawnAt: Date.now(), slots: [{ slot: 0, quest: "say-why", reward: { xp: 20, coins: 10, item: null }, catalogueVersion: "2", feasibleBecause: { peopleLeft: 2, recognitionsLeft: 10 } }] }));

    await thanks(alice, saysWhy, bob);

    expect(await weeklyRewardsOf(alice), "the unlock path's week's reward records").toEqual([]);
    expect(await xpOf(alice), "the giver's XP").toBe(70);
  });
});

describe("MQ3: the weekly sweep starts quests for a member welcomed before the Monday path", { timeout: 60_000 }, () => {
  test.each([
    ["a welcome and monday-quest on", true, mondayPath, true],
    ["no welcome", false, mondayPath, false],
    ["a welcome and monday-quest off", true, todaysFlags, false],
  ])("with %s, the sweep starts the member's quests: %s", async (_, welcomed, flags, starts) => {
    await switchWebsite(t, postHog, true, ...flags);
    await memberChanged(t, "team_join", { id: alice.user, profile: { real_name: alice.name } });
    const member = await memberOf(alice);
    if (welcomed) await t.run((ctx) => ctx.db.insert("welcomes", { member }));

    await sweepForANewWeek();

    expect((await t.run((ctx) => questStartOf(ctx, member))) !== null, "the member's quests started").toBe(starts);
  });
});

describe("HH56: the kudos quest's Quest done line reaches the reply of the kudos whose delivery finished it", { timeout: 60_000 }, () => {
  test("kudos on 2 different days finish a drawn two-day kudos quest, and the reply still to be sent names it, even when Slack sends the later day's first", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath, "hugs", "two-quests");
    await finishOnboarding();
    const member = await memberOf(alice);
    vi.setSystemTime(Date.now() + minuteMs);
    await t.run((ctx) => ctx.db.insert("questSideDraws", { member, week: "2026-10-12", side: "kudos", quest: "kudos-two-days", reward: drawnReward, catalogueVersion: "monday-1", feasibleBecause: { hugsLeft: 10 }, drawnAt: Date.now() }));
    vi.setSystemTime(Date.now() + 2 * minuteMs);
    const dayOne = tsOf(Date.now());
    vi.setSystemTime(Date.now() + dayMs);

    await thanksPostedAt(tsOf(Date.now()), alice, "thanks", bob);
    expect(finishLinesTo(alice), "the later day's kudos alone is one day").toEqual([]);
    await thanksPostedAt(dayOne, alice, "thanks", carol);

    const done = "Quest done: Thank someone on two different days · +20 XP and an unidentified Hoggie for your collection";
    expect(finishLinesTo(alice), "one line, in one reply").toEqual([done]);
    expect(replyTo(alice), "the reply still to be sent").toContain(done);
    expect(await causesOf(alice, "weekly:2026-10-12:4"), "the kudos the quest is paid for").toEqual([dayOne]);
  });
});

async function finishOnboarding() {
  await thanks(alice, saysWhy, bob);
  await thanks(alice, "thanks", carol);
  vi.setSystemTime(Date.now() + dayMs);
  await thanks(alice, saysWhy, bob);
}

async function aTeammateNotThankedYet(person: Person) {
  slack.withMember(person.user, { real_name: person.name });
  await joins(person);
}

async function finishedOnTheUnlockPath(person: Person, ...steps: string[]) {
  const member = await memberOf(person);
  for (const step of steps) await t.run((ctx) => ctx.db.insert("rewardRecords", { member, key: `journey:${step}`, xp: 20, coins: 10, item: null, catalogueVersion: "1", at: Date.now() }));
}

async function startedByTheSweep(person: Person) {
  await memberChanged(t, "team_join", { id: person.user, profile: { real_name: person.name } });
  const member = await memberOf(person);
  await t.run((ctx) => ctx.db.insert("welcomes", { member }));
  await sweepForANewWeek();
}

async function sweepForANewWeek() {
  await t.mutation(internal.quests.newWeek.sweep, {});
  await settle(t);
}

async function weekOf(person: Person) {
  const member = await memberOf(person);
  return t.run((ctx) => weeklyQuestsOf(ctx, member, Date.now()));
}

async function drawnWeeksOf(person: Person) {
  const member = await memberOf(person);
  const draws = await t.run((ctx) => ctx.db.query("questDraws").collect());
  return draws.filter((draw) => draw.member === member).map(({ week }) => week);
}

async function weeklyRewardsOf(person: Person) {
  const member = await memberOf(person);
  const records = await t.run((ctx) => ctx.db.query("rewardRecords").collect());
  return records.filter((record) => record.member === member && record.key.startsWith("weekly:")).map(({ xp, coins }) => ({ xp, coins }));
}

async function thanks(giver: Person, words: string, ...recipients: Person[]) {
  vi.setSystemTime(Date.now() + minuteMs);
  return thanksPostedAt(tsOf(Date.now()), giver, words, ...recipients);
}

async function thanksPostedAt(ts: string, giver: Person, words: string, ...recipients: Person[]) {
  await post(t, [section(text(`${words} `), ...recipients.flatMap(({ user }) => [mention(user), text(" ")]), emoji("taco"))], { user: giver.user, ts });
  await settleInTimeOrder(t);
  return ts;
}

function tsOf(at: number) {
  messages += 1;
  return `${at / 1000}.${String(messages).padStart(6, "0")}`;
}

async function joins(person: Person) {
  await memberChanged(t, "team_join", { id: person.user, profile: { real_name: person.name } });
  await settle(t);
}

async function leaves(person: Person) {
  return membershipChanged({ id: person.user, deleted: true });
}

async function rejoins(person: Person) {
  return membershipChanged({ id: person.user });
}

async function membershipChanged(user: { id: string; deleted?: boolean }) {
  vi.setSystemTime(Date.now() + minuteMs);
  const at = Date.now();
  await memberChanged(t, "user_change", user);
  await settle(t);
  return at;
}

async function causesOf(person: Person, key: string) {
  const member = await memberOf(person);
  const records = await t.run((ctx) => ctx.db.query("rewardRecords").collect());
  return records.filter((record) => record.member === member && record.key === key).map(({ cause }) => cause?.message);
}

async function finishTimesOf(person: Person, key: string) {
  const member = await memberOf(person);
  const records = await t.run((ctx) => ctx.db.query("rewardRecords").collect());
  return records.filter((record) => record.member === member && record.key === key).map(({ at }) => at);
}

async function someoneNewRecordsOf(person: Person) {
  const member = await memberOf(person);
  const records = await t.run((ctx) => ctx.db.query("rewardRecords").collect());
  return records.filter((record) => record.member === member && record.key === "journey:someone-new").map(({ xp, at }) => ({ xp, at }));
}

async function onboardingRecordsOf(person: Person) {
  const member = await memberOf(person);
  const records = await t.run((ctx) => ctx.db.query("rewardRecords").collect());
  return records
    .filter((record) => record.member === member && record.key.startsWith("journey:"))
    .map(({ key }) => key)
    .toSorted();
}

async function questStateOf(person: Person) {
  return { judgedMarkers: await judgedMarkers(), xp: await xpOf(person), finishes: await finishesOf(person), questItems: await questItemsOf(person), replies: slack.ephemeralsTo(person.user).length };
}

async function judgedMarkers() {
  const markers = await t.run((ctx) => ctx.db.query("questsJudged").collect());
  return markers.map(({ award }) => award).toSorted();
}

function questsDrawnPublished() {
  return vi.mocked(publish).mock.calls.filter(([, event]) => event.type === "questsDrawn").length;
}

async function forgetWhatQuestsHandled() {
  await t.run(async (ctx) => {
    for (const { _id } of await ctx.db.query("questsJudged").collect()) await ctx.db.delete(_id);
  });
}

async function onboardingDoneBy(event: KudosGivenEvent) {
  return t.run(async (ctx) => (await advanceOnboarding(ctx, event)).map(({ step }) => step));
}

function holdingKudosGiven() {
  const held: KudosGivenEvent[] = [];
  vi.mocked(publish).mockImplementation(async (ctx, event) => {
    if (event.type === "kudosGiven") held.push(event);
    else await deliverForReal(ctx, event);
  });
  return held;
}

function holdingQuestFinished() {
  const held: QuestFinishedEvent[] = [];
  vi.mocked(publish).mockImplementation(async (ctx, event) => {
    if (event.type === "questFinished") held.push(event);
    else await deliverForReal(ctx, event);
  });
  return held;
}

async function deliverNow(event: QuestFinishedEvent) {
  vi.mocked(publish).mockImplementation(deliverForReal);
  await t.run((ctx) => deliverForReal(ctx, event));
  await settle(t);
}

async function withoutRows(table: "rewardRecords" | "questFinishes", person: Person, key: string) {
  const member = await memberOf(person);
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query(table).withIndex("by_member_key", (q) => q.eq("member", member).eq("key", key)).collect()) await ctx.db.delete(row._id);
  });
}

async function deliverInOrder(event: KudosGivenEvent, first: string[]) {
  vi.mocked(publish).mockImplementation(deliverForReal);
  await runSubscribersInOrder(event, first);
}

async function runSubscribersInOrder(event: KudosGivenEvent, first: string[]) {
  const named = new Map(subscribers.kudosGiven.map((subscription) => ("subscriber" in subscription ? subscription.subscriber : subscription)).map((subscriber) => [getFunctionName(subscriber), subscriber] as const));
  for (const name of [...first, ...[...named.keys()].filter((name) => !first.includes(name))]) {
    await t.mutation(named.get(name)! as FunctionReference<"mutation", "internal", { event: KudosGivenEvent }>, { event });
    await settle(t);
  }
}

function replyTo(person: Person): string[] {
  return String(slack.ephemeralsTo(person.user).findLast(({ text }) => String(text).includes("kudos from you"))?.text ?? "").split("\n");
}

function finishLinesTo(person: Person): string[] {
  return slack
    .ephemeralsTo(person.user)
    .flatMap(({ text }) => String(text).split("\n"))
    .filter((line) => line.startsWith("Quest done:") && !line.includes("+50 XP"));
}

function finishDmsTo(person: Person) {
  return slack
    .callsTo("chat.postMessage")
    .filter(({ channel, text }) => channel === person.user && String(text).startsWith("✅ You finished"))
    .map(({ text }) => String(text));
}

async function xpOf(person: Person) {
  const member = await memberOf(person);
  return t.run(async (ctx) => (await standingOf(ctx, member)).xp);
}

async function finishesOf(person: Person) {
  const member = await memberOf(person);
  const rows = await t.run((ctx) => ctx.db.query("questFinishes").withIndex("by_member_key", (q) => q.eq("member", member)).collect());
  return rows.map(({ key, xp, catalogueVersion, at, cause }) => ({ key, xp, catalogueVersion, at, cause }));
}

async function nextQuestOf(person: Person) {
  const member = await memberOf(person);
  return t.run((ctx) => nextOnboardingQuestOf(ctx, member));
}

async function questItemsOf(person: Person) {
  const { asSignedIn } = await aSignedInSession(t, { user: person.user, name: person.name });
  const album: AlbumRead | { kind: string } = await asSignedIn.query(api.website.album.getAlbum, {});
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  const { board } = album as AlbumAnswer;
  return (board?.items ?? []).map(({ reason }) => reason).filter((reason) => reason.kind === "quest");
}

async function openHome(person: Person) {
  await t.fetch("/slack/events", await signedRequest(appHomeOpened(person.user)));
  await settle(t);
}

function journeyOpensInHome(person: Person) {
  return opensInHome(person).filter((line) => line?.startsWith("*Journey:*"));
}

function opensInHome(person: Person) {
  return publishedHomeBlocks(slack, person.user)
    .filter((block) => block.accessory?.text?.text === "Open")
    .map((block) => block.text?.text);
}

async function packsWaitingFor(person: Person) {
  const { asSignedIn } = await aSignedInSession(t, { user: person.user, name: person.name });
  const collection = await asSignedIn.query(api.website.collection.getCollection, {});
  if (collection.kind !== "collection") throw new Error(`expected a collection, got ${JSON.stringify(collection)}`);
  return collection.packs?.map(({ crate }) => crate) ?? [];
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
