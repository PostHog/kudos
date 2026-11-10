// The port of convex/album/items/achievementItems.test.ts: a filled team page and each milestone tier earn one hoggie the
// member does not own yet, at or above a floor, and achievement items wait unseen while their flags are off. Its setup
// joins the members through Slack's team_join (S3's handler, none registered yet) and syncs the company profiles (S12);
// each test thanks through Slack (S4) into a pack (S9, S10), signs in (S15) and turns on the website (S16), and its
// team pages and milestones are S10's and S9's.
import { afterEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { emoji, mention, section, text } from "../../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../../testing/waiting.ts";
import type { Id } from "../../db/columns.ts";
import type { Doc } from "../../db/schema/index.ts";
import type { AlbumAnswer, TurnAnswer } from "../../website/album.ts";
import type { Denial } from "../../website/memberQuery.ts";
import { catalogue, rarities, type Rarity } from "../hoggies/catalogue.ts";
import { drawOf } from "../hoggies/draw.ts";
import { recordMilestonesInWorkspace } from "../milestones.ts";
import {
  aDeploymentForWorkspace,
  aSignedInSession,
  memberChanged,
  memberOf,
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

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60_000;

const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const itemsOn = [...albumOpen, "hidden-items"];
const achievementsOn = [...itemsOn, "achievement-hoggies"];

type Turned = Extract<TurnAnswer, { kind: "turned" }>;
type HoggieTurned = Turned & { face: { kind: "hoggie" } };

const alice = person("Alice", "Marchetti");
const bob = person("Bob", "Okonkwo");
const carol = person("Carol", "Lindqvist");
const everyone = [alice, bob, carol];
const lanterns: TeamPage = { slug: "lanterns", name: "Lanterns", profiles: profilesOf(alice, bob, carol) };

// The members join through Slack (S3) and the company profiles sync (S12); a thanks in Slack (S4) grants a pack (S9,
// S10), turned on the website (S15, S16) into S10's team pages and S9's milestones.
const achieved: [Stack, ...Stack[]] = ["S3", "S4", "S9", "S10", "S12", "S15", "S16"];

const backend = useTestBackend({ now: tuesday, registry });
let t: TestBackend;
let postHogCom: FakePostHogCom;
let messages = 0;

async function setUp() {
  aDeploymentForWorkspace();
  t = backend();
  postHogCom = withPostHogCom(t);
  for (const { user, name } of everyone) t.slack.withMember(user, { profile: { display_name: name, real_name: name } });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(t, true, ...achievementsOn);
  for (const { user, name } of everyone) await memberChanged(t, "team_join", { id: user, team_id: "T1", name, real_name: name, profile: { real_name: name, display_name: name } });
  await t.settle();
  postHogCom.withTeams(lanterns);
  await syncTheCompanyCopy(t);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LP62 LP63: a filled team page earns one hoggie the member does not own, rare or rarer", { timeout: 60_000 }, () => {
  waitsOn(achieved, "filling the team earns one rare-floored item named for the team, and its turn draws a rare or rarer hoggie the member does not own yet", async () => {
    await setUp();
    const asAlice = await signedIn(alice);
    const usual = await drawOf({ secret: "", member: await memberOf(t, alice), crate: "team:lanterns", version: catalogue.version, floor: "rare" });
    await owns(alice, usual.hoggie);

    await fillsLanterns(asAlice);

    expect(await achievementItemsOf(alice)).toContainEqual({ key: "team:lanterns", floor: "rare", reason: { kind: "team", team: "lanterns", name: "Lanterns" } });
    const teamItem = (await boardOf(asAlice)).find(({ reason }) => reason.kind === "team");
    expect(teamItem?.reason).toEqual({ kind: "team", team: "lanterns", name: "Lanterns" });
    const turned = await turnHoggie(asAlice, teamItem!.item);
    expect(turned.face.drop.hoggie, "the hoggie the member already owns is never drawn again").not.toBe(usual.hoggie);
    expect(turned.face.drop.isNew).toBe(true);
    expect(rankOf(turned.face.drop.rarity)).toBeGreaterThanOrEqual(rankOf("rare"));
    expect(turned.applied).toBeNull();
  });
});

describe("LP62 LP63: each milestone tier earns one hoggie the member does not own, at or above its tier's floor", { timeout: 60_000 }, () => {
  waitsOn(achieved, "each tier the turn reaches earns one item with its tier's floor, and each turns into a hoggie the member does not own, at or above that floor", async () => {
    await setUp();
    await ownsEvery(alice, (hoggie) => hoggie.rarity === "common" || hoggie.rarity === "uncommon");
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);

    await turnTheSticker(asAlice, bob);

    const floors = Object.fromEntries((await achievementItemsOf(alice)).filter(({ key }) => key.startsWith("milestone:hoggies:")).map(({ key, floor }) => [key, floor]));
    expect(floors).toEqual({ "milestone:hoggies:bronze": "uncommon", "milestone:hoggies:silver": "rare", "milestone:hoggies:gold": "epic" });
    for (const [key, floor] of Object.entries(floors)) {
      const turned = await turnHoggie(asAlice, await itemKeyed(alice, key));
      expect(turned.face.drop.isNew, `${key} draws a hoggie the member does not own`).toBe(true);
      expect(rankOf(turned.face.drop.rarity), `${key} draws at or above ${floor}`).toBeGreaterThanOrEqual(rankOf(floor!));
    }
  });

  waitsOn(achieved, "a tier reached twice over earns its item once", async () => {
    await setUp();
    await ownsEvery(alice, (hoggie) => hoggie.rarity === "common");
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    await turnTheSticker(asAlice, bob);

    await t.run((ctx) => recordMilestonesInWorkspace(ctx, { workspace: "T1", cursor: null }));
    await t.settle();

    expect((await achievementItemsOf(alice)).filter(({ key }) => key === "milestone:hoggies:silver")).toHaveLength(1);
  });
});

describe("LP64: a reward whose floor and above the member owns whole draws a duplicate at or above its floor", { timeout: 60_000 }, () => {
  waitsOn(achieved, "with every hoggie owned, the gold tier's item draws an owned epic or legendary, and the diamond tier's an owned legendary", async () => {
    await setUp();
    await ownsEvery(alice, () => true);
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    await turnTheSticker(asAlice, bob);

    const gold = await turnHoggie(asAlice, await itemKeyed(alice, "milestone:hoggies:gold"));
    const diamond = await turnHoggie(asAlice, await itemKeyed(alice, "milestone:hoggies:diamond"));

    expect(gold.face.drop).toMatchObject({ isNew: false });
    expect(rankOf(gold.face.drop.rarity)).toBeGreaterThanOrEqual(rankOf("epic"));
    expect(diamond.face.drop).toMatchObject({ rarity: "legendary", isNew: false });
  });
});

describe("LP63: every other draw keeps its duplicates", { timeout: 60_000 }, () => {
  waitsOn(achieved, "a thanks item still draws the hoggie its crate key draws, owned or not", async () => {
    await setUp();
    await thanks(alice, bob);
    const crate = (await itemsOf(alice)).find(({ key }) => key.startsWith("thoughtful:"))!.key;
    const usual = await drawOf({ secret: "", member: await memberOf(t, alice), crate, version: catalogue.version });
    await owns(alice, usual.hoggie);
    const asAlice = await signedIn(alice);

    const turned = await turnHoggie(asAlice, await itemKeyed(alice, crate));

    expect(turned.face.drop).toMatchObject({ hoggie: usual.hoggie, isNew: false });
  });
});

describe("LP65: achievement items wait unseen while achievement-hoggies or hidden-items is off, and nothing is lost", { timeout: 60_000 }, () => {
  waitsOn(achieved, "with achievement-hoggies off the filled team's item is earned but neither shown nor turned, and it shows once the flag turns on", async () => {
    await setUp();
    await switchWebsite(t, true, ...itemsOn);
    const asAlice = await signedIn(alice);
    await fillsLanterns(asAlice);
    const item = await itemKeyed(alice, "team:lanterns");

    expect((await boardOf(asAlice)).map(({ reason }) => reason.kind)).not.toContain("team");
    expect((await boardOf(asAlice)).map(({ reason }) => reason.kind)).not.toContain("milestone");
    expect(await turn(asAlice, item)).toEqual({ kind: "refused" });
    expect(await dropsOf(alice, "team:lanterns")).toEqual([]);

    await switchWebsite(t, true, ...achievementsOn);
    expect((await boardOf(asAlice)).filter(({ item: shown }) => shown === item)).toHaveLength(1);
    expect(await turn(asAlice, item)).toMatchObject({ kind: "turned", again: false });
  });

  waitsOn(achieved, "with hidden-items off the old unlock earns the filled team's item, which waits face down until the flag turns back on", async () => {
    await setUp();
    await switchWebsite(t, true, ...albumOpen, "achievement-hoggies");
    await thanks(alice, bob, carol);
    const asAlice = await signedIn(alice);
    for (const { pack } of (await albumOf(asAlice)).packs) await asAlice.openThoughtfulPack({ pack });
    await asAlice.putAllIn();
    await asAlice.unlockTeamSticker({ team: "lanterns" });

    expect(await achievementItemsOf(alice)).toContainEqual({ key: "team:lanterns", floor: "rare", reason: { kind: "team", team: "lanterns", name: "Lanterns" } });
    expect(await dropsOf(alice, "team:lanterns")).toEqual([]);

    await switchWebsite(t, true, ...achievementsOn);
    const teamItem = (await boardOf(asAlice)).find(({ reason }) => reason.kind === "team");
    expect(await turnHoggie(asAlice, teamItem!.item)).toMatchObject({ face: { drop: { isNew: true } } });
  });

  waitsOn(achieved, "an item waiting when achievement-hoggies turns back off waits on, undrawn, and shows once when it turns on again", async () => {
    await setUp();
    const asAlice = await signedIn(alice);
    await fillsLanterns(asAlice);
    const item = await itemKeyed(alice, "team:lanterns");

    await switchWebsite(t, true, ...itemsOn);
    expect((await boardOf(asAlice)).map(({ item: shown }) => shown)).not.toContain(item);
    await switchWebsite(t, true, ...achievementsOn);

    expect((await boardOf(asAlice)).filter(({ item: shown }) => shown === item)).toHaveLength(1);
    expect(await dropsOf(alice, "team:lanterns")).toEqual([]);
  });
});


function profilesOf(...people: Person[]): TeamPage["profiles"] {
  return people.map(({ name }) => {
    const [firstName, lastName] = name.split(" ") as [string, string];
    return { id: everyone.findIndex((someone) => someone.name === name) + 1, firstName, lastName, colour: "teal" };
  });
}

function rankOf(rarity: Rarity) {
  return rarities.findIndex((listed) => listed.rarity === rarity);
}

async function fillsLanterns(asAlice: Reader) {
  await thanks(alice, bob, carol);
  await turnTheSticker(asAlice, bob);
  await turnTheSticker(asAlice, carol);
}

async function thanks(giver: Person, ...recipients: Person[]) {
  messages += 1;
  t.time.advance(minuteMs);
  const ts = `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}`;
  await post(t, [section(text(`${why} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts });
  await t.settle();
}

async function owns(someone: Person, hoggie: string) {
  const member = await memberOf(t, someone);
  await t.seed.insert("hoggieTallies", { member, hoggie, count: 1, firstAt: t.clock.now(), firstN: 1 });
}

async function ownsEvery(someone: Person, which: (hoggie: (typeof catalogue.hoggies)[number]) => boolean) {
  for (const { hoggie } of catalogue.hoggies.filter(which)) await owns(someone, hoggie);
}

async function signedIn(person: Person) {
  return (await aSignedInSession(t, person)).asSignedIn;
}

function turn(reader: Reader, item: Id<"items">): Promise<TurnAnswer | Denial> {
  return reader.turnItem({ item });
}

async function turnHoggie(reader: Reader, item: Id<"items">): Promise<HoggieTurned> {
  const turned = await turn(reader, item);
  if (turned.kind !== "turned" || turned.face.kind !== "hoggie") throw new Error(`expected a hoggie turned, got ${JSON.stringify(turned)}`);
  return turned as HoggieTurned;
}

async function turnTheSticker(reader: Reader, of: Person): Promise<Turned> {
  const person = await memberOf(t, of);
  const item = (await itemsOf(alice)).find((row) => row.source === "sticker" && row.reason.kind === "thanks" && row.reason.person === person);
  const turned = await turn(reader, item!._id);
  if (turned.kind !== "turned") throw new Error(`expected the sticker turned, got ${JSON.stringify(turned)}`);
  return turned;
}

async function albumOf(reader: Reader): Promise<AlbumAnswer> {
  const album = await reader.getAlbum();
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album as AlbumAnswer;
}

async function boardOf(reader: Reader) {
  const { board } = await albumOf(reader);
  if (board === undefined) throw new Error("expected the item board");
  return board.items;
}

// `items.by_member_turned` for the member: waiting ones first, then by when each was earned and written.
async function itemsOf(someone: Person): Promise<Doc<"items">[]> {
  const member = await memberOf(t, someone);
  return (await t.seed.all("items"))
    .filter((row) => row.member === member)
    .sort((a, b) => (a.turnedAt ?? -Infinity) - (b.turnedAt ?? -Infinity) || a.earnedAt - b.earnedAt || a._creationTime - b._creationTime);
}

async function achievementItemsOf(someone: Person) {
  return (await itemsOf(someone)).flatMap(({ key, floor, reason }) => (reason.kind === "team" || reason.kind === "milestone" ? [{ key, floor, reason }] : []));
}

async function itemKeyed(someone: Person, key: string): Promise<Id<"items">> {
  const item = (await itemsOf(someone)).find((row) => row.key === key);
  if (item === undefined) throw new Error(`no item keyed ${key}`);
  return item._id;
}

async function dropsOf(someone: Person, crate: string) {
  const member = await memberOf(t, someone);
  return (await t.seed.all("drops")).filter((row) => row.member === member && row.crate === crate);
}
