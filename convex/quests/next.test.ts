import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../testing/fakePostHog";
import { FakeSlack } from "../../testing/fakeSlack";
import { post, react, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, section, text } from "../../testing/slackMessages";
import { aDeploymentForWorkspace, aSignedInSession, switchWebsite } from "../../testing/website";
import { api, internal } from "../_generated/api";
import type { MemberId } from "../workspace/directory";
import { nextQuestOf } from "./next";
import { hugQuestPool, mondayQuestPool } from "./pool";

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

describe("HH54 HH55: the website's quests read answers the week's two quests, the hug quest first, the next one marked", { timeout: 60_000 }, () => {
  const hugHint = "React with your kudos emoji on any message in Slack.";

  test("a newcomer one hug up the ladder reads the ladder's next step, marked next, then the next onboarding quest with its own hint and 50 XP", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await thanks(bob, alice);
    await hugs(bob, alice);

    expect((await questsReadOf(bob)).quests).toEqual({
      kind: "two-quests",
      quests: [
        { side: "hug", goal: "Give 3 hugs", hint: hugHint, progress: { done: 1, target: 3 }, done: false, reward: { xp: 20 }, item: null, next: true, drawn: false },
        { side: "kudos", goal: "Thank someone new", hint: "Someone from another team counts, and so does a new joiner.", progress: { done: 0, target: 1 }, done: false, reward: { xp: 50 }, item: null, next: false, drawn: false },
      ],
      steps: expect.any(Array),
    });
  });

  test("a tab still running a website built before the two quests, which reads any list but a drawn one as a journey's steps, reads the same rows", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await thanks(bob, alice);
    await hugs(bob, alice);

    type JourneyStep = { goal: string; hint: string | null; done: boolean; reward: { xp: number } | null };
    const list: { kind: string; quests?: unknown[]; steps?: JourneyStep[] } = (await questsReadOf(bob)).quests;
    const steps = (list.kind === "drawn" ? list.quests : list.steps) as JourneyStep[] | undefined;

    expect(steps).toEqual(list.quests);
    expect(steps!.map(({ goal, hint, done, reward }) => ({ goal, hint, done, reward }))).toEqual([
      { goal: "Give 3 hugs", hint: hugHint, done: false, reward: { xp: 20 } },
      { goal: "Thank someone new", hint: "Someone from another team counts, and so does a new joiner.", done: false, reward: { xp: 50 } },
    ]);
  });

  test("past both onboardings it reads the week's drawn quests; a finished hug quest is done with its hoggie waiting, and the kudos quest is next", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);
    await sweep();
    await doesEveryHugQuest(bob);

    const { quests } = await questsReadOf(bob);
    if (quests.kind !== "two-quests") throw new Error(`expected the two quests, got ${quests.kind}`);
    const [hugQuest, kudosQuest] = quests.quests;
    expect(hugQuestPool.quests.map(({ goal }) => goal.replace(/\.$/, ""))).toContain(hugQuest!.goal);
    expect(hugQuest).toMatchObject({ side: "hug", hint: hugHint, done: true, reward: { xp: 20 }, item: "waiting", next: false, drawn: true });
    expect(hugQuest!.progress.done).toBe(hugQuest!.progress.target);
    expect(mondayQuestPool.quests.map(({ goal }) => goal.replace(/\.$/, ""))).toContain(kudosQuest!.goal);
    expect(kudosQuest).toMatchObject({ side: "kudos", hint: null, done: false, reward: { xp: 20 }, item: null, next: true });
  });

  test("a side with no quest this week, its onboarding just finished and nothing drawn yet, reads no row", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);

    const { quests } = await questsReadOf(bob);
    expect(quests.kind === "two-quests" ? quests.quests.map(({ side, goal }) => `${side}: ${goal}`) : quests.kind).toEqual(["hug: Give 3 hugs"]);
  });

  test("a week with no row, a new week past both onboardings before anything draws it, answers not-found, which every website already hides", async () => {
    await switchWebsite(t, postHog, true, ...twoQuests);
    await finishKudosOnboarding(bob);
    for (let hug = 1; hug <= 10; hug += 1) await hugs(bob, alice);
    await sweep();
    expect((await questsReadOf(bob)).quests.kind, "this week's two quests").toBe("two-quests");

    vi.setSystemTime(Date.now() + 7 * dayMs);

    expect(await questsAnswerOf(bob)).toEqual({ kind: "not-found" });
  });

  test("HH57: with two-quests off, the read is the Getting started journey as before", async () => {
    await switchWebsite(t, postHog, true, ...mondayPath);
    await thanks(bob, alice);
    await hugs(bob, alice);

    const { quests } = await questsReadOf(bob);
    expect(quests.kind).toBe("journey");
  });
});

async function questsAnswerOf(person: Person) {
  const { asSignedIn } = await aSignedInSession(t, { user: person.user, name: person.name });
  return asSignedIn.query(api.website.quests.getQuests, {});
}

async function questsReadOf(person: Person) {
  const answer = await questsAnswerOf(person);
  if (answer.kind !== "monday") throw new Error(`expected the Monday quests, got ${JSON.stringify(answer)}`);
  return answer;
}

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
