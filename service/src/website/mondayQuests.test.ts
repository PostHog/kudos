// The quests panel on the Monday path: the Getting started journey, then the week's drawn quests, and the view report.
// Today's convex/website/mondayQuests.test.ts, on the service's test backend: each read runs quests.ts's `getQuests`, and
// each view its `viewQuests`, for a `me` made from the member's directory row, as S15's member check answers it. Kudos
// and hugs go through the front door as Slack sends them; getAlbum is S16's handler and runs as itself, and turnItem is
// S16's command, which has no route yet, so a turn ends at a stand-in for its stub.
import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { emoji, memberEvent, mention, messageEvent, reactionEvent, section, text } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import { members as schemaMembers } from "../db/schema/index.ts";
import { jobs } from "../db/schema/service.ts";
import type { HomeMember } from "../feedback/homes.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { sweep } from "../quests/newWeek.ts";
import { serviceRegistry } from "../registry.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import { getAlbum, type AlbumAnswer, type AlbumRead, type TurnAnswer } from "./album.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { getQuests, viewQuests, type GettingStartedStep, type MondayQuests } from "./quests.ts";
import { commandByRoute } from "./routesTesting.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const allowedWorkspace = "T1";
const alice = { user: "U_ALICE", name: "Alice Marchetti", givenName: "Alice" };
const bob = { user: "U_BOB", name: "Bob Okonkwo", givenName: "Bob" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist", givenName: "Carol" };
const dave = { user: "U_DAVE", name: "Dave Achterberg", givenName: "Dave" };
const saysWhy = "thanks for untangling the flaky migration today";
const todaysFlags = ["xp-levels", "album", "collection", "packs", "hidden-items", "onboarding", "hugs"];
const mondayPath = [...todaysFlags, "monday-quest"];

// A kudos or a hug through Slack, whose events every domain's subscribers take: the parser and engine (S4), replies
// (S5), progression, achievements and unlocks (S6), quests and the wallet (S7), the album (S8, S9, S10), groups and
// boards (S11), activity (S12), hugs (S13) and analytics (S14).
const giving: Stack[] = ["S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14"];
// getQuests on the Monday path: the xp-levels decision (S6), the website's clock (S15), the journey's quests and the
// drawn week (S7), the hug step (S13) and the quest items (S8).
const reading: Stack[] = ["S6", "S7", "S8", "S13", "S15"];
// Turning the quest's item on the album (S16's getAlbum and turnItem).
const turning: Stack[] = ["S16"];
// The week's draw: the hourly sweep (S7).
const sweeping: Stack[] = ["S7"];
// A teammate who joins: the directory sync through the front door (S3).
const joining: Stack[] = ["S3"];
// viewQuests: the xp-levels decision (S6) and the usage fact (S14).
const viewing: Stack[] = ["S6", "S14"];

function stacks(...groups: Stack[][]): [Stack, ...Stack[]] {
  const all = [...new Set(groups.flat())].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return all as [Stack, ...Stack[]];
}

type Person = typeof alice;

const backend = useTestBackend({ now: tuesday.getTime(), workspace: allowedWorkspace });

let t: TestBackend;
let messages = 0;

beforeEach(async () => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", allowedWorkspace);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  t = backend();
  for (const person of [alice, bob, carol]) t.slack.withMember(person.user, { real_name: person.name });
  await t.seed.insert("workspaces", { workspace: allowedWorkspace, kudosEmoji: "taco", baseAllowance: 200 });
});

afterEach(() => void vi.unstubAllEnvs());

// Today's `switchWebsite(t, postHog, true, ...flags)`: the website open, these flags on for everyone, and the workspace's key made.
async function switchWebsite(...flags: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

describe("MQ37 MQ38: on the Monday path the quests read answers the Getting started journey", () => {
  waitsOn(stacks(giving, reading), "a newcomer who hugged once sees five steps, the hug done and the first quest next, greeted by first name", async () => {
    await switchWebsite(...mondayPath);
    const bobsMessage = await thanks(bob, "thanks", carol);

    await react(alice, bob, bobsMessage);
    await settleInTimeOrder();

    const quests = await mondayQuestsOf(alice);
    expect(quests.firstName).toBe("Alice");
    expect(quests.next, "the next onboarding quest").toBe("first-thanks");
    expect(journeyOf(quests).map(({ step, done }) => [step, done])).toEqual([
      ["hug", true],
      ["first-thanks", false],
      ["turn", false],
      ["someone-new", false],
      ["two-days", false],
    ]);
    expect(journeyOf(quests).map(({ goal, reward }) => [goal, reward?.xp ?? null])).toEqual([
      ["Give your first hug", null],
      ["Give a kudos to someone", 50],
      ["Identify the hoggie it left on your board", null],
      ["Thank someone new", 50],
      ["Thank someone on two different days", 50],
    ]);
  }, 60_000);

  waitsOn(stacks(giving, reading, turning), "a first thoughtful kudos finishes the first quest with its item waiting, and turning it marks the item turned and the turn step done", async () => {
    await switchWebsite(...mondayPath);

    await thanks(alice, saysWhy, bob);

    const finished = stepOf(await mondayQuestsOf(alice), "first-thanks");
    expect(finished, "the first quest").toMatchObject({ done: true, progress: { done: 1, target: 1 }, item: "waiting" });
    expect(stepOf(await mondayQuestsOf(alice), "two-days").progress, "the third quest's days").toEqual({ done: 1, target: 2 });
    expect((await mondayQuestsOf(alice)).next).toBe("someone-new");

    await turnTheQuestItemOf(alice);

    const turned = await mondayQuestsOf(alice);
    expect(stepOf(turned, "first-thanks").item, "the first quest's item").toBe("turned");
    expect(stepOf(turned, "turn").done, "the turn step").toBe(true);
  }, 60_000);

  waitsOn(stacks(giving, reading), "an unfinished quest and a guidance step carry no item", async () => {
    await switchWebsite(...mondayPath);

    await thanks(alice, saysWhy, bob);

    const quests = await mondayQuestsOf(alice);
    expect(stepOf(quests, "someone-new").item).toBeNull();
    expect(stepOf(quests, "hug").item).toBeNull();
  }, 60_000);

  waitsOn(stacks(giving, reading), "MQ7: a step finished before its quest paid an item answers no item state", async () => {
    await switchWebsite(...mondayPath);
    const member = await memberOf(alice);
    await t.seed.insert("rewardRecords", { member, key: "journey:first-thanks", xp: 20, coins: 10, item: null, catalogueVersion: "1", at: t.clock.now() });
    await t.seed.insert("questFinishes", { member, key: "journey:first-thanks", xp: 20, catalogueVersion: "1", at: t.clock.now() });

    const quests = await mondayQuestsOf(alice);

    expect(stepOf(quests, "first-thanks")).toMatchObject({ done: true, item: null });
  }, 60_000);
});

describe("MQ37 MQ9: once the three quests are finished, the read answers this week's drawn quests", () => {
  waitsOn(stacks(joining, giving, sweeping, reading), "the journey gives way to three drawn quests at 20 XP, with the days left in the week", async () => {
    await switchWebsite(...mondayPath);
    await aTeammateNotThankedYet(dave);

    await finishOnboarding();
    await theHourlySweep();

    const quests = await mondayQuestsOf(alice);
    expect(quests.next).toBeNull();
    expect(quests.daysLeft, "Wednesday to Sunday").toBe(5);
    const drawn = drawnOf(quests);
    expect(drawn).toHaveLength(3);
    expect(drawn.every(({ reward, done, item }) => reward.xp === 20 && !done && item === null)).toBe(true);
    expect(drawn.every(({ goal, progress }) => goal.length > 0 && progress.target >= 1)).toBe(true);
  }, 60_000);

  waitsOn(stacks(giving, sweeping, reading), "MQ4: a week drawn from the unlock path's pool is not shown as the Monday week", async () => {
    await switchWebsite(...mondayPath);
    await finishOnboarding();
    await theHourlySweep();

    await drawnFromTheUnlockPool(alice);

    expect((await mondayQuestsOf(alice)).quests.kind).toBe("journey");
  }, 60_000);

  waitsOn(stacks(giving, sweeping, reading), "a Monday week drawn with a say-why quest of the earlier pool reads that quest's goal and progress", async () => {
    await switchWebsite(...mondayPath);
    await finishOnboarding();
    await theHourlySweep();

    await drawnWithAnEarlierSayWhyQuest(alice);

    const drawn = drawnOf(await mondayQuestsOf(alice));
    expect(drawn.map(({ goal, progress }) => ({ goal, target: progress.target }))).toContainEqual({ goal: "Thank someone and say why on 2 different days", target: 2 });
  }, 60_000);
});

// Today's read by_member_week: the member's draws in week order.
async function drawsOf(member: MemberId) {
  return (await t.seed.all("questDraws")).filter((draw) => draw.member === member).sort((a, b) => a.week.localeCompare(b.week) || a._creationTime - b._creationTime);
}

async function drawnWithAnEarlierSayWhyQuest(person: Person) {
  const member = await memberOf(person);
  const [draw] = await drawsOf(member);
  await t.seed.patch("questDraws", draw!._id, { slots: draw!.slots.map((slot, index) => (index === 1 ? { ...slot, quest: "say-why-two-days" as const } : slot)) });
}

async function drawnFromTheUnlockPool(person: Person) {
  const member = await memberOf(person);
  for (const draw of (await drawsOf(member)).slice(0, 10)) {
    await t.seed.patch("questDraws", draw._id, { slots: draw.slots.map((slot) => ({ ...slot, quest: "say-why" as const, catalogueVersion: "1" })) });
  }
}

describe("MQ37 MQ43: off the Monday path the quests read answers as today", () => {
  waitsOn(stacks(giving), "with monday-quest off, a member with neither path gets no quests", async () => {
    await switchWebsite(...todaysFlags);

    await thanks(alice, saysWhy, bob);

    expect(await questsOf(alice)).toEqual({ kind: "not-found" });
  });
});

describe("MQ41: viewing the quests records quests viewed", () => {
  for (const surface of ["panel", "profile"] as const) {
    waitsOn(stacks(giving, viewing), `a view on the ${surface} records one quests viewed with its surface`, async () => {
      await switchWebsite(...mondayPath);
      await thanks(alice, saysWhy, bob);
      const me = await signedIn(alice);

      expect(await view(me, surface)).toEqual({ kind: "viewed" });
      await settleInTimeOrder();

      expect(questsViewed()).toEqual([{ surface }]);
    }, 60_000);
  }

  waitsOn(stacks(giving, viewing), "each view records once", async () => {
    await switchWebsite(...mondayPath);
    await thanks(alice, saysWhy, bob);
    const me = await signedIn(alice);

    await view(me, "panel");
    await view(me, "panel");
    await settleInTimeOrder();

    expect(questsViewed()).toHaveLength(2);
  }, 60_000);

  waitsOn(stacks(giving, viewing), "off the Monday path a view is refused and records nothing", async () => {
    await switchWebsite(...todaysFlags);
    await thanks(alice, saysWhy, bob);
    const me = await signedIn(alice);

    expect(await view(me, "panel")).toEqual({ kind: "refused" });
    await settleInTimeOrder();

    expect(questsViewed()).toEqual([]);
  }, 60_000);
});

// S16's turn command, by its route name: it ends in `notPorted` until S16 registers `website.album.turnItem`.
function turnItem(ctx: MutationContext, me: VerifiedMember, args: { item: string }) {
  return commandByRoute<TurnAnswer>("website.album.turnItem", ctx, me, args);
}

// The front door acknowledges an event no domain registered a handler for and takes nothing in, so a kudos, a hug or a
// join sent before the stack that handles it lands would go nowhere: until then it ends here, as at a stub.
function handledByTheFrontDoor(kind: "message" | "reactionAdded" | "memberChanged") {
  if (!Object.hasOwn(serviceRegistry.slack.events ?? {}, kind)) throw notPorted(`slack.events.${kind}`);
}

/** Today's `settleInTimeOrder` and `settle`: every job runs, the clock moving to each later one's time as convex-test's timers did. */
async function settleInTimeOrder() {
  for (;;) {
    await t.settle();
    const [next] = await t.query(({ tx }) => tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt), asc(jobs._id)).limit(1));
    if (next === undefined || next.runAt <= t.clock.now()) return;
    t.time.advance(next.runAt - t.clock.now());
  }
}

async function aTeammateNotThankedYet(person: Person) {
  handledByTheFrontDoor("memberChanged");
  t.slack.withMember(person.user, { real_name: person.name });
  await delivered(t.send("/events", memberEvent("team_join", { id: person.user, profile: { real_name: person.name } })));
}

async function finishOnboarding() {
  await thanks(alice, saysWhy, bob);
  await thanks(alice, "thanks", carol);
  t.time.advance(dayMs);
  await thanks(alice, saysWhy, bob);
}

async function theHourlySweep() {
  await t.run((ctx) => sweep(ctx, {}));
  await settleInTimeOrder();
}

async function thanks(giver: Person, words: string, ...recipients: Person[]) {
  handledByTheFrontDoor("message");
  messages += 1;
  t.time.advance(minuteMs);
  const ts = `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}`;
  await delivered(t.send("/events", messageEvent([section(text(`${words} `), ...recipients.flatMap(({ user }) => [mention(user), text(" ")]), emoji("taco"))], { user: giver.user, ts })));
  await settleInTimeOrder();
  return ts;
}

async function react(giver: Person, author: Person, ts: string) {
  handledByTheFrontDoor("reactionAdded");
  await delivered(t.send("/events", reactionEvent({ user: giver.user, itemUser: author.user, ts })));
}

// A reader signed in as today's `aSignedInSession` left them: the analytics ID the flags decide them by, and the member
// check's answer with the sign-in's names.
async function signedIn(person: Person): Promise<VerifiedMember> {
  const member = await memberOf(person);
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: allowedWorkspace, user: person.user, name: person.name, givenName: person.givenName };
}

async function questsOf(person: Person) {
  const me = await signedIn(person);
  return t.query((ctx) => getQuests(ctx, me));
}

function view(me: VerifiedMember, surface: "panel" | "profile") {
  return t.run(async (ctx) => viewQuests(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, { surface }));
}

async function mondayQuestsOf(person: Person): Promise<MondayQuests> {
  const answer = await questsOf(person);
  if (answer.kind !== "monday") throw new Error(`expected the Monday path's quests, got ${JSON.stringify(answer)}`);
  return answer;
}

function journeyOf({ quests }: MondayQuests): GettingStartedStep[] {
  if (quests.kind !== "journey") throw new Error(`expected the journey, got ${quests.kind}`);
  return quests.steps;
}

function drawnOf({ quests }: MondayQuests) {
  if (quests.kind !== "drawn") throw new Error(`expected the drawn quests, got ${quests.kind}`);
  return quests.quests;
}

function stepOf(quests: MondayQuests, step: GettingStartedStep["step"]): GettingStartedStep {
  return journeyOf(quests).find((shown) => shown.step === step)!;
}

async function turnTheQuestItemOf(person: Person) {
  const me = await signedIn(person);
  const album = (await t.query((ctx) => getAlbum(ctx, me))) as AlbumAnswer;
  const item = album.board!.items.find(({ reason }) => reason.kind === "quest")!;
  expect(await t.run((ctx) => turnItem(ctx, me, { item: item.item }))).toMatchObject({ kind: "turned" });
  await settleInTimeOrder();
}

function questsViewed() {
  return t.postHog
    .productEvents()
    .filter(({ event }) => event === "quests viewed")
    .map(({ properties }) => ({ surface: properties.surface }));
}

// Today's read by_user, and a kudos from Bob that makes the member when the directory has no row for them yet.
async function memberOf(person: Person): Promise<MemberId> {
  const rows = await t.query(({ tx }) => tx.select().from(schemaMembers).where(and(eq(schemaMembers.workspace, allowedWorkspace), eq(schemaMembers.user, person.user))).orderBy(asc(schemaMembers._creationTime), asc(schemaMembers._id)));
  if (rows.length > 1) throw new Error(`${rows.length} members rows for ${person.user}, where one is unique`);
  const [row] = rows;
  if (row === undefined) {
    await thanks(bob, "thanks", person);
    return memberOf(person);
  }
  return row._id as MemberId;
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
