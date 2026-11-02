import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../testing/fakePostHog";
import { FakeSlack } from "../../testing/fakeSlack";
import { post, react, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, section, text } from "../../testing/slackMessages";
import { aDeploymentForWorkspace, switchWebsite } from "../../testing/website";
import { internal } from "../_generated/api";
import type { MemberId } from "../workspace/directory";
import { nextQuestOf } from "./next";

const tuesday = new Date("2026-10-13T10:00:00Z");
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
const mondayPath = ["xp-levels", "album", "collection", "packs", "hidden-items", "onboarding", "hugs", "monday-quest"];
const twoQuests = [...mondayPath, "two-quests"];
const journey = (step: string) => ({ kind: "journey", step });
const weekly = (slot: number) => ({ kind: "weekly", week: "2026-10-12", slot });

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

describe("HH55: Quests answers one next quest, the hug quest while it is unfinished, else the kudos quest, else nothing", { timeout: 60_000 }, () => {
  test("a newcomer's next quest is the hug ladder's next step, from before their first hug to its last step", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await thanks(bob, alice);
    expect(await nextOf(bob), "before any hug").toEqual({ side: "hug", quest: journey("hugs-3") });

    for (let hug = 1; hug <= 3; hug += 1) await hugs(bob, alice);
    expect(await nextOf(bob), "after 3 hugs").toEqual({ side: "hug", quest: journey("hugs-5") });

    for (let hug = 4; hug <= 5; hug += 1) await hugs(bob, alice);
    expect(await nextOf(bob), "after 5 hugs").toEqual({ side: "hug", quest: journey("hugs-10") });
  });

  test("once the ladder is finished and no hug quest is drawn yet, the next quest is the kudos side's: the next onboarding quest", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await thanks(bob, alice);
    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);

    expect(await nextOf(bob)).toEqual({ side: "kudos", quest: journey("someone-new") });
  });

  test("the week's drawn hug quest is next while it is unfinished, then the week's kudos quest, then nothing", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);
    await sweep();
    expect(await nextOf(bob), "both sides drawn").toEqual({ side: "hug", quest: weekly(3) });

    await doesEveryHugQuest(bob);
    expect(await nextOf(bob), "the hug quest finished").toEqual({ side: "kudos", quest: weekly(4) });

    await doesEveryKudosQuest(bob);
    expect(await nextOf(bob), "both finished").toBeNull();
  });

  test("a member off the Monday path has no next quest", async () => {
    await switchWebsite(t, postHog, true, "xp-levels", "two-quests");
    await thanks(bob, alice);

    expect(await nextOf(bob)).toBeNull();
  });

  test("HH57: with two-quests off, the next quest is the next onboarding quest as before, and nothing once onboarding is finished", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await thanks(bob, alice);
    for (let hug = 1; hug <= 3; hug += 1) await hugs(bob, alice);
    expect(await nextOf(bob), "hugs climb no ladder").toEqual({ side: "kudos", quest: journey("someone-new") });

    vi.setSystemTime(Date.now() + dayMs);
    await thanks(bob, carol);
    expect(await nextOf(bob), "onboarding finished").toBeNull();
  });
});

async function nextOf(person: Person) {
  const member = await memberOf(person);
  return t.run((ctx) => nextQuestOf(ctx, member, Date.now()));
}

async function finishKudosOnboarding(person: Person) {
  await thanks(person, alice);
  await thanks(person, carol);
  vi.setSystemTime(Date.now() + dayMs);
  await thanks(person, alice);
}

// Every kudos quest of the pool finishes from these: three people never thanked, in one kudos on one day, then one more the next day.
async function doesEveryKudosQuest(person: Person) {
  await thanks(person, dave, erin, frank);
  vi.setSystemTime(Date.now() + dayMs);
  await thanks(person, gina);
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
  await post(t, [section(text("thanks "), ...recipients.flatMap(({ user }) => [mention(user), text(" ")]), emoji("taco"))], { user: giver.user, ts: tsOf(Date.now()) });
  await settle(t);
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

async function memberOf(person: Person): Promise<MemberId> {
  const row = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("workspace", "T1").eq("user", person.user))
      .unique(),
  );
  return row!._id;
}
