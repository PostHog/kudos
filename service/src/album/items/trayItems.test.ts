// convex/album/items/trayItems.test.ts on the service: the tray beside hidden items, from a thanks in Slack through the
// website's open, put-in, put-all-in and turn, and the fill that earns the items of packs and trays from before the
// ledger. Each test has its members join in its body, so a step that reaches a stub keeps the test waiting.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { emoji, mention, section, text } from "../../../testing/slackMessages.ts";
import { waitsOn } from "../../../testing/waiting.ts";
import type { Id } from "../../db/columns.ts";
import type { Doc } from "../../db/schema/index.ts";
import type { AlbumAnswer, TurnAnswer } from "../../website/album.ts";
import type { Denial } from "../../website/memberQuery.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { aDeploymentForWorkspace, aSignedInSession, everythingWritten as everythingWrittenIn, memberChanged, memberOf as memberIn, post, registry, switchWebsite, type Person, type Reader } from "../albumPorts.testing.ts";
import { fillItems as fillItemsOnce } from "./fill.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const itemsOn = [...albumOpen, "hidden-items"];

type Turned = Extract<TurnAnswer, { kind: "turned" }>;

const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist" };
const everyone = [alice, bob, carol];

// The stacks every test here reaches: S3 and S4 take the members' joining and the thanks in Slack in, S15 signs the
// member in and S16 serves the album's commands; S9 and S10 hold the bodies an open, a put-in and a turn reach.
const theTrayPath = ["S3", "S4", "S9", "S10", "S15", "S16"] as const;

const backend = useTestBackend({ now: tuesday.getTime(), registry });
let t: TestBackend;
let messages = 0;

beforeEach(async () => {
  aDeploymentForWorkspace();
  t = backend();
  for (const { user, name } of everyone) t.slack.withMember(user, { real_name: name });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 } as never);
  await switchWebsite(t, true, ...albumOpen);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Today's `beforeEach` had everyone join; a join reaches S3 and S4, so each test does it first in its body.
async function everyoneJoins() {
  for (const { user, name } of everyone) await memberChanged(t, "team_join", { id: user, team_id: "T1", name, real_name: name });
  await t.settle();
}

describe("LP23: with hidden-items on, the open, put-in and put-all-in refuse and write nothing", { timeout: 60_000 }, () => {
  waitsOn(theTrayPath, "each refuses with the flag on, writing nothing, and works as today once it is off", async () => {
    await everyoneJoins();
    await thanks(alice, bob, carol);
    const asAlice = await signedIn(alice);
    const [first, second] = (await albumOf(asAlice)).packs;
    await asAlice.openThoughtfulPack({ pack: first!.pack });
    const [inTheTray] = (await albumOf(asAlice)).tray;
    await switchWebsite(t, true, ...itemsOn);
    const before = await everythingWritten();

    expect(await asAlice.openThoughtfulPack({ pack: second!.pack })).toEqual({ kind: "refused" });
    expect(await asAlice.putIn({ item: inTheTray!.item })).toEqual({ kind: "refused" });
    expect(await asAlice.putAllIn()).toEqual({ kind: "refused" });
    expect(await everythingWritten()).toEqual(before);

    await switchWebsite(t, true, ...albumOpen);
    expect(await asAlice.putIn({ item: inTheTray!.item })).toMatchObject({ kind: "placed", item: { item: inTheTray!.item } });
    expect(await asAlice.openThoughtfulPack({ pack: second!.pack })).toMatchObject({ kind: "opened", items: [{ kind: "sticker" }, { kind: "hoggie" }] });
    expect(await asAlice.putAllIn()).toMatchObject({ kind: "placed", items: [{}, {}, {}], more: false });
  });
});

describe("LP23: a tray item not yet put in waits face down, and its turn finishes today's put-in", { timeout: 60_000 }, () => {
  waitsOn(theTrayPath, "the tray's sticker and hoggie wait on the board for thanking their person, and their turns put them in from the tray's drop, paying no second XP", async () => {
    await everyoneJoins();
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const opened = await asAlice.openThoughtfulPack({ pack: (await albumOf(asAlice)).packs[0]!.pack });
    const trayHoggie = opened.kind === "opened" ? (opened.items as AlbumAnswer["tray"]).find((item) => item.kind === "hoggie") : undefined;
    await switchWebsite(t, true, ...itemsOn);
    const xp = (await albumOf(asAlice)).level.xp;
    const dropsBefore = (await everythingWritten()).tables.drops;

    const waiting = await thanksItemsOf(asAlice);
    expect(waiting.map(({ reason }) => reason.kind === "thanks" && reason.thanked.name)).toEqual([bob.name, bob.name]);
    const turned: Turned[] = [];
    for (const { item } of waiting) turned.push(await turnOf(asAlice, item));

    expect(turned.map(({ face }) => face.kind).sort()).toEqual(["hoggie", "sticker"]);
    expect(turned.find(({ face }) => face.kind === "hoggie")).toMatchObject({ face: { drop: { hoggie: trayHoggie?.kind === "hoggie" && trayHoggie.hoggie } }, applied: null, page: { kind: "hoggies" } });
    expect(turned.find(({ face }) => face.kind === "sticker")).toMatchObject({ face: { person: await memberOf(bob), isNew: true }, applied: null });
    expect((await albumOf(asAlice)).level.xp).toBe(xp);
    expect(await thanksItemsOf(asAlice)).toEqual([]);
    expect((await everythingWritten()).tables.drops).toEqual(dropsBefore);
    expect(await foundHoggiesOf(asAlice)).toEqual([trayHoggie?.kind === "hoggie" && trayHoggie.hoggie]);
    expect((await albumOf(asAlice)).people).toContainEqual(expect.objectContaining({ person: await memberOf(bob), held: true }));
    await switchWebsite(t, true, ...albumOpen);
    expect((await albumOf(asAlice)).tray).toEqual([]);
  });

  waitsOn(theTrayPath, "a tray hoggie put in while hidden-items is off no longer waits once it turns on", async () => {
    await everyoneJoins();
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    await asAlice.openThoughtfulPack({ pack: (await albumOf(asAlice)).packs[0]!.pack });
    await asAlice.putAllIn();

    await switchWebsite(t, true, ...itemsOn);

    expect(await thanksItemsOf(asAlice)).toEqual([]);
  });
});

describe("LP23: a flag reversal never counts anything twice", { timeout: 60_000 }, () => {
  waitsOn(theTrayPath, "items turned with hidden-items on leave no pack to open once it is off, so the hoggie is found once and paid once", async () => {
    await everyoneJoins();
    await switchWebsite(t, true, ...itemsOn);
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    for (const { item } of await thanksItemsOf(asAlice)) await turnOf(asAlice, item);
    const xp = (await albumOf(asAlice)).level.xp;
    const found = await hoggiesTalliedFor(alice);

    await switchWebsite(t, true, ...albumOpen);
    await asAlice.putAllIn();

    expect((await albumOf(asAlice)).packs).toEqual([]);
    expect(await hoggiesTalliedFor(alice)).toEqual(found);
    expect((await albumOf(asAlice)).level.xp).toBe(xp);
  });

  waitsOn(theTrayPath, "a pack whose hoggie turned with hidden-items on opens into only its sticker once it is off, and the hoggie is found once", async () => {
    await everyoneJoins();
    await switchWebsite(t, true, ...itemsOn);
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const [hoggie] = await thanksItemsOf(asAlice);
    await turnOf(asAlice, hoggie!.item);
    const found = await hoggiesTalliedFor(alice);

    await switchWebsite(t, true, ...albumOpen);
    const opened = await asAlice.openThoughtfulPack({ pack: (await albumOf(asAlice)).packs[0]!.pack });
    await asAlice.putAllIn();

    expect(opened).toMatchObject({ kind: "opened", items: [{ kind: "sticker" }], applied: null });
    expect(await hoggiesTalliedFor(alice)).toEqual(found);
  });

  waitsOn(theTrayPath, "a tray hoggie turned with hidden-items on leaves only its sticker in the tray once the flag is off, and the hoggie is found once", async () => {
    await everyoneJoins();
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    await asAlice.openThoughtfulPack({ pack: (await albumOf(asAlice)).packs[0]!.pack });
    await switchWebsite(t, true, ...itemsOn);
    const hoggie = await trayHoggieItemOf(alice);
    await turnOf(asAlice, hoggie);
    const found = await hoggiesTalliedFor(alice);

    await switchWebsite(t, true, ...albumOpen);
    expect((await albumOf(asAlice)).tray.map(({ kind }) => kind)).toEqual(["sticker"]);
    await asAlice.putAllIn();

    expect(await hoggiesTalliedFor(alice)).toEqual(found);
  });
});

describe("LP24: fillItems earns every pack not yet opened and every tray item not yet put in, once", { timeout: 60_000 }, () => {
  waitsOn([...theTrayPath, "S11"], "the packs and tray of a member from before the ledger wait on the board after the fill, and a rerun earns nothing", async () => {
    await everyoneJoins();
    await thanks(alice, bob, carol);
    const asAlice = await signedIn(alice);
    const opening = (await albumOf(asAlice)).packs[0]!;
    await asAlice.openThoughtfulPack({ pack: opening.pack });
    await everyItemForgotten();

    await fillItems();
    const filled = await everythingWritten();
    await fillItems();

    await switchWebsite(t, true, ...itemsOn);
    const board = await thanksItemsOf(asAlice);
    expect(board.map(({ reason }) => reason.kind === "thanks" && reason.thanked.name).sort()).toEqual([bob.name, bob.name, carol.name, carol.name]);
    expect((await everythingWritten()).tables.items).toEqual(filled.tables.items);
    for (const { item } of board) await turnOf(asAlice, item);
    expect(await thanksItemsOf(asAlice)).toEqual([]);
  });

  waitsOn(["S3", "S4", "S11"], "a member with more than 100 packs and 100 tray items continues in the next mutation, one member a mutation", async () => {
    await everyoneJoins();
    const [giver, other] = [await memberOf(alice), await memberOf(bob)];
    await waitingRowsFor(giver, 101);
    await waitingRowsFor(other, 1);

    await t.run((ctx) => fillItemsOnce(ctx, {}));
    expect(await itemCountsOf(giver, other)).toEqual([100, 0]);
    await t.settle();

    expect(await itemCountsOf(giver, other)).toEqual([202, 2]);
  });
});

async function thanks(giver: Person, ...recipients: Person[]) {
  messages += 1;
  await t.time.advance(minuteMs);
  const ts = `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}`;
  await post(t, [section(text(`${why} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts });
  await t.settle();
}

async function fillItems() {
  await t.run((ctx) => fillItemsOnce(ctx, {}));
  await t.settle();
}

async function turnOf(reader: Reader, item: Id<"items">): Promise<Turned> {
  const answer: TurnAnswer | Denial = await reader.turnItem({ item });
  if (answer.kind !== "turned") throw new Error(`expected the item turned, got ${JSON.stringify(answer)}`);
  return answer;
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

async function foundHoggiesOf(reader: Reader) {
  const answer = await reader.getAlbumHoggies();
  return answer.kind === "hoggies" ? answer.hoggies.filter(({ found }) => found).map(({ hoggie }) => hoggie) : [];
}

async function signedIn(someone: Person) {
  return (await aSignedInSession(t, someone)).asSignedIn;
}

function memberOf(someone: Person): Promise<MemberId> {
  return memberIn(t, someone);
}

// Today's `by_member_turned` index: a member's items, the face-down ones first, then by when each was turned.
async function itemsOf(member: MemberId): Promise<Array<Doc<"items">>> {
  const items = (await t.seed.all("items")).filter((row) => row.member === member);
  return items.sort((one, other) => (one.turnedAt ?? -Infinity) - (other.turnedAt ?? -Infinity));
}

async function itemCountsOf(...members: MemberId[]) {
  const counts: number[] = [];
  for (const member of members) counts.push((await itemsOf(member)).length);
  return counts;
}

async function trayHoggieItemOf(giver: Person): Promise<Id<"items">> {
  const item = (await itemsOf(await memberOf(giver))).find(({ source, key, turnedAt }) => source === "hoggie" && key.startsWith("tray:") && turnedAt === undefined);
  if (item === undefined) throw new Error("no tray hoggie item waits");
  return item._id as Id<"items">;
}

async function hoggiesTalliedFor(someone: Person) {
  const member = await memberOf(someone);
  const weeks = (await t.seed.all("weekTallies")).filter((row) => row.member === member).sort((one, other) => one.week.localeCompare(other.week));
  const counts = (await t.seed.all("hoggieTallies")).filter((row) => row.member === member).sort((one, other) => one.hoggie.localeCompare(other.hoggie));
  return { weeks: weeks.map(({ hoggiesFound }) => hoggiesFound), counts: counts.map(({ hoggie, count }) => ({ hoggie, count })) };
}

async function everyItemForgotten() {
  for (const item of await t.seed.all("items")) await t.seed.delete("items", item._id);
}

async function waitingRowsFor(member: MemberId, count: number) {
  for (let n = 0; n < count; n += 1) {
    const message = { workspace: "T1", conversation: "C1", message: `${n}.${member}` };
    const waiting = { workspace: "T1", giver: member, recipient: member, week: "2026-10-12", message, at: t.clock.now() };
    await t.seed.insert("thoughtfulPacks", { ...waiting, holdsSticker: false });
    const opened = await t.seed.insert("thoughtfulPacks", { ...waiting, holdsSticker: false, openedAt: t.clock.now() });
    await t.seed.insert("trayItems", { member, pack: opened, at: t.clock.now(), kind: "hoggie", hoggie: "toilet", rarity: "common", isNew: true });
  }
}

function everythingWritten() {
  return everythingWrittenIn(t);
}
