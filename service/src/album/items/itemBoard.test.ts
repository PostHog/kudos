// The port of convex/album/items/itemBoard.test.ts: a thanks in Slack earns its pack's hoggie as an item, the website's
// item board lists it, and turnItem draws it. Every test thanks through Slack, whose message handler is S4's (no domain
// registers one yet, so the thanks writes nothing), grants a pack that reaches S9's and S10's bodies, signs in through
// S15's sign-in, and reads and turns through S16's website commands.
import { afterEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { emoji, mention, section, text } from "../../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../../testing/waiting.ts";
import type { Id } from "../../db/columns.ts";
import type { AlbumAnswer, ItemBoard, TurnAnswer } from "../../website/album.ts";
import type { Denial } from "../../website/memberQuery.ts";
import { catalogue } from "../hoggies/catalogue.ts";
import { drawOf } from "../hoggies/draw.ts";
import { aDeploymentForWorkspace, aSignedInSession, everythingWritten, extraMemberArgument, memberChanged, memberOf, post, registry, signedOut, switchWebsite, type Person, type Reader } from "../albumPorts.testing.ts";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60_000;

const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const carol = { user: "U_CAROL", name: "Carol Lindqvist" };
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const itemsOn = [...albumOpen, "hidden-items"];

// A thanks in Slack (S4) granting a pack (S9, S10), read and turned on the website (S15, S16).
const thanked: [Stack, ...Stack[]] = ["S4", "S9", "S10", "S15", "S16"];

type ItemId = Id<"items">;

const backend = useTestBackend({ now: tuesday, registry });
let t: TestBackend;
let messages = 0;

async function setUp() {
  aDeploymentForWorkspace();
  t = backend();
  for (const person of [alice, bob, carol]) t.slack.withMember(person.user, { real_name: person.name });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(t, true, ...itemsOn);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LP5 LP7: a thanks in Slack earns its pack's hoggie as one item", () => {
  waitsOn(thanked, "a thoughtful kudos earns the giver its items for thanking the recipient once, and the redelivered event earns nothing more", async () => {
    await setUp();
    const ts = await thanks(alice, why, bob);
    await redeliver(alice, why, ts, bob);

    const { board } = await albumOf(await signedIn(alice));

    const thankedBob = { kind: "thanks", person: await memberOf(t, bob), thanked: { name: bob.name, face: expect.anything() } };
    expect(board?.items.map(({ reason }) => reason)).toEqual([thankedBob, thankedBob]);
  });

  waitsOn(thanked, "the item is earned while hidden-items is off, and waits on the board once it turns on", async () => {
    await setUp();
    await switchWebsite(t, true, ...albumOpen);
    await thanks(alice, why, bob);

    await switchWebsite(t, true, ...itemsOn);

    expect((await boardOf(await signedIn(alice))).items).toHaveLength(2);
  });
});

describe("LP8 LP9 LP17: with hidden-items on, getAlbum answers the item board and no packs or tray", () => {
  waitsOn(thanked, "the board lists the waiting items oldest first, naming only when each was earned and whom it thanked, and the packs and the tray are empty", async () => {
    await setUp();
    await thanks(alice, why, bob);
    await thanks(alice, "Thanks for pairing on the release", carol);

    const album = await albumOf(await signedIn(alice));

    expect(thanksItemsOn(album.board!).map(({ reason }) => reason.kind === "thanks" && reason.thanked.name)).toEqual([bob.name, bob.name, carol.name, carol.name]);
    for (const item of album.board!.items) expect(Object.keys(item).sort()).toEqual(["earnedAt", "item", "reason"]);
    expect(album.board?.more).toBe(false);
    expect(album).toMatchObject({ packs: [], morePacks: false, tray: [], moreTray: false });
  });

  waitsOn(thanked, "a board of 101 waiting items shows the oldest 100 with more", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const newer = await moreItemsLikeTheFirstOf(alice, 101 - (await boardOf(asAlice)).items.length);

    const board = await boardOf(asAlice);

    expect(board.items).toHaveLength(100);
    expect(board.more).toBe(true);
    expect(board.items.map(({ item }) => item)).not.toContain(newer.at(-1));
  });
});

describe("LP10 LP11 LP16: turnItem draws the hoggie at the turn, pays the pack's 15 XP and sends item turned", () => {
  waitsOn(thanked, "the turn answers the drawn hoggie on the Hoggies page with 15 XP applied, the board empties, the hoggie is found and item turned names its source, rarity and newness", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;
    const [item] = (await boardOf(asAlice)).items;

    const turned = await turn(asAlice, item!.item);
    await t.settle();

    const drawn = await drawnFor(alice, await packOf(alice));
    expect(turned).toMatchObject({ kind: "turned", again: false, face: { kind: "hoggie", drop: { hoggie: drawn.hoggie, rarity: drawn.rarity, isNew: true } }, applied: { xp: 15, coins: 0 }, page: { kind: "hoggies" } });
    const album = await albumOf(asAlice);
    expect(album.level.xp).toBe(before + 15);
    expect(thanksItemsOn(album.board!)).toHaveLength(1);
    expect(await foundHoggiesOf(asAlice)).toEqual([drawn.hoggie]);
    expect(eventsNamed("item turned").map(({ properties: { source, rarity, is_new } }) => ({ source, rarity, is_new }))).toEqual([{ source: "hoggie", rarity: drawn.rarity, is_new: true }]);
  });
});

describe("LP12: a replayed turn answers the same face and applies nothing", () => {
  waitsOn(thanked, "turning the same item again answers its face with again, pays nothing more and sends nothing more", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [item] = (await boardOf(asAlice)).items;
    const first = await turn(asAlice, item!.item);
    const xp = (await albumOf(asAlice)).level.xp;

    const again = await turn(asAlice, item!.item);
    await t.settle();

    expect(again).toEqual({ ...first, again: true, applied: null, unlocked: { teamStickers: [], hype: null, milestones: [] } });
    expect((await albumOf(asAlice)).level.xp).toBe(xp);
    expect(eventsNamed("item turned")).toHaveLength(1);
    expect(eventsNamed("hoggie dropped")).toHaveLength(1);
  });

  waitsOn(thanked, "two items turned at once both land", async () => {
    await setUp();
    await thanks(alice, why, bob, carol);
    const asAlice = await signedIn(alice);
    const items = thanksItemsOn(await boardOf(asAlice));

    const answers = await Promise.all(items.map(({ item }) => turn(asAlice, item)));

    expect(answers.map(({ kind }) => kind)).toEqual(items.map(() => "turned"));
    expect(thanksItemsOn(await boardOf(asAlice))).toEqual([]);
  });
});

describe("LP10: turnItem refuses and writes nothing", () => {
  waitsOn(thanked, "another member's item is refused", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const [item] = (await boardOf(await signedIn(alice))).items;
    const asBob = await signedIn(bob);
    const before = await everythingWritten(t);

    expect(await turn(asBob, item!.item)).toEqual({ kind: "refused" });
    expect(await everythingWritten(t)).toEqual(before);
  });

  waitsOn(thanked, "a missing item is refused", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const member = await memberOf(t, alice);
    const gone = await t.seed.insert("items", { workspace: "T1", member, source: "hoggie", key: "thoughtful:gone", reason: { kind: "thanks", person: member, message: { workspace: "T1", conversation: "C1", message: "1.000001" } }, earnedAt: t.clock.now() });
    await t.seed.delete("items", gone);
    const before = await everythingWritten(t);

    expect(await turn(asAlice, gone)).toEqual({ kind: "refused" });
    expect(await everythingWritten(t)).toEqual(before);
  });

  for (const [name, flags] of [
    ["hidden-items off", albumOpen],
    ["album off", ["collection", "packs", "hidden-items"]],
    ["collection off", ["album", "packs", "hidden-items"]],
  ] as const) {
    waitsOn(thanked, `with ${name} the turn is refused, and the item turns once the flag is back`, async () => {
      await setUp();
      await thanks(alice, why, bob);
      const asAlice = await signedIn(alice);
      const [item] = (await boardOf(asAlice)).items;
      await switchWebsite(t, true, ...flags);
      const before = await everythingWritten(t);

      expect(await turn(asAlice, item!.item)).toEqual({ kind: "refused" });
      expect(await everythingWritten(t)).toEqual(before);
      await switchWebsite(t, true, ...itemsOn);
      expect(await turn(asAlice, item!.item)).toMatchObject({ kind: "turned", again: false });
    });
  }
});

describe("website commands pass one guard", () => {
  waitsOn(thanked, "WS61: with the website flag off, turning an item answers closed and writes nothing at all", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [item] = (await boardOf(asAlice)).items;
    await switchWebsite(t, false, ...itemsOn);
    const before = await everythingWritten(t);

    expect(await turn(asAlice, item!.item)).toEqual({ kind: "closed" });
    expect(await everythingWritten(t)).toEqual(before);
  });

  // The member who left leaves through Slack's user_change, whose handler is S3's.
  waitsOn(["S3", ...thanked], "WS61: without a session it answers signed-out, and for a member who left not-a-member, writing nothing at all", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [item] = (await boardOf(asAlice)).items;
    const before = await everythingWritten(t);

    expect(await turn(signedOut, item!.item)).toEqual({ kind: "signed-out" });
    expect(await everythingWritten(t)).toEqual(before);
    await memberChanged(t, "user_change", { id: alice.user, team_id: "T1", deleted: true });
    await t.settle();
    const left = await everythingWritten(t);
    expect(await turn(asAlice, item!.item)).toEqual({ kind: "not-a-member" });
    expect(await everythingWritten(t)).toEqual(left);
  });

  waitsOn(thanked, "WS61: the item is the only argument, so no call names a member", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const [item] = (await boardOf(asAlice)).items;
    const before = await everythingWritten(t);

    await expect(asAlice.turnItem({ item: item!.item, member: await memberOf(t, alice) } as never)).rejects.toThrow(extraMemberArgument);
    expect(await everythingWritten(t)).toEqual(before);
  });
});

describe("a website command never launches unlocks", () => {
  waitsOn(thanked, "WS62 P77: with xp-levels and unlocks on and no unlocks launch recorded, turning an item answers refused and launches nothing", async () => {
    await setUp();
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const item = await itemOf(alice);
    await switchWebsite(t, true, ...itemsOn, "xp-levels", "unlocks");
    await t.settle();
    const before = await everythingWritten(t);

    expect(await turn(asAlice, item)).toEqual({ kind: "refused" });
    await t.settle();

    expect(await everythingWritten(t)).toEqual(before);
    expect(before.tables.unlockLaunches).toEqual([]);
  });
});

describe("LP6: with hidden-items off, packs, the tray and the open stay as today, and the open marks the item turned", () => {
  waitsOn(thanked, "getAlbum answers no board, the pack waits and opens into the tray, and once hidden-items turns on the opened pack's item no longer waits", async () => {
    await setUp();
    await switchWebsite(t, true, ...albumOpen);
    await thanks(alice, why, bob);
    const asAlice = await signedIn(alice);
    const album = await albumOf(asAlice);
    expect(album.board).toBeUndefined();

    const opened = await asAlice.openThoughtfulPack({ pack: album.packs[0]!.pack });

    expect(opened).toMatchObject({ kind: "opened", items: [{ kind: "sticker" }, { kind: "hoggie" }] });
    await asAlice.putAllIn();
    await switchWebsite(t, true, ...itemsOn);
    expect((await boardOf(asAlice)).items).toEqual([]);
  });
});

async function thanks(giver: Person, words: string, ...recipients: Person[]) {
  messages += 1;
  t.time.advance(minuteMs);
  const ts = `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}`;
  await post(t, [section(text(`${words} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts });
  await t.settle();
  return ts;
}

async function redeliver(giver: Person, words: string, ts: string, ...recipients: Person[]) {
  await post(t, [section(text(`${words} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts });
  await t.settle();
}

async function signedIn(person: Person) {
  return (await aSignedInSession(t, person)).asSignedIn;
}

function turn(reader: Reader, item: ItemId): Promise<TurnAnswer | Denial> {
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

function thanksItemsOn({ items }: ItemBoard) {
  return items.filter(({ reason }) => reason.kind === "thanks");
}

async function foundHoggiesOf(reader: Reader) {
  const answer = await reader.getAlbumHoggies();
  return answer.kind === "hoggies" ? answer.hoggies.filter(({ found }) => found).map(({ hoggie }) => hoggie) : [];
}

// The member's items in `by_member_turned`'s order: waiting ones first, then by when each was earned and written.
async function itemsInTurnOrderOf(person: Person) {
  const member = await memberOf(t, person);
  return (await t.seed.all("items"))
    .filter((row) => row.member === member)
    .sort((a, b) => (a.turnedAt ?? -Infinity) - (b.turnedAt ?? -Infinity) || a.earnedAt - b.earnedAt || a._creationTime - b._creationTime);
}

async function itemOf(person: Person): Promise<ItemId> {
  return (await itemsInTurnOrderOf(person))[0]!._id;
}

async function moreItemsLikeTheFirstOf(person: Person, count: number): Promise<ItemId[]> {
  const first = await itemOf(person);
  const { _id, _creationTime, ...earned } = (await t.seed.get("items", first))!;
  const newer: ItemId[] = [];
  for (let n = 1; n <= count; n += 1) newer.push(await t.seed.insert("items", { ...earned, key: `${earned.key}:${n}`, earnedAt: earned.earnedAt + minuteMs + n }));
  return newer;
}

async function packOf(giver: Person) {
  const member = await memberOf(t, giver);
  const packs = (await t.seed.all("thoughtfulPacks")).filter((row) => row.giver === member).sort((a, b) => a.at - b.at || a._creationTime - b._creationTime);
  return packs[0]!._id;
}

async function drawnFor(person: Person, pack: Id<"thoughtfulPacks">) {
  return drawOf({ secret: "", member: await memberOf(t, person), crate: `thoughtful:${pack}`, version: catalogue.version });
}

function eventsNamed(name: string) {
  return t.postHog.productEvents().filter(({ event }) => event === name);
}
