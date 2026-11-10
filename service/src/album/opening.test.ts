// convex/album/opening.test.ts on the service: a thoughtful pack earned through the signed front door, opened and read
// back through the website's album. albumPorts.testing.ts says where a Slack event or a website call stands in as the
// stub it waits on.
import { afterEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { emoji, memberEvent, mention, messageEvent, section, text } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { Id } from "../db/columns.ts";
import { recordReward } from "../progression/progression.ts";
import type { AlbumAnswer, OpenAnswer } from "../website/album.ts";
import type { Denial } from "../website/memberQuery.ts";
import type { MemberId } from "../workspace/directory.ts";
import { catalogue } from "./hoggies/catalogue.ts";
import { drawOf } from "./hoggies/draw.ts";
import { aDeploymentForWorkspace, aSignedInSession, everythingWritten, everyTable, extraMemberArgument, memberOrNullOf, registry, signedOut, slackEvent, switchWebsite, type Person, type Reader } from "./albumPorts.testing.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist" };
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];

type PackId = Id<"thoughtfulPacks">;

const backend = useTestBackend({ now: tuesday.getTime(), registry });
let t: TestBackend;
let messages = 0;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The Convex file's beforeEach, run inside each test so a stub it reaches is the test's own NotPortedError.
async function setUp() {
  aDeploymentForWorkspace();
  t = backend();
  for (const person of [alice, bob, carol]) t.slack.withMember(person.user, { real_name: person.name });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(t, true, ...albumOpen);
}

describe("AL8 AL10: opening a thoughtful pack puts its sticker and its hoggie in the stored tray", () => {
  waitsOn(["S4", "S15", "S16"], "an opened pack leaves the waiting packs, its sticker and then its hoggie wait in the tray, and another device reads the same tray", async () => {
    await setUp();
    await thanks(alice, why, bob, carol);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);

    const opened = await open(asAlice, forBob!);

    const drawn = await drawnFor(alice, forBob!);
    expect(opened).toMatchObject({ kind: "opened", items: [{ kind: "sticker", person: await memberOf(bob) }, { kind: "hoggie", hoggie: drawn.hoggie, rarity: drawn.rarity, isNew: true }] });
    const album = await albumOf(asAlice);
    expect(album.packs.map(({ person }) => person)).toEqual([await memberOf(carol)]);
    expect(album.tray).toEqual("items" in opened ? opened.items : null);
    expect((await albumOf(await signedIn(alice))).tray).toEqual(album.tray);
  });

  waitsOn(["S4", "S15", "S16"], "the tray lists every opened pack's items in opening order", async () => {
    await setUp();
    await thanks(alice, why, bob, carol);
    const asAlice = await signedIn(alice);
    const [forBob, forCarol] = await waitingPacksOf(asAlice);

    await open(asAlice, forCarol!);
    t.time.advance(minuteMs);
    await open(asAlice, forBob!);

    const { tray } = await albumOf(asAlice);
    expect(tray.map((item) => (item.kind === "sticker" ? `sticker of ${nameOf(item.person)}` : "hoggie"))).toEqual([`sticker of ${carol.name}`, "hoggie", `sticker of ${bob.name}`, "hoggie"]);
    expect(new Set(tray.map(({ item }) => item)).size).toBe(4);
  });
});

describe("AL10: getAlbum's tray is bounded", () => {
  waitsOn(["S4", "S15", "S16"], "a tray of 102 items, from 51 opened packs, shows its oldest 100 in opening order with moreTray", async () => {
    await setUp();
    const crowd = Array.from({ length: 52 }, (_, index) => ({ user: `U_CROWD_${index}`, name: `Crowd Person ${index}` }));
    for (const person of crowd) t.slack.withMember(person.user, { real_name: person.name });
    await thanks(alice, why, ...crowd);
    const asAlice = await signedIn(alice);
    const opened = [];
    for (const pack of await waitingPacksOf(asAlice)) opened.push(...itemsOf(await open(asAlice, pack)));
    const [fiftyFirst] = await waitingPacksOf(asAlice);
    opened.push(...itemsOf(await open(asAlice, fiftyFirst!)));

    const album = await albumOf(asAlice);

    expect(opened).toHaveLength(102);
    expect(album.tray).toEqual(opened.slice(0, 100));
    expect(album.moreTray).toBe(true);
  });
});

describe("a pack's sticker is decided at its grant", () => {
  waitsOn(["S4", "S15", "S16"], "two packs for one new person put the sticker in the tray from the first granted, opened in either order, and a pack for someone held holds only a hoggie", async () => {
    await setUp();
    await thanks(alice, why, bob);
    t.time.advance(7 * dayMs);
    await thanks(alice, "Thanks for reviewing the quarterly runbook", bob);
    const asAlice = await signedIn(alice);
    const [first, second] = await waitingPacksOf(asAlice);

    expect(kindsIn(await open(asAlice, second!)), "the later pack opened first").toEqual(["hoggie"]);
    expect(kindsIn(await open(asAlice, first!)), "the first granted pack opened second").toEqual(["sticker", "hoggie"]);

    await thanks(bob, "ty", carol);
    await anAlbumStickerAsHistoryWillRecordIt(alice, carol);
    await thanks(alice, "Thanks for the steady hand during the outage", carol);
    const [forHeldCarol] = await waitingPacksOf(asAlice);
    expect(kindsIn(await open(asAlice, forHeldCarol!)), "a pack for someone already in the album").toEqual(["hoggie"]);
  });

  waitsOn(["S4", "S15", "S16"], "a history sticker recorded between the grant and the open leaves the pack's sticker as the grant decided it", async () => {
    await setUp();
    await thanks(alice, why, bob);
    await anAlbumStickerAsHistoryWillRecordIt(alice, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);

    expect(kindsIn(await open(asAlice, forBob!))).toEqual(["sticker", "hoggie"]);
  });
});

describe("AL7 AL8: the open draws its hoggie through Hoggies", () => {
  waitsOn(["S4", "S15", "S16"], "it draws for the crate thoughtful:<pack ID> and sends hoggie dropped with crate_kind thoughtful, surface website and the pack's bonus", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);

    const opened = await open(asAlice, forBob!);
    await t.settle();

    const drawn = await drawnFor(alice, forBob!);
    expect(opened).toMatchObject({ kind: "opened", items: [{ kind: "sticker" }, { kind: "hoggie", hoggie: drawn.hoggie }] });
    expect(hoggieDroppedEvents()).toEqual([{ crate_kind: "thoughtful", surface: "website", rarity: drawn.rarity, is_new: true, pack_xp: 15, pack_coins: 0 }]);
  });
});

describe("AL9: a thoughtful pack pays 15 XP and no coins", () => {
  waitsOn(["S4", "S15", "S16"], "with packs on, the open answers 15 XP and no coins applied, and getAlbum's level counts them", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;
    const [forBob] = await waitingPacksOf(asAlice);

    const opened = await open(asAlice, forBob!);

    expect(opened).toMatchObject({ kind: "opened", applied: { xp: 15, coins: 0 } });
    const applied = "applied" in opened ? opened.applied : null;
    expect(applied?.to.coins).toBe(applied?.from.coins);
    expect((await albumOf(asAlice)).level.xp).toBe(before + 15);
  });

  waitsOn(["S4", "S6", "S15", "S16"], "while coins aren't shown to the member, the answer shows none of them, as the website's other opens do", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const member = await memberOf(alice);
    await t.run((ctx) => recordReward(ctx, "T1", { member, key: "test:earned:120", xp: 0, coins: 120, item: null, catalogueVersion: "2", at: 0 }));
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);

    const opened = await open(asAlice, forBob!);

    expect(opened).toMatchObject({ kind: "opened", applied: { xp: 15, coins: 0, from: { coins: 0 }, to: { coins: 0 } } });
  });

  waitsOn(["S4", "S15", "S16"], "with packs off, the open still fills the tray and pays nothing", async () => {
    await setUp();
    await switchWebsite(t, true, "album", "collection");
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;
    const [forBob] = await waitingPacksOf(asAlice);

    const opened = await open(asAlice, forBob!);

    expect(opened).toMatchObject({ kind: "opened", applied: null });
    expect(kindsIn(opened)).toEqual(["sticker", "hoggie"]);
    expect((await albumOf(asAlice)).level.xp).toBe(before);
  });
});

describe("AL8: a second open and an open while album or collection is off change nothing", () => {
  waitsOn(["S4", "S15", "S16"], "a second open of the same pack answers the fixed refusal and changes no table", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);
    await open(asAlice, forBob!);
    await t.settle();
    const before = await everyTable(t);

    expect(await open(asAlice, forBob!)).toEqual({ kind: "refused" });
    await t.settle();

    expect(await everyTable(t)).toEqual(before);
  });

  waitsOn(["S4", "S15", "S16"], "with album off, the open answers the fixed refusal and changes no table", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);
    await switchWebsite(t, true, "collection", "packs");
    await t.settle();
    const before = await everyTable(t);

    expect(await open(asAlice, forBob!)).toEqual({ kind: "refused" });
    await t.settle();

    expect(await everyTable(t)).toEqual(before);
  });

  waitsOn(["S4", "S15", "S16"], "with collection off, the open answers the fixed refusal, changes no table, and the pack keeps waiting", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);
    await switchWebsite(t, true, "album", "packs");
    await t.settle();
    const before = await everyTable(t);

    expect(await open(asAlice, forBob!)).toEqual({ kind: "refused" });
    await t.settle();

    expect(await everyTable(t)).toEqual(before);
    expect(await waitingPacksOf(asAlice)).toEqual([forBob]);
  });
});

describe("website commands pass one guard", () => {
  waitsOn(["S4", "S15", "S16"], "WS61: with the website flag off, opening a pack answers closed and writes nothing at all", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);
    await switchWebsite(t, false, ...albumOpen);
    const before = await everyTable(t);

    expect(await open(asAlice, forBob!)).toEqual({ kind: "closed" });
    expect(await everyTable(t)).toEqual(before);
  });

  waitsOn(["S4", "S15", "S16"], "WS61: without a session it answers signed-out, and for a member who left not-a-member, writing nothing at all", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);
    const before = await everyTable(t);

    expect(await open(signedOut, forBob!)).toEqual({ kind: "signed-out" });
    expect(await everyTable(t)).toEqual(before);
    await slackEvent(t, memberEvent("user_change", { id: alice.user, team_id: "T1", deleted: true }));
    await t.settle();
    const left = await everyTable(t);
    expect(await open(asAlice, forBob!)).toEqual({ kind: "not-a-member" });
    expect(await everyTable(t)).toEqual(left);
  });

  waitsOn(["S4", "S15", "S16"], "WS61: the pack is the only argument, so no call names a member", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);
    const before = await everyTable(t);

    await expect(asAlice.openThoughtfulPack({ pack: forBob!, member: await memberOf(alice) } as never)).rejects.toThrow(extraMemberArgument);
    expect(await everyTable(t)).toEqual(before);
  });
});

describe("a website command never launches unlocks", () => {
  waitsOn(["S4", "S15", "S16"], "WS62 P77: with xp-levels and unlocks on and no unlocks launch recorded, opening a pack answers refused, launches nothing, and getAlbum lists no pack to open", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [forBob] = await waitingPacksOf(asAlice);
    await switchWebsite(t, true, ...albumOpen, "xp-levels", "unlocks");
    await t.settle();
    const before = await everythingWritten(t);

    expect(await open(asAlice, forBob!)).toEqual({ kind: "refused" });
    await t.settle();

    expect(await everythingWritten(t)).toEqual(before);
    expect(before.tables.unlockLaunches).toEqual([]);
    expect(await albumOf(asAlice)).toMatchObject({ packs: [], morePacks: false });
  });
});

const names = new Map<string, string>();

async function thanks(giver: Person, words: string, ...recipients: Person[]) {
  messages += 1;
  t.time.advance(minuteMs);
  await slackEvent(t, messageEvent([section(text(`${words} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts: `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}` }));
  await t.settle();
  for (const person of [alice, bob, carol]) {
    const member = await memberOrNullOf(t, person);
    if (member !== null) names.set(member, person.name);
  }
}

function open(reader: Reader, pack: PackId): Promise<OpenAnswer | Denial> {
  return reader.openThoughtfulPack({ pack });
}

async function albumOf(reader: Reader): Promise<AlbumAnswer> {
  const album = await reader.getAlbum();
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album;
}

async function waitingPacksOf(reader: Reader): Promise<PackId[]> {
  return (await albumOf(reader)).packs.map(({ pack }) => pack);
}

function itemsOf(answer: OpenAnswer | Denial) {
  if (!("items" in answer)) throw new Error(`expected an open, got ${JSON.stringify(answer)}`);
  return answer.items;
}

function kindsIn(answer: OpenAnswer | Denial) {
  return itemsOf(answer).map(({ kind }) => kind);
}

async function drawnFor(person: Person, pack: PackId) {
  return drawOf({ secret: "", member: await memberOf(person), crate: `thoughtful:${pack}`, version: catalogue.version });
}

function nameOf(member: string) {
  return names.get(member) ?? member;
}

async function signedIn(person: Person) {
  return (await aSignedInSession(t, person)).asSignedIn;
}

async function memberOf(person: Person): Promise<MemberId> {
  return (await memberOrNullOf(t, person))!;
}

async function anAlbumStickerAsHistoryWillRecordIt(member: Person, person: Person) {
  const [memberId, personId] = [await memberOf(member), await memberOf(person)];
  await t.seed.insert("albumStickers", { member: memberId, person: personId, from: "history", at: t.clock.now() });
}

function hoggieDroppedEvents() {
  return t.postHog
    .productEvents()
    .filter(({ event }) => event === "hoggie dropped")
    .map(({ properties: { crate_kind, surface, rarity, is_new, pack_xp, pack_coins } }) => ({ crate_kind, surface, rarity, is_new, pack_xp, pack_coins }));
}
