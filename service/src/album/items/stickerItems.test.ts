// convex/album/items/stickerItems.test.ts on the service: a thanks earns its hoggie and sticker items, and a sticker's
// turn is today's put-in, with the team stickers, hype emojis and milestone tiers it unlocks. Each test has its members
// join and the company copy sync in its body, so a step that reaches a stub keeps the test waiting.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { emoji, mention, section, text } from "../../../testing/slackMessages.ts";
import { waitsOn } from "../../../testing/waiting.ts";
import type { Id } from "../../db/columns.ts";
import type { Doc } from "../../db/schema/index.ts";
import type { AlbumAnswer, TurnAnswer } from "../../website/album.ts";
import type { AlbumPersonAnswer } from "../../website/albumPages.ts";
import type { Denial } from "../../website/memberQuery.ts";
import type { MemberId } from "../../workspace/directory.ts";
import {
  aDeploymentForWorkspace,
  aSignedInSession,
  everythingWritten as everythingWrittenIn,
  kudosReceived as kudosReceivedIn,
  memberChanged,
  memberOf as memberIn,
  person,
  post,
  registry,
  switchWebsite,
  syncTheCompanyCopy,
  withPostHogCom,
  type FakePostHogCom,
  type Person,
  type Reader,
  type TeamPage,
} from "../albumPorts.testing.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const weekMs = 7 * 24 * 60 * minuteMs;
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const itemsOn = [...albumOpen, "hidden-items"];

type Turned = Extract<TurnAnswer, { kind: "turned" }>;

const alice = person("Alice", "Marchetti");
const bob = person("Bob", "Okonkwo");
const carol = person("Carol", "Lindqvist");
const erin = person("Erin", "Teamless");
const everyone = [alice, bob, carol, erin];
const lanterns: TeamPage = { slug: "lanterns", name: "Lanterns", profiles: profilesOf(alice, bob, carol) };

// The stacks every test here reaches: S3 and S4 take the members' joining and the thanks in Slack in, S12 syncs the
// company copy, S15 signs the member in and S16 serves the album's commands; S9 and S10 hold the bodies a turn reaches
// (album stickers, hype emojis, milestones; team pages and team stickers).
const theTurnPath = ["S3", "S4", "S9", "S10", "S12", "S15", "S16"] as const;

const backend = useTestBackend({ now: tuesday.getTime(), registry });
let t: TestBackend;
let postHogCom: FakePostHogCom;
let messages = 0;

beforeEach(async () => {
  aDeploymentForWorkspace();
  t = backend();
  postHogCom = withPostHogCom(t);
  for (const { user, name } of everyone) t.slack.withMember(user, { profile: { display_name: name, real_name: name } });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 } as never);
  await switchWebsite(t, true, ...itemsOn);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Today's `beforeEach` had everyone join and the company copy hold the Lanterns; both reach other stacks, so each test
// does them first in its body.
async function everyoneJoinsTheLanterns() {
  for (const { user, name } of everyone) await memberChanged(t, "team_join", { id: user, team_id: "T1", name, real_name: name, profile: { real_name: name, display_name: name } });
  await t.settle();
  await theCompanyCopyHolds(lanterns);
}

describe("LP7: a thanks earns its hoggie and, where the pack holds one, the person's sticker", { timeout: 60_000 }, () => {
  waitsOn(theTurnPath, "a thanks to a new face earns the hoggie and the sticker, each once, and the redelivered event earns nothing more", async () => {
    await everyoneJoinsTheLanterns();
    const ts = await thanks(alice, bob);
    await redeliver(alice, ts, bob);

    const pack = await packOf(alice, bob);
    expect(await thanksItemsEarnedBy(alice)).toEqual([
      { source: "hoggie", key: `thoughtful:${pack}`, reason: { kind: "thanks", person: await memberOf(bob) } },
      { source: "sticker", key: pack, reason: { kind: "thanks", person: await memberOf(bob) } },
    ]);
    expect(await thanksItemsOf(await signedIn(alice))).toHaveLength(2);
  });

  waitsOn(theTurnPath, "a thanks whose pack holds no sticker, because the person's sticker already waits, earns only its hoggie", async () => {
    await everyoneJoinsTheLanterns();
    await thanks(alice, bob);
    await t.time.advance(weekMs);
    await thanks(alice, bob);

    expect((await thanksItemsEarnedBy(alice)).map(({ source }) => source)).toEqual(["hoggie", "sticker", "hoggie"]);
  });
});

describe("LP13: a sticker's turn is today's put-in", { timeout: 60_000 }, () => {
  waitsOn(theTurnPath, "the sticker's turn puts the person in the album on their first team page, sends album sticker collected and item turned once, and a replay answers the same face and changes nothing", async () => {
    await everyoneJoinsTheLanterns();
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);

    const turned = await turnTheSticker(asAlice, bob);
    await t.settle();
    const written = await everythingWritten();
    const again = await turn(asAlice, await itemOf(alice, "sticker", bob));
    await t.settle();

    expect(turned).toMatchObject({ kind: "turned", face: { kind: "sticker", person: await memberOf(bob), isNew: true, thanked: { name: bob.name } }, applied: null, page: { kind: "team", team: "lanterns" }, again: false });
    expect((await albumOf(asAlice)).people).toContainEqual(expect.objectContaining({ person: await memberOf(bob), held: true }));
    expect(again).toMatchObject({ ...turned, again: true, unlocked: { teamStickers: [], hype: null, milestones: [] } });
    expect(await everythingWritten()).toEqual(written);
    expect(eventsNamed("album sticker collected")).toHaveLength(1);
    const stickersTurned = eventsNamed("item turned").filter(({ properties }) => properties.source === "sticker");
    expect(stickersTurned.map(({ properties: { source, rarity, is_new } }) => ({ source, rarity, is_new }))).toEqual([{ source: "sticker", rarity: undefined, is_new: true }]);
  });

  waitsOn(theTurnPath, "a person on no team page lands on their person page", async () => {
    await everyoneJoinsTheLanterns();
    await thanks(alice, erin);

    expect(await turnTheSticker(await signedIn(alice), erin)).toMatchObject({ kind: "turned", page: { kind: "person", person: await memberOf(erin) } });
  });
});

describe("LP14 LP19: a sticker that fills a team unlocks its team sticker and team emoji on that page", { timeout: 60_000 }, () => {
  waitsOn(theTurnPath, "the sticker of the team's last person answers the team, unlocks its sticker and its emoji as seen, and a replay changes nothing", async () => {
    await everyoneJoinsTheLanterns();
    await thanks(alice, bob, carol);
    const asAlice = await signedIn(alice);

    const first = await turnTheSticker(asAlice, bob);
    const filling = await turnTheSticker(asAlice, carol);
    const written = await everythingWritten();
    await turn(asAlice, await itemOf(alice, "sticker", carol));

    expect(first.unlocked.teamStickers).toEqual([]);
    expect(filling).toMatchObject({ page: { kind: "team", team: "lanterns" }, unlocked: { teamStickers: [{ team: "lanterns", name: "Lanterns", emoji: "team-lanterns", at: t.clock.now() }] } });
    const album = await albumOf(asAlice);
    expect(album.teams.find(({ team }) => team === "lanterns")).toMatchObject({ state: "unlocked", unlockedAt: t.clock.now() });
    expect(album.emojis.find(({ id }) => id === "team:lanterns")).toMatchObject({ earned: true, seen: true });
    expect(await everythingWritten()).toEqual(written);
  });
});

describe("LP14: the first item turned from thanking a person unlocks their hype emoji once", { timeout: 60_000 }, () => {
  waitsOn(theTurnPath, "with hidden-items on a hoggie turned while the person's sticker waits leaves the hype emoji waiting, and the sticker's turn answers it with its person's name and marks it seen", async () => {
    await everyoneJoinsTheLanterns();
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const hype = `hype:${await memberOf(bob)}`;
    expect((await albumOf(asAlice)).emojis.find(({ id }) => id === hype)).toMatchObject({ earned: false, seen: false });

    const hoggie = await turn(asAlice, await itemOf(alice, "hoggie", bob));
    expect(hoggie, "the hoggie turned while the sticker waits").toMatchObject({ kind: "turned", unlocked: { hype: null } });
    expect((await albumOf(asAlice)).emojis.find(({ id }) => id === hype), "the hype emoji after the hoggie's turn").toMatchObject({ earned: false, seen: false });
    const sticker = await turnTheSticker(asAlice, bob);

    expect(sticker.unlocked.hype, "the sticker's turn").toMatchObject({ name: "bob-okonkwo-hype", from: bob.name });
    expect((await albumOf(asAlice)).emojis.find(({ id }) => id === hype)).toMatchObject({ earned: true, seen: true });
  });

  waitsOn(theTurnPath, "a thanks whose pack holds no sticker, because the person's sticker is already in the album, unlocks the hype emoji with its hoggie's turn", async () => {
    await everyoneJoinsTheLanterns();
    await aStickerTheHistoryBrought(alice, bob);
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);

    const hoggie = await turn(asAlice, await itemOf(alice, "hoggie", bob));

    expect(hoggie, "the only item of the thanks").toMatchObject({ kind: "turned", unlocked: { hype: { name: "bob-okonkwo-hype", from: bob.name } } });
  });

  waitsOn(theTurnPath, "with hidden-items on the hype emoji reads unearned on the person's page and gives no kudos in Slack until its item turns", async () => {
    await everyoneJoinsTheLanterns();
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    expect((await personPageOf(asAlice, bob)).hype, "the person page before the turn").toMatchObject({ earned: false });
    await thanksWith(alice, "bob-okonkwo-hype", carol);
    expect(await kudosReceived(carol.user), "a kudos with the waiting hype emoji").toBe(0);

    await turnTheSticker(asAlice, bob);
    await thanksWith(alice, "bob-okonkwo-hype", carol);

    expect((await personPageOf(asAlice, bob)).hype, "the person page after the turn").toMatchObject({ earned: true });
    expect(await kudosReceived(carol.user), "a kudos with the unlocked hype emoji").toBe(1);
  });

  waitsOn(theTurnPath, "LP6: a hype emoji earned through the old put-in stays earned once hidden-items is on, while a later thanks to the same person waits face down", async () => {
    await everyoneJoinsTheLanterns();
    await switchWebsite(t, true, ...albumOpen);
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    for (const { pack } of (await albumOf(asAlice)).packs) await asAlice.openThoughtfulPack({ pack });
    await asAlice.putAllIn();
    await t.time.advance(weekMs);
    await switchWebsite(t, true, ...itemsOn);
    await thanks(alice, bob);
    const asAliceAWeekOn = await signedIn(alice);
    expect((await thanksItemsOf(asAliceAWeekOn)).map(({ reason }) => reason.kind === "thanks" && reason.thanked.name), "the later thanks waits").toEqual([bob.name]);

    await thanksWith(alice, "bob-okonkwo-hype", carol);

    expect((await personPageOf(asAliceAWeekOn, bob)).hype, "the person page").toMatchObject({ earned: true });
    expect(await kudosReceived(carol.user), "a kudos with the hype emoji earned before").toBe(1);
  });

  waitsOn(theTurnPath, "with hidden-items off the hype emoji is earned and unseen at the thanks, on the person's page and in Slack, as today", async () => {
    await everyoneJoinsTheLanterns();
    await switchWebsite(t, true, ...albumOpen);
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);

    const hype = `hype:${await memberOf(bob)}`;
    expect((await albumOf(asAlice)).emojis.find(({ id }) => id === hype)).toMatchObject({ earned: true, seen: false });
    expect((await personPageOf(asAlice, bob)).hype).toMatchObject({ earned: true });
    await thanksWith(alice, "bob-okonkwo-hype", carol);
    expect(await kudosReceived(carol.user)).toBe(1);
  });
});

describe("LP13 LP14: every turn answers the milestone tiers it unlocks", { timeout: 60_000 }, () => {
  waitsOn(theTurnPath, "a hoggie's turn answers the thoughtful tier its thanks reached in Slack, and each sticker's turn exactly the tiers recorded in its mutation, the teams tier when it fills a team", async () => {
    await everyoneJoinsTheLanterns();
    await thanks(alice, bob, carol);
    const asAlice = await signedIn(alice);

    const hoggie = await turn(asAlice, await itemOf(alice, "hoggie", bob));
    await t.time.advance(minuteMs);
    const first = await turnTheSticker(asAlice, bob);
    const firstTiers = await tiersRecordedAt(alice, t.clock.now());
    await t.time.advance(minuteMs);
    const filling = await turnTheSticker(asAlice, carol);
    const fillingTiers = await tiersRecordedAt(alice, t.clock.now());

    expect(hoggie).toMatchObject({ kind: "turned", unlocked: { milestones: [{ milestone: "thoughtful", tier: "bronze" }] } });
    expect(first.unlocked.milestones).toEqual(expect.arrayContaining(firstTiers));
    expect(first.unlocked.milestones).toHaveLength(firstTiers.length);
    expect(filling.unlocked.milestones).toEqual(expect.arrayContaining(fillingTiers));
    expect(filling.unlocked.milestones).toHaveLength(fillingTiers.length);
    expect(filling.unlocked.milestones).toContainEqual({ milestone: "teams", tier: "bronze" });
  });
});

describe("LP6: the old put-in and put-all-in mark the sticker item turned", { timeout: 60_000 }, () => {
  waitsOn(theTurnPath, "with hidden-items off a sticker put in, and the stickers put all in, no longer wait once the flag turns on, while the tray's hoggies wait until they are put in", async () => {
    await everyoneJoinsTheLanterns();
    await switchWebsite(t, true, ...albumOpen);
    await thanks(alice, bob, carol);
    const asAlice = await signedIn(alice);
    for (const { pack } of (await albumOf(asAlice)).packs) await asAlice.openThoughtfulPack({ pack });
    const bobMember = await memberOf(bob);
    const bobsSticker = (await albumOf(asAlice)).tray.find((item) => item.kind === "sticker" && item.person === bobMember);
    await asAlice.putIn({ item: bobsSticker!.item });

    await switchWebsite(t, true, ...itemsOn);
    expect((await thanksItemsOf(asAlice)).map(({ reason }) => reason.kind === "thanks" && reason.thanked.name).sort()).toEqual([bob.name, carol.name, carol.name]);
    await switchWebsite(t, true, ...albumOpen);
    await asAlice.putAllIn();
    await switchWebsite(t, true, ...itemsOn);
    expect(await thanksItemsOf(asAlice)).toEqual([]);
  });
});

function profilesOf(...people: Person[]): TeamPage["profiles"] {
  return people.map(({ name }) => {
    const [firstName, lastName] = name.split(" ") as [string, string];
    return { id: everyone.findIndex((someone) => someone.name === name) + 1, firstName, lastName, colour: "teal" };
  });
}

async function theCompanyCopyHolds(...teams: TeamPage[]) {
  postHogCom.withTeams(...teams);
  await syncTheCompanyCopy(t);
}

async function thanks(giver: Person, ...recipients: Person[]) {
  messages += 1;
  await t.time.advance(minuteMs);
  const ts = `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}`;
  await redeliver(giver, ts, ...recipients);
  return ts;
}

async function thanksWith(giver: Person, emojiName: string, recipient: Person) {
  messages += 1;
  await t.time.advance(minuteMs);
  await post(t, [section(text(`${why} `), mention(recipient.user), text(" "), emoji(emojiName))], { user: giver.user, ts: `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}` });
  await t.settle();
}

async function personPageOf(reader: Reader, of: Person): Promise<AlbumPersonAnswer> {
  const page = await reader.getAlbumPerson({ person: await memberOf(of) });
  if (page.kind !== "person") throw new Error(`expected a person page, got ${JSON.stringify(page)}`);
  return page;
}

async function redeliver(giver: Person, ts: string, ...recipients: Person[]) {
  await post(t, [section(text(`${why} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts });
  await t.settle();
}

function turn(reader: Reader, item: Id<"items">): Promise<TurnAnswer | Denial> {
  return reader.turnItem({ item });
}

async function turnTheSticker(reader: Reader, of: Person): Promise<Turned> {
  const turned = await turn(reader, await itemOf(alice, "sticker", of));
  if (turned.kind !== "turned") throw new Error(`expected the sticker turned, got ${JSON.stringify(turned)}`);
  return turned;
}

async function albumOf(reader: Reader): Promise<AlbumAnswer> {
  const album = await reader.getAlbum();
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album;
}

async function thanksItemsOf(reader: Reader) {
  const { board } = await albumOf(reader);
  if (board === undefined) throw new Error("expected the item board");
  return board.items.filter(({ reason }) => reason.kind === "thanks");
}

async function signedIn(someone: Person) {
  return (await aSignedInSession(t, someone)).asSignedIn;
}

function memberOf(someone: Person): Promise<MemberId> {
  return memberIn(t, someone);
}

// Today's `by_member_turned` index: a member's items, the face-down ones first, then by when each was turned.
async function itemsOf(giver: Person): Promise<Array<Doc<"items">>> {
  const member = await memberOf(giver);
  const items = (await t.seed.all("items")).filter((row) => row.member === member);
  return items.sort((one, other) => (one.turnedAt ?? -Infinity) - (other.turnedAt ?? -Infinity));
}

async function thanksItemsEarnedBy(giver: Person) {
  return (await itemsOf(giver)).flatMap(({ source, key, reason }) => (reason.kind === "thanks" ? [{ source, key, reason: { kind: reason.kind, person: reason.person } }] : []));
}

async function itemOf(giver: Person, source: Doc<"items">["source"], thanked: Person): Promise<Id<"items">> {
  const person = await memberOf(thanked);
  const item = (await itemsOf(giver)).find((row) => row.source === source && row.reason.kind === "thanks" && row.reason.person === person);
  if (item === undefined) throw new Error(`no ${source} item for thanking ${thanked.name}`);
  return item._id as Id<"items">;
}

// Today's `by_giver_recipient_week` index, first row.
async function packOf(giver: Person, recipient: Person) {
  const [member, someone] = [await memberOf(giver), await memberOf(recipient)];
  const packs = (await t.seed.all("thoughtfulPacks")).filter((row) => row.giver === member && row.recipient === someone);
  return packs.sort((one, other) => one.week.localeCompare(other.week))[0]!._id;
}

async function tiersRecordedAt(someone: Person, at: number) {
  const member = await memberOf(someone);
  const tiers = (await t.seed.all("milestoneTiers")).filter((tier) => tier.member === member);
  return tiers.filter((tier) => tier.at === at).map(({ milestone, tier }) => ({ milestone, tier }));
}

function kudosReceived(user: string) {
  return kudosReceivedIn(t, user);
}

function eventsNamed(name: string) {
  return t.postHog.productEvents().filter(({ event }) => event === name);
}

function everythingWritten() {
  return everythingWrittenIn(t);
}

async function aStickerTheHistoryBrought(member: Person, someone: Person) {
  const [memberId, personId] = [await memberOf(member), await memberOf(someone)];
  await t.seed.insert("albumStickers", { member: memberId, person: personId, from: "history", at: t.clock.now() } as never);
}
