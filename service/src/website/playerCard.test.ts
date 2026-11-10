// LP94 LP95 LP98 HH29: getPlayerCard and getPlayerCardEmojis. Today's convex/website/playerCard.test.ts, on the
// service's test backend. The handlers are S17's; a card reads the album's flags and stores, the board and the clock,
// which other stacks own, and getAlbum, openThoughtfulPack and putAllIn are S16's website handlers the service doesn't
// have yet, so each read of them ends in S16's stub for it.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { emoji, mention, messageEvent, section, text } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { emojiNameOf, type EarnedEmojiId } from "../album/emojiNames.ts";
import type { HugGivenEvent, HugReceivedEvent, KudosGivenEvent } from "../bus/events.ts";
import type { Id } from "../db/columns.ts";
import { members } from "../db/schema/index.ts";
import { weekOf } from "../engine/allowance.ts";
import { countHugGiven, countHugReceived } from "../leaderboard/hugs.ts";
import { countKudosGiven } from "../leaderboard/totals.ts";
import { setLeaderboardVisibility } from "../leaderboard/visibility.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { AlbumRead, OpenAnswer, PutAllInAnswer } from "./album.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { getPlayerCard, getPlayerCardEmojis } from "./playerCard.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const today = "2026-10-13";
const minuteMs = 60_000;
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist" };
const dana = { user: "U_DANA", name: "Dana Ferreira" };
const cast = [alice, bob, carol, dana];
const why = "Thanks for untangling the flaky migration before the release";
const workspaceUrl = "https://kudos-test.slack.com/";
const flag = "person-page-d";

// The stacks whose stubs each step reaches. A card: the workspace's people (S3), XP levels (S6), turned medals (S8),
// the album's flags, stickers and tallies (S9), hoggies (S10), the board (S11), the clock (S15) and the album page's
// faces and level (S16). The emoji stack: the workspace's people and the album's flags and emojis. Thanks in Slack: the
// workspace's directory (S3), the engine (S4) and kudosGiven's subscribers: welcome and nudges (S5), XP and
// achievements (S6), quests (S7), packs (S8), tallies (S9), stickers (S10), the board and groups (S11) and analytics
// (S14). getAlbum and its pack mutations: S16's handlers over S8.
const cardRead: readonly Stack[] = ["S3", "S6", "S8", "S9", "S10", "S11", "S15", "S16"];
const emojisRead: readonly Stack[] = ["S3", "S9"];
const thanking: readonly Stack[] = ["S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S14"];
const packsOpened: readonly Stack[] = ["S8", "S16"];
const leaderboard: readonly Stack[] = ["S11"];
const stacksOf = (...steps: ReadonlyArray<readonly Stack[]>) => [...new Set(steps.flat())].sort((one, other) => Number(one.slice(1)) - Number(other.slice(1))) as [Stack, ...Stack[]];

type Person = { user: string; name: string };

const backend = useTestBackend({ now: tuesday.getTime(), workspace: "T1" });

let t: TestBackend;
let messages = 0;
let clock = tuesday.getTime();

beforeEach(async () => {
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  messages = 0;
  clock = tuesday.getTime();
  t = backend();
  t.slack.withWorkspaceUrl(workspaceUrl);
  for (const person of cast) t.slack.withMember(person.user, { real_name: person.name });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 1_000, hugBudget: 50 });
  await switchWebsite("album", "collection", "packs", "xp-levels", flag);
});

afterEach(() => void vi.unstubAllEnvs());

describe("LP94 LP95 LP98: getPlayerCard answers one card model for your own page and a teammate's", () => {
  waitsOn(stacksOf(thanking, packsOpened, cardRead), "a teammate's card carries their level, XP, place this week, people, hoggies and medals", async () => {
    await thanks(bob, why, alice);
    await thanks(bob, "Thanks for reviewing the long migration plan so carefully", carol);
    await opensAndPutsInEveryPack(bob);

    const card = await cardOf(alice, bob);

    expect(card).toMatchObject({
      kind: "card",
      card: {
        person: await memberOf(bob),
        name: bob.name,
        face: { kind: "initials", initials: "BO" },
        level: { level: expect.any(Number), xp: expect.any(Number), startsAt: expect.any(Number), nextAt: expect.any(Number) },
        place: { rank: 1, tied: false, kudosGiven: 2 },
        people: { held: 2, newest: expect.arrayContaining([expect.objectContaining({ person: await memberOf(alice) }), expect.objectContaining({ person: await memberOf(carol) })]) },
        hoggies: { found: expect.any(Number), total: expect.any(Number) },
        medals: { count: expect.any(Number), best: expect.any(Array) },
      },
    });
  }, 120_000);

  waitsOn(stacksOf(thanking, cardRead), "a teammate's week shows its totals and its public thoughtful kudos of the week, never the individual kudos lines", async () => {
    await thanks(alice, why, bob);
    const kudos = await thanks(bob, "Thanks for pairing on the stubborn cache invalidation all day", carol);

    const answer = await cardOf(dana, bob);

    if (answer.kind !== "card" || answer.week === undefined) throw new Error("expected Bob's card with his week");
    expect(answer.week).toEqual({
      days: [0, 2, 0, 0, 0, 0, 0],
      thanked: 1,
      thankedBy: 1,
      packsOpened: 0,
      hugs: 0,
      kudosOfWeek: { giver: expect.objectContaining({ person: await memberOf(bob), name: bob.name }), message: expect.objectContaining({ kind: "text" }), permalink: `${workspaceUrl}archives/C1/p${kudos.replace(".", "")}`, at: atOf(kudos), hugs: 0 },
    });
    expect(answer.week).not.toHaveProperty("given");
    expect(answer.week).not.toHaveProperty("received");
    expect(JSON.stringify(answer)).not.toContain("flaky migration");
  }, 120_000);

  waitsOn(stacksOf(thanking, cardRead), "HH6: a short kudos can be a teammate's kudos of the week", async () => {
    await thanks(alice, "ty", bob);

    const answer = await cardOf(dana, bob);

    expect(answer).toMatchObject({ kind: "card", week: { thankedBy: 1, kudosOfWeek: { giver: expect.objectContaining({ person: await memberOf(alice) }), message: expect.objectContaining({ kind: "text" }) } } });
  }, 120_000);

  waitsOn(stacksOf(cardRead), "a quiet new member's card has no place, no finds and an empty week", async () => {
    await memberOf(dana);

    const answer = await cardOf(alice, dana);

    expect(answer).toMatchObject({
      kind: "card",
      card: { person: await memberOf(dana), place: null, people: { held: 0, newest: [] }, hoggies: { found: 0, rarest: null }, medals: { count: 0, best: [] } },
      week: { days: [0, 0, 0, 0, 0, 0, 0], thanked: 0, thankedBy: 0, packsOpened: 0, hugs: 0, kudosOfWeek: null },
    });
  }, 120_000);

  waitsOn(stacksOf(leaderboard, cardRead), "HH30: a teammate's week counts the hugs Leaderboard counted in their own week", async () => {
    const bobInAuckland = await aMember(bob.user, "member", "T1", "Pacific/Auckland");
    t.time.advance(Date.parse("2026-10-18T12:00:00Z") - t.clock.now());
    await hugCounted(bobInAuckland, await memberOf(carol), { day: "2026-10-19" });
    await hugCounted(await memberOf(dana), bobInAuckland, { day: "2026-10-18", at: Date.parse("2026-10-18T12:00:00Z") });
    await hugCounted(await memberOf(dana), bobInAuckland, { day: "2026-10-18", at: Date.parse("2026-10-18T10:00:00Z") });

    expect(await cardOf(alice, bob)).toMatchObject({ kind: "card", week: { hugs: 2 } });
  }, 120_000);

  waitsOn(stacksOf(thanking, cardRead), "your own card carries no week, since your own page reads your whole week", async () => {
    await thanks(alice, why, bob);

    const answer = await cardOf(alice, alice);

    expect(answer).toMatchObject({ kind: "card", card: { person: await memberOf(alice), place: { rank: 1, kudosGiven: 1 } } });
    expect(answer).not.toHaveProperty("week");
  }, 120_000);

  waitsOn(stacksOf(cardRead), "a person outside your workspace has no card", async () => {
    const stranger = await aMember("U_STRANGER", "member", "T_OTHER");

    expect(await cardFor(alice, stranger)).toEqual({ kind: "no-person" });
    expect(await cardFor(alice, "not-an-id")).toEqual({ kind: "no-person" });
  }, 120_000);

  waitsOn(stacksOf(cardRead, emojisRead), "while person-page-d is off, the card is off", async () => {
    await switchWebsite("album", "collection", "packs", "xp-levels");

    expect(await cardOf(alice, bob)).toEqual({ kind: "off" });
    expect(await emojisOf(alice, await memberOf(bob))).toEqual({ kind: "off" });
  }, 120_000);

  waitsOn(stacksOf(packsOpened), "getAlbum says personPageD only while person-page-d is on", async () => {
    expect(await albumOf(alice)).toMatchObject({ personPageD: true });

    await switchWebsite("album", "collection", "packs", "xp-levels");

    expect(await albumOf(alice)).not.toHaveProperty("personPageD");
  }, 120_000);
});

describe("LP94: a card's medals and place follow the album and the board", () => {
  waitsOn(stacksOf(thanking, packsOpened, cardRead), "while hidden-items is on, a medal counts on the card only once its owner has turned its tier, as on their Milestones page", async () => {
    await switchWebsite("album", "collection", "packs", "xp-levels", "hidden-items", flag);
    await thanks(bob, why, alice);
    await opensAndPutsInEveryPack(bob);

    const album = await albumOf(bob);
    const held = "milestones" in album ? album.milestones.flatMap(({ tiers }) => tiers.filter(({ earnedAt }) => earnedAt !== null)) : [];
    const bobsId = await memberOf(bob);
    const reached = (await t.seed.all("milestoneTiers")).filter(({ member }) => member === bobsId);

    expect(reached.length).toBeGreaterThan(held.length);
    expect(await cardOf(dana, bob)).toMatchObject({ kind: "card", card: { medals: { count: held.length } } });
  }, 120_000);

  waitsOn(stacksOf(leaderboard, cardRead), "the card of the last of 1,400 givers this week reads in one query, sharing its place with a giver on equal kudos given", async () => {
    const givers = 1400;
    const thanked = await memberOf(dana);
    const inserted = await t.run(async (ctx) => {
      const rows = Array.from({ length: givers }, (_, index) => ({ ...ctx.newRow(), workspace: "T1", user: `U${index + 1}`, kind: "member" as const, asOf: 0, name: `Giver ${index + 1}` }));
      await ctx.tx.insert(members).values(rows);
      return rows.map(({ _id }) => _id as MemberId);
    });
    for (const [index, giver] of inserted.entries()) await kudosCounted(giver, thanked, { kudos: Math.max(2, index + 1), day: today });

    const answer = await cardFor(alice, inserted[0]!);

    expect(answer).toMatchObject({ kind: "card", card: { place: { rank: givers - 1, tied: true, kudosGiven: 2 } } });
  }, 120_000);
});

describe("HH29: the card's place is this week's Leaderboard place by kudos given", () => {
  waitsOn(stacksOf(thanking, cardRead), "an award worth 2 kudos shows 2", async () => {
    await thanksWorth(2, bob, why, alice);

    expect(await cardOf(dana, bob)).toMatchObject({ kind: "card", card: { place: { rank: 1, tied: false, kudosGiven: 2 } } });
  }, 120_000);

  waitsOn(stacksOf(thanking, leaderboard, cardRead), "a member who left the boards has no place, however much they gave", async () => {
    await thanksWorth(2, bob, why, alice);
    const bobsId = await memberOf(bob);
    await t.run((ctx) => setLeaderboardVisibility(ctx, bobsId, false));

    expect(await cardOf(dana, bob)).toMatchObject({ kind: "card", card: { place: null } });
  }, 120_000);

  waitsOn(stacksOf(thanking, cardRead), "givers of equal kudos share their place, however many awards each gave", async () => {
    await thanksWorth(2, bob, why, alice);
    await thanks(carol, why, alice);
    await thanks(carol, "Thanks for reviewing the long migration plan so carefully", dana);

    expect(await cardOf(dana, bob)).toMatchObject({ kind: "card", card: { place: { rank: 1, tied: true, kudosGiven: 2 } } });
    expect(await cardOf(dana, carol)).toMatchObject({ kind: "card", card: { place: { rank: 1, tied: true, kudosGiven: 2 } } });
  }, 120_000);
});

describe("LP94: getPlayerCardEmojis counts a person's emojis unlocked in a read of its own", () => {
  waitsOn(stacksOf(thanking, packsOpened, emojisRead), "the count is the album Emojis tab's earned count for its owner, and the stack shows their pictures", async () => {
    await thanks(bob, why, alice);
    await thanks(bob, "Thanks for reviewing the long migration plan so carefully", carol);
    await opensAndPutsInEveryPack(bob);

    const album = await albumOf(bob);
    const earned = "emojis" in album ? album.emojis.filter(({ earned: isEarned }) => isEarned) : [];

    const emojis = await emojisOf(dana, await memberOf(bob));

    expect(earned.map(({ name }) => name)).toEqual(expect.arrayContaining(["alice-marchetti-hype", "carol-lindqvist-hype"]));
    expect(emojis).toEqual({ kind: "emojis", count: earned.length, shown: expect.arrayContaining([expect.objectContaining({ name: "alice-marchetti-hype", picture: expect.any(String) })]) });
  }, 120_000);

  waitsOn(stacksOf(thanking, packsOpened, emojisRead), "an emoji with a second name shows on the stack under its first name", async () => {
    await thanks(bob, why, alice);
    await opensAndPutsInEveryPack(bob);
    expect(await giveEmojiASecondName("T1", `hype:${await memberOf(alice)}`, "alice-heart")).toBe(true);

    const emojis = await emojisOf(dana, await memberOf(bob));

    const names = "shown" in emojis ? emojis.shown.map(({ name }) => name) : [];
    expect(names).toContain("alice-marchetti-hype");
    expect(names).not.toContain("alice-heart");
  }, 120_000);

  waitsOn(stacksOf(emojisRead), "a quiet member has no emojis", async () => {
    expect(await emojisOf(alice, await memberOf(dana))).toEqual({ kind: "emojis", count: 0, shown: [] });
  }, 120_000);
});

// S16's website handlers, which the service doesn't have yet.
async function getAlbum(_ctx: QueryContext, _me: VerifiedMember): Promise<AlbumRead> {
  throw notPorted("website.album.getAlbum");
}

async function openThoughtfulPack(_ctx: MutationContext, _me: VerifiedMember, _args: { pack: string }): Promise<OpenAnswer> {
  throw notPorted("website.album.openThoughtfulPack");
}

async function putAllIn(_ctx: MutationContext, _me: VerifiedMember): Promise<PutAllInAnswer> {
  throw notPorted("website.album.putAllIn");
}

// Today's `switchWebsite`: the website open, these flags on for everyone, and the workspace's key made.
async function switchWebsite(...flags: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

async function cardOf(viewer: Person, person: Person) {
  return cardFor(viewer, await memberOf(person));
}

async function cardFor(viewer: Person, person: string) {
  const me = await signedIn(viewer);
  return t.query((ctx) => getPlayerCard(ctx, me, { person }));
}

async function emojisOf(viewer: Person, person: string) {
  const me = await signedIn(viewer);
  return t.query((ctx) => getPlayerCardEmojis(ctx, me, { person }));
}

async function albumOf(person: Person) {
  const me = await signedIn(person);
  const album = await t.query((ctx) => getAlbum(ctx, me));
  if (album.kind !== "album") throw new Error(`getAlbum answered ${album.kind}`);
  return album;
}

async function opensAndPutsInEveryPack(member: Person) {
  const me = await signedIn(member);
  const album = await t.query((ctx) => getAlbum(ctx, me));
  for (const { pack } of "packs" in album ? album.packs : []) await t.run((ctx) => openThoughtfulPack(ctx, me, { pack }));
  laterBy(minuteMs);
  await t.run((ctx) => putAllIn(ctx, me));
  await t.settle();
}

// Today's `giveEmojiASecondName`, a test-only mutation the service has no counterpart of: a registered emoji takes
// a second name.
async function giveEmojiASecondName(workspace: string, emoji: EarnedEmojiId, name: string) {
  if ((await t.query((ctx) => emojiNameOf(ctx, workspace, emoji))) === null) return false;
  await t.seed.insert("secondEmojiNames", { workspace, emoji, name });
  return true;
}

function laterBy(ms: number) {
  clock += ms;
  const ahead = Math.max(t.clock.now(), clock) - t.clock.now();
  if (ahead > 0) t.time.advance(ahead);
}

function nextTs() {
  messages += 1;
  laterBy(minuteMs);
  return `${clock / 1000}.${String(messages).padStart(6, "0")}`;
}

function atOf(ts: string) {
  return Number(ts.split(".")[0]) * 1000;
}

async function thanks(giver: Person, words: string, ...recipients: Person[]) {
  return thanksWorth(1, giver, words, ...recipients);
}

async function thanksWorth(kudos: number, giver: Person, words: string, ...recipients: Person[]) {
  const ts = nextTs();
  await t.send("/events", messageEvent([section(text(`${words} `), ...recipients.map(({ user }) => mention(user)), ...Array.from({ length: kudos }, () => emoji("taco")))], { user: giver.user, ts }));
  await t.settle();
  return ts;
}

// The website's member check is S15's; a read here runs as the member it would let in.
async function signedIn(person: Person): Promise<VerifiedMember> {
  return { member: await memberOf(person), workspace: "T1", user: person.user, name: person.name };
}

async function memberOf(person: Person): Promise<MemberId> {
  const row = (await t.seed.all("members")).find(({ workspace, user }) => workspace === "T1" && user === person.user);
  if (row === undefined) return aMember(person.user);
  return row._id as MemberId;
}

function aMember(user: string, kind: "member" | "not-a-member" = "member", workspace = "T1", timeZone?: string): Promise<MemberId> {
  return t.seed.insert("members", { workspace, user, kind, asOf: 0, ...(timeZone && { timeZone }) }) as Promise<MemberId>;
}

// Today's testing/leaderboard.ts: a kudos or a hug as Leaderboard counts it, without the message that gave it.
let messagesCounted = 0;

function aCountedMessage() {
  messagesCounted += 1;
  return { workspace: "T1", conversation: "C1", message: `counted-${messagesCounted}` };
}

async function kudosCounted(giver: MemberId, recipient: MemberId, { kudos = 1, day }: { kudos?: number; day: string }) {
  const message = aCountedMessage();
  const at = Date.parse(`${day}T12:00:00Z`);
  const award = (await t.seed.insert("awards", { workspace: "T1", conversation: message.conversation, message: message.message, giver, recipient, kudos, day, at })) as Id<"awards">;
  const event: KudosGivenEvent = {
    type: "kudosGiven",
    workspace: "T1",
    message,
    giver,
    awards: [{ award, giver, recipient, kudos }],
    via: "message",
    kudosEmoji: "taco",
    annotations: {},
    allowance: { dailyOpening: 3, dailyLeft: 2 },
    skippedMentions: 0,
    retry: false,
    inThread: false,
    day,
    at,
  };
  await t.run((ctx) => countKudosGiven(ctx, { event }));
}

async function hugCounted(giver: MemberId, person: MemberId, { day, at = Date.parse(`${day}T12:00:00Z`) }: { day: string; at?: number }) {
  const message = aCountedMessage();
  const given: HugGivenEvent = { type: "hugGiven", workspace: "T1", giver, message, onKudos: false, author: person, at, day };
  const received: HugReceivedEvent = { type: "hugReceived", workspace: "T1", giver, person, message, at, week: weekOf(day).monday };
  await t.run((ctx) => countHugGiven(ctx, { event: given }));
  await t.run((ctx) => countHugReceived(ctx, { event: received }));
}
