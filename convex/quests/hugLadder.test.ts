import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../testing/fakePostHog";
import { FakeSlack } from "../../testing/fakeSlack";
import { deliverAgain, post, react, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, section, text } from "../../testing/slackMessages";
import { aDeploymentForWorkspace, aSignedInSession, switchWebsite } from "../../testing/website";
import { api, internal } from "../_generated/api";
import { standingOf } from "../progression/progression";
import type { AlbumAnswer, AlbumRead } from "../website/album";
import type { MemberId } from "../workspace/directory";
import { hugLadderReward, hugLadderSteps } from "./hugLadder";
import { weeklyQuestsOf } from "./weekly";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist" };
const todaysFlags = ["xp-levels", "album", "collection", "packs", "hidden-items", "onboarding", "hugs"];
const mondayPath = [...todaysFlags, "monday-quest"];
const twoQuests = [...mondayPath, "two-quests"];

type Person = { user: string; name: string };

let postHog: FakePostHog;
let t: Backend;
let messages = 0;

beforeEach(async () => {
  vi.useFakeTimers({ now: tuesday });
  aDeploymentForWorkspace();
  postHog = new FakePostHog();
  const slack = new FakeSlack();
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

describe("HH46: the hug ladder counts the hugs a member gives from its first week under two-quests", { timeout: 60_000 }, () => {
  test("the 3rd, 5th and 10th hug finish Give 3 hugs, Give 5 hugs and Give 10 hugs, each paying 20 XP and an unidentified Hoggie once", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);

    const finishedAfter: string[][] = [];
    for (let hug = 1; hug <= 10; hug += 1) {
      await hugs(bob, alice);
      finishedAfter.push(await finishedLadderStepsOf(bob));
    }

    expect(finishedAfter[1], "after 2 hugs").toEqual([]);
    expect(finishedAfter[2], "after 3 hugs").toEqual(["hugs-3"]);
    expect(finishedAfter[3], "after 4 hugs").toEqual(["hugs-3"]);
    expect(finishedAfter[4], "after 5 hugs").toEqual(["hugs-3", "hugs-5"]);
    expect(finishedAfter[8], "after 9 hugs").toEqual(["hugs-3", "hugs-5"]);
    expect(finishedAfter[9], "after 10 hugs").toEqual(["hugs-3", "hugs-5", "hugs-10"]);
    expect(await questItemsOf(bob), "the quest hoggies on the board").toEqual([
      { kind: "quest", quest: { kind: "journey", step: "hugs-3" } },
      { kind: "quest", quest: { kind: "journey", step: "hugs-5" } },
      { kind: "quest", quest: { kind: "journey", step: "hugs-10" } },
    ]);
    expect(await xpOf(bob), "10 hugs at 1 XP and three ladder steps at 20 XP").toBe(10 + 3 * hugLadderReward.xp);
  });

  test("a hug quest pays 20 XP and a hoggie, as the numbers table says", () => {
    expect(hugLadderReward).toEqual({ xp: 20, coins: 0, item: null });
  });

  test("HH18: hugGiven delivered to Quests twice finishes nothing twice and pays once", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    for (let hug = 1; hug <= 3; hug += 1) await hugs(bob, alice);

    await deliverAgain(t, "quests/quests:followHugGiven");

    expect(await finishedLadderStepsOf(bob)).toEqual(["hugs-3"]);
    expect(await questItemsOf(bob), "the quest hoggies on the board").toHaveLength(1);
    expect(await xpOf(bob)).toBe(3 + hugLadderReward.xp);
  });

  test("hugs given before two-quests was on for the member count for nothing", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await thanks(bob, carol);
    for (let hug = 1; hug <= 4; hug += 1) await hugs(bob, alice);
    await switchWebsite(t, postHog, true, ...twoQuests);

    await hugs(bob, alice);
    await hugs(bob, alice);
    expect(await finishedLadderStepsOf(bob), "after 2 hugs under two-quests").toEqual([]);
    await hugs(bob, alice);

    expect(await finishedLadderStepsOf(bob), "after 3 hugs under two-quests").toEqual(["hugs-3"]);
  });

  test("a hug from before two-quests, delivered again once it is on, starts no ladder and finishes nothing", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await thanks(bob, carol);
    for (let hug = 1; hug <= 3; hug += 1) await hugs(bob, alice);
    await switchWebsite(t, postHog, true, ...twoQuests);

    await deliverAgain(t, "quests/quests:followHugGiven");
    expect(await finishedLadderStepsOf(bob), "after the old hugs came again").toEqual([]);
    await hugs(bob, alice);
    await hugs(bob, alice);
    expect(await finishedLadderStepsOf(bob), "after 2 new hugs").toEqual([]);
    await hugs(bob, alice);

    expect(await finishedLadderStepsOf(bob), "after 3 new hugs").toEqual(["hugs-3"]);
  });

  test("a hug Quests receives after a later hug started the ladder counts for nothing, so the ladder never reaches back before its start", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await thanks(bob, carol);
    const [giver, author] = [await memberOf(bob), await memberOf(carol)];
    const hugAt = (minutes: number) => ({ type: "hugGiven" as const, workspace: "T1", giver, author, message: { workspace: "T1", conversation: "C1", message: tsOf(Date.now() + minutes * minuteMs) }, onKudos: false, day: "2026-10-13", at: Date.now() + minutes * minuteMs });

    const [second, first, third, fourth] = [hugAt(2), hugAt(1), hugAt(3), hugAt(4)];
    for (const event of [second, first, third]) await t.mutation(internal.quests.quests.followHugGiven, { event });
    expect(await finishedLadderStepsOf(bob), "after the second, the first and the third hug").toEqual([]);
    await t.mutation(internal.quests.quests.followHugGiven, { event: fourth });
    await settle(t);

    expect(await finishedLadderStepsOf(bob), "after the fourth hug, the third since the start").toEqual(["hugs-3"]);
  });

  test("HH45: a hug under two-quests starts the member's quests, so a newcomer's first hug counts", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);

    for (let hug = 1; hug <= 3; hug += 1) await hugs(carol, alice);

    expect(await finishedLadderStepsOf(carol)).toEqual(["hugs-3"]);
  });

  test("HH57: with two-quests off, hugs finish no hug quest, as before", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);

    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);

    expect(await finishedLadderStepsOf(bob)).toEqual([]);
    expect(await questItemsOf(bob)).toEqual([]);
    expect(await xpOf(bob)).toBe(10);
  });

  test("the member's exposure to two-quests is recorded when a hug decides their ladder", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);

    await hugs(bob, alice);

    expect(postHog.events().filter(({ event, properties }) => event === "$feature_flag_called" && properties.$feature_flag === "two-quests"), "the exposure").toHaveLength(1);
  });
});

describe("HH45: under two-quests the three drawn quests give way", { timeout: 60_000 }, () => {
  test("a member who finished onboarding gets no three-quest draw while two-quests is on", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishOnboarding(bob);

    await sweep();

    expect(await weekOf(bob)).toBeNull();
  });

  test("a week drawn before two-quests turned on is neither shown nor counted once it is on", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await finishOnboarding(bob);
    await sweep();
    expect((await weekOf(bob))?.slots.length, "drawn before the flag").toBeGreaterThan(0);
    await switchWebsite(t, postHog, true, ...twoQuests);

    await thanks(bob, alice, carol);

    expect(await weekOf(bob), "this week's drawn quests").toBeNull();
    expect(await countedProgressOf(bob), "awards counted toward the old draw").toEqual(0);
  });

  test("with two-quests off, the same member's week is drawn the old way", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await finishOnboarding(bob);

    await sweep();

    expect((await weekOf(bob))?.slots.length, "drawn quests from the old pool").toBeGreaterThan(0);
  });
});

async function finishOnboarding(person: Person) {
  await thanks(person, alice);
  await thanks(person, carol);
  vi.setSystemTime(Date.now() + dayMs);
  await thanks(person, alice);
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

async function finishedLadderStepsOf(person: Person) {
  const member = await memberOf(person);
  const rows = await t.run((ctx) => ctx.db.query("questFinishes").withIndex("by_member_key", (q) => q.eq("member", member)).collect());
  const finished = new Set(rows.map(({ key }) => key.replace("journey:", "")));
  return hugLadderSteps.filter((step) => finished.has(step));
}

async function weekOf(person: Person) {
  const member = await memberOf(person);
  return t.run((ctx) => weeklyQuestsOf(ctx, member, Date.now()));
}

async function countedProgressOf(person: Person) {
  const member = await memberOf(person);
  return t.run(async (ctx) => (await ctx.db.query("questProgress").collect()).filter((row) => row.member === member).length);
}

async function xpOf(person: Person) {
  const member = await memberOf(person);
  return t.run(async (ctx) => (await standingOf(ctx, member)).xp);
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
