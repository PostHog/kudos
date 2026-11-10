// The port of convex/album/items/levelUpItems.test.ts: a level up earns its three hoggies as items, each drawn at its
// turn within its floor, cap and weights, and fillItems reveals waiting level items through the old drop once
// hidden-items is off. A kudos in Slack reaches S4's message handler (none is registered yet) and S6's progression; a
// level reached reaches S6's unlocks and S10's level-up hoggies; the board, the turn and the level-up reveal are S16's
// website reads behind S15's sign-in; a turn's drop is S10's; fillItems pages through S11's `paginate`, now on main.
import { afterEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { emoji, mention, section } from "../../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../../testing/waiting.ts";
import type { Id } from "../../db/columns.ts";
import type { AlbumAnswer, TurnAnswer } from "../../website/album.ts";
import type { Denial } from "../../website/memberQuery.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { catalogue, hoggiesOfRarity, type Rarity } from "../hoggies/catalogue.ts";
import { drawOf } from "../hoggies/draw.ts";
import { earnLevelUpHoggies } from "../levelUpHoggies.ts";
import { fillItems as fillItemsBody } from "./fill.ts";
import { earnItem } from "./ledger.ts";
import { aDeploymentForWorkspace, aMember, aSignedInSession, memberOf, post, reachesLevel as reachesLevelIn, registry, switchWebsite, type Person, type Reader } from "../albumPorts.testing.ts";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const oldReveal = ["xp-levels", "album", "collection", "packs", "level-up-reveal"];
const itemsOn = [...oldReveal, "hidden-items"];
const rareOrRarer: Rarity[] = ["rare", "epic", "legendary"];
const slots: ReadonlyArray<{ slot: number; floor?: Rarity }> = [{ slot: 1 }, { slot: 2 }, { slot: 3, floor: "rare" }];

// A kudos in Slack (S4) that levels the giver up (S6, S10), read on the website (S15, S16).
const leveledInSlack: [Stack, ...Stack[]] = ["S4", "S6", "S10", "S15", "S16"];
// A level reached (S6's unlocks, S10's level-up hoggies), read and turned on the website (S15, S16).
const reached: [Stack, ...Stack[]] = ["S6", "S10", "S15", "S16"];
// Items earned straight into the ledger, turned on the website (S15, S16) into S10's drops.
const earned: [Stack, ...Stack[]] = ["S10", "S15", "S16"];
// A level reached, then filled into S10's old reveal, read on the website.
const filled: [Stack, ...Stack[]] = ["S6", "S10", "S15", "S16"];

const backend = useTestBackend({ now: tuesday, registry });
let t: TestBackend;
let messages = 0;

async function setUp() {
  aDeploymentForWorkspace();
  t = backend();
  for (const person of [alice, bob]) t.slack.withMember(person.user, { real_name: person.name });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 });
  await switchWebsite(t, true, ...itemsOn);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LP6 LP7: a level up earns its three hoggies as items", { timeout: 60_000 }, () => {
  waitsOn(leveledInSlack, "with hidden-items on, a kudos that takes the giver to level 2 earns three items keyed by the level's slots, the third with a rare floor, each naming its level on the board, and drops nothing", async () => {
    await setUp();
    await kudos(alice, bob, 2);
    const asAlice = await signedIn(alice);

    expect(await levelUpItemsOf(alice), "the giver's stored level-up items").toEqual([
      { source: "hoggie", key: "level:2:1", reason: { kind: "levelUp", level: 2 } },
      { source: "hoggie", key: "level:2:2", reason: { kind: "levelUp", level: 2 } },
      { source: "hoggie", key: "level:2:3", floor: "rare", reason: { kind: "levelUp", level: 2 } },
    ]);
    expect(levelUpItemsOn(await boardOf(asAlice)).map(({ reason }) => reason), "the board's level-up reasons").toEqual(Array.from({ length: 3 }, () => ({ kind: "levelUp", level: 2 })));
    expect(await cratesDroppedFor(alice), "the level up's drops").toEqual([]);
    expect(await foundHoggiesOf(asAlice), "the hoggies found").toEqual([]);
  });

  waitsOn(["S6", "S10"], "each level reached earns its own three, and a replayed level up earns nothing more", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));

    await reachesLevel(member, 2);
    await reachesLevel(member, 3);
    await reachesLevel(member, 3);

    expect((await itemsOf(alice)).map(({ key }) => key)).toEqual(["level:2:1", "level:2:2", "level:2:3", "level:3:1", "level:3:2", "level:3:3"]);
  });

  waitsOn(earned, "Album's follower of levelReached, delivered the same level twice, earns the level's three items once", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    const event = levelReachedOf(member, 2);

    await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
    await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));

    expect((await boardOf(await signedIn(alice))).items.map(({ reason }) => reason), "the board after two deliveries").toEqual(Array.from({ length: 3 }, () => ({ kind: "levelUp", level: 2 })));
  });

  waitsOn(leveledInSlack, "with hidden-items off, the level up drops its three as today and marks their items turned, so none waits once hidden-items turns on", async () => {
    await setUp();
    await switchWebsite(t, true, ...oldReveal);
    await kudos(alice, bob, 2);

    expect(await cratesDroppedFor(alice), "the level up's drops").toEqual(["level:2:1", "level:2:2", "level:2:3"]);
    await switchWebsite(t, true, ...itemsOn);
    expect(levelUpItemsOn(await boardOf(await signedIn(alice)))).toEqual([]);
  });

  waitsOn(leveledInSlack, "with hidden-items and level-up-reveal off, nothing drops and the three items wait on the board once hidden-items turns on", async () => {
    await setUp();
    await switchWebsite(t, true, ...oldReveal.filter((flag) => flag !== "level-up-reveal"));
    await kudos(alice, bob, 2);

    expect(await cratesDroppedFor(alice), "the level up's drops").toEqual([]);
    await switchWebsite(t, true, ...itemsOn);
    expect(levelUpItemsOn(await boardOf(await signedIn(alice))).map(({ reason }) => reason)).toEqual(Array.from({ length: 3 }, () => ({ kind: "levelUp", level: 2 })));
  });
});

describe("LP11 LP20: a level item is drawn at its turn, pays no XP, and the third never draws below rare", { timeout: 120_000 }, () => {
  waitsOn(reached, "turning a level's three items draws each from its own crate, the third with the rare floor, and applies nothing", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    await reachesLevel(member, 3);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level;

    const turned = [];
    for (const { item } of (await boardOf(asAlice)).items) turned.push(await turn(asAlice, item));
    await t.settle();

    const drawn = await Promise.all(slots.map(({ slot, floor }) => drawnFor(member, `level:3:${slot}`, floor)));
    expect(turned.map((answer) => answer.kind === "turned" && { hoggie: hoggieDrawnBy(answer)?.hoggie, rarity: hoggieDrawnBy(answer)?.rarity, applied: answer.applied })).toEqual(drawn.map(({ hoggie, rarity }) => ({ hoggie, rarity, applied: null })));
    expect((await albumOf(asAlice)).level, "the member's level and XP").toEqual(before);
    expect((await boardOf(asAlice)).items).toEqual([]);
  });

  waitsOn(reached, "over twenty level ups, every third item turns rare or rarer", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    for (let level = 2; level <= 21; level++) await reachesLevel(member, level);
    const asAlice = await signedIn(alice);

    const thirds = await itemsKeyed(alice, (key) => key.endsWith(":3"));
    expect(thirds).toHaveLength(20);
    for (const { _id, key } of thirds) {
      const answer = await turn(asAlice, _id);
      expect(rareOrRarer.includes(hoggieDrawnBy(answer)?.rarity ?? "common"), `${key}'s turned rarity`).toBe(true);
    }
  });
});

describe("HH39: the turn draws within the floor, cap and weights its item stored", { timeout: 120_000 }, () => {
  waitsOn(earned, "twenty items stored exactly rare with base weights each turn rare, drawn as the draw answers for that floor and cap", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    const keys = Array.from({ length: 20 }, (_, n) => `level:${n + 2}:1`);
    await t.run(async (ctx) => {
      for (const [n, key] of keys.entries()) await earnItem(ctx, { workspace: "T1", member, source: "hoggie", key, floor: "rare", cap: "rare", weights: "base", reason: { kind: "levelUp", level: n + 2 }, earnedAt: t.clock.now() });
    });
    const asAlice = await signedIn(alice);

    const turned = [];
    for (const { item } of (await boardOf(asAlice)).items) turned.push(hoggieDrawnBy(await turn(asAlice, item)));

    const drawn = await Promise.all(keys.map((crate) => drawOf({ secret: process.env.HOGGIE_DRAW_SECRET ?? "", member, crate, version: catalogue.version, floor: "rare", cap: "rare", weights: "base" })));
    expect(turned.map((drop) => drop && { hoggie: drop.hoggie, rarity: drop.rarity }), "the turned faces").toEqual(drawn);
    expect(new Set(turned.map((drop) => drop?.rarity)), "the rarities turned").toEqual(new Set(["rare"]));
  });

  waitsOn(earned, "HH41: twenty items stored with the kudos weights, as rarity-caps stores a kudos pack's item, each turn as the kudos-weighted draw answers", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    const keys = Array.from({ length: 20 }, (_, n) => `level:${n + 2}:1`);
    await t.run(async (ctx) => {
      for (const [n, key] of keys.entries()) await earnItem(ctx, { workspace: "T1", member, source: "hoggie", key, weights: "kudos", reason: { kind: "levelUp", level: n + 2 }, earnedAt: t.clock.now() });
    });
    const asAlice = await signedIn(alice);

    const turned = [];
    for (const { item } of (await boardOf(asAlice)).items) turned.push(hoggieDrawnBy(await turn(asAlice, item)));

    const drawn = await Promise.all(keys.map((crate) => drawOf({ secret: process.env.HOGGIE_DRAW_SECRET ?? "", member, crate, version: catalogue.version, weights: "kudos" })));
    expect(turned.map((drop) => drop && { hoggie: drop.hoggie, rarity: drop.rarity }), "the turned faces").toEqual(drawn);
  });

  waitsOn(earned, "HH40 HH42: a team item with named weights turned by a member who owns every rare can still turn rare, while one without them skips rare as before", async () => {
    await setUp();
    await switchWebsite(t, true, ...itemsOn, "achievement-hoggies");
    const member = await memberOf(t, await joined(alice));
    const everyRare = await ownsEveryRare(member);
    const named = await firstTeamCrateDrawingRare(member, everyRare);
    await t.run(async (ctx) => {
      await earnItem(ctx, { workspace: "T1", member, source: "hoggie", key: named, floor: "rare", weights: "base", reason: { kind: "team", team: named.slice("team:".length), name: "Named" }, earnedAt: t.clock.now() });
      await earnItem(ctx, { workspace: "T1", member, source: "hoggie", key: "team:legacy", floor: "rare", reason: { kind: "team", team: "legacy", name: "Legacy" }, earnedAt: t.clock.now() });
    });
    const asAlice = await signedIn(alice);

    const faces = new Map<string, { hoggie: string; rarity: Rarity } | null>();
    for (const { item } of (await boardOf(asAlice)).items) {
      const key = (await t.seed.get("items", item))!.key;
      const drop = hoggieDrawnBy(await turn(asAlice, item));
      faces.set(key, drop && { hoggie: drop.hoggie, rarity: drop.rarity });
    }

    const drawn = (crate: string, weights?: "base") => drawOf({ secret: process.env.HOGGIE_DRAW_SECRET ?? "", member, crate, version: catalogue.version, floor: "rare", weights, owned: everyRare });
    expect(faces.get(named), "the named-weights item's face").toEqual(await drawn(named, "base"));
    expect(faces.get(named)?.rarity, "the named-weights item's rarity").toBe("rare");
    expect(faces.get("team:legacy"), "the legacy item's face").toEqual(await drawn("team:legacy"));
    expect(faces.get("team:legacy")?.rarity, "the legacy item's rarity").not.toBe("rare");
  });
});

async function ownsEveryRare(member: MemberId): Promise<Set<string>> {
  const rares = hoggiesOfRarity("rare").map(({ hoggie }) => hoggie);
  for (const [n, hoggie] of rares.entries()) await t.seed.insert("hoggieTallies", { member, hoggie, count: 1, firstAt: t.clock.now(), firstN: n + 1 });
  return new Set(rares);
}

async function firstTeamCrateDrawingRare(member: MemberId, owned: Set<string>): Promise<string> {
  for (let n = 0; ; n++) {
    const crate = `team:named-${n}`;
    const { rarity } = await drawOf({ secret: process.env.HOGGIE_DRAW_SECRET ?? "", member, crate, version: catalogue.version, floor: "rare", weights: "base", owned });
    if (rarity === "rare") return crate;
  }
}

describe("LP6 LP24: with hidden-items back off, fillItems reveals every waiting level item through the old level-up drop, once", { timeout: 60_000 }, () => {
  waitsOn(filled, "a level reached with hidden-items on reaches the old reveal once it is off, pays nothing, a rerun drops nothing more, and with hidden-items on again nothing waits or draws twice", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    await reachesLevel(member, 2);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level;
    await fillItems();
    expect((await boardOf(asAlice)).items, "the board after a fill with hidden-items still on").toHaveLength(3);

    await switchWebsite(t, true, ...oldReveal);
    await fillItems();
    await fillItems();

    expect(await revealedHoggiesOf(asAlice, 2), "the old reveal of level 2").toEqual(await levelDrawnFor(member, 2));
    expect(await cratesDroppedFor(alice), "the drops").toEqual(["level:2:1", "level:2:2", "level:2:3"]);
    await switchWebsite(t, true, ...itemsOn);
    expect((await boardOf(asAlice)).items, "the board once hidden-items is on again").toEqual([]);
    expect((await albumOf(asAlice)).level, "the member's level and XP").toEqual(before);
    expect(await cratesDroppedFor(alice), "the drops once hidden-items is on again").toHaveLength(3);
  });

  waitsOn(filled, "a level item turned while hidden-items was on keeps its face, and only the two still waiting drop once it is off", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    await reachesLevel(member, 2);
    const asAlice = await signedIn(alice);
    const [first] = (await boardOf(asAlice)).items;
    await turn(asAlice, first!.item);

    await switchWebsite(t, true, ...oldReveal);
    await fillItems();

    expect(await revealedHoggiesOf(asAlice, 2), "the old reveal of level 2").toEqual(await levelDrawnFor(member, 2));
    expect(await cratesDroppedFor(alice), "the drops").toHaveLength(3);
  });

  waitsOn(filled, "more than 100 waiting level items continue from the fill's cursor, each level revealed once", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    for (let level = 2; level <= 36; level++) await reachesLevel(member, level);

    await switchWebsite(t, true, ...oldReveal);
    await fillItems();
    const asAlice = await signedIn(alice);

    expect(await cratesDroppedFor(alice), "the drops").toHaveLength(105);
    expect(await revealedHoggiesOf(asAlice, 36), "the old reveal of the last level").toEqual(await levelDrawnFor(member, 36));
    await switchWebsite(t, true, ...itemsOn);
    expect((await boardOf(asAlice)).items, "the board once hidden-items is on again").toEqual([]);
  });

  waitsOn(filled, "with hidden-items and level-up-reveal off, fillItems drops nothing and the level's items keep waiting, as today", async () => {
    await setUp();
    const member = await memberOf(t, await joined(alice));
    await reachesLevel(member, 2);

    await switchWebsite(t, true, ...oldReveal.filter((flag) => flag !== "level-up-reveal"));
    await fillItems();

    expect(await cratesDroppedFor(alice), "the drops").toEqual([]);
    await switchWebsite(t, true, ...itemsOn);
    expect((await boardOf(await signedIn(alice))).items.map(({ reason }) => reason), "the board once hidden-items turns on").toEqual(Array.from({ length: 3 }, () => ({ kind: "levelUp", level: 2 })));
  });
});

function levelReachedOf(member: MemberId, level: number) {
  return { type: "levelReached" as const, workspace: "T1", member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, at: t.clock.now() };
}

function reachesLevel(member: MemberId, level: number) {
  return reachesLevelIn(t, member, level);
}

function hoggieDrawnBy(answer: TurnAnswer | Denial) {
  return answer.kind === "turned" && answer.face.kind === "hoggie" ? answer.face.drop : null;
}

async function kudos(giver: Person, recipient: Person, count: number) {
  messages += 1;
  t.time.advance(minuteMs);
  const ts = `${Math.floor(t.clock.now() / 1000)}.${String(messages).padStart(6, "0")}`;
  await post(t, [section(mention(recipient.user), ...Array.from({ length: count }, () => emoji("taco")))], { user: giver.user, ts });
  await t.settle();
}

async function joined(person: Person) {
  await aMember(t, person.user);
  return person;
}

async function signedIn(person: Person) {
  return (await aSignedInSession(t, person)).asSignedIn;
}

function turn(reader: Reader, item: Id<"items">): Promise<TurnAnswer | Denial> {
  return reader.turnItem({ item });
}

async function albumOf(reader: Reader): Promise<AlbumAnswer> {
  const album = await reader.getAlbum();
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album as AlbumAnswer;
}

async function boardOf(reader: Reader) {
  const { board } = await albumOf(reader);
  if (board === undefined) throw new Error("expected the item board");
  return board;
}

async function foundHoggiesOf(reader: Reader) {
  const answer = await reader.getAlbumHoggies();
  return answer.kind === "hoggies" ? answer.hoggies.filter(({ found }) => found).map(({ hoggie }) => hoggie) : [];
}

// `items.by_member_source_key` for the member: by source, then key, then when each was written.
async function itemsKeyed(person: Person, wanted: (key: string) => boolean) {
  const member = await memberOf(t, person);
  const items = (await t.seed.all("items"))
    .filter((row) => row.member === member)
    .sort((a, b) => a.source.localeCompare(b.source) || compare(a.key, b.key) || a._creationTime - b._creationTime);
  return items.filter(({ key }) => wanted(key));
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function levelUpItemsOn(board: Awaited<ReturnType<typeof boardOf>>) {
  return board.items.filter(({ reason }) => reason.kind === "levelUp");
}

async function levelUpItemsOf(person: Person) {
  return (await itemsOf(person)).filter(({ reason }) => reason.kind === "levelUp");
}

async function itemsOf(person: Person) {
  return (await itemsKeyed(person, () => true)).map(({ source, key, floor, reason }) => ({ source, key, reason, ...(floor && { floor }) }));
}

async function cratesDroppedFor(person: Person) {
  const member = await memberOf(t, person);
  return (await t.seed.all("drops")).filter((row) => row.member === member).map(({ crate }) => crate);
}

async function fillItems() {
  await t.run((ctx) => fillItemsBody(ctx, {}));
  await t.settle();
}

async function revealedHoggiesOf(reader: Reader, level: number) {
  const answer = await reader.getLevelUp({ level });
  return answer.kind === "levelUp" ? answer.hoggies.map(({ hoggie }) => hoggie) : answer.kind;
}

async function levelDrawnFor(member: MemberId, level: number) {
  return Promise.all(slots.map(async ({ slot, floor }) => (await drawnFor(member, `level:${level}:${slot}`, floor)).hoggie));
}

async function drawnFor(member: MemberId, crate: string, floor?: Rarity) {
  return drawOf({ secret: process.env.HOGGIE_DRAW_SECRET ?? "", member, crate, version: catalogue.version, floor });
}
