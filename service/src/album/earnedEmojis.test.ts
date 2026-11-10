// The earned emojis over the service: each cause's emoji named from the registry and pictured as Slack pictures it,
// earned, seen once, held for its item's turn, counted, shared with admins, and found by the names a kudos uses.
//
// Today's convex/album/earnedEmojis.test.ts reads all of this through getAlbum (S16) after kudos posted in Slack (S4,
// S5) and packs opened and put in (S8), so its cases wait on those stacks and are left for its port. This file proves
// the album's side at its seam: the reads other stacks own answer from the worlds in ./testing/, through their map
// signatures; Slack's custom emoji is S3's, stood in by ./testing/emojiWorld.ts.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { MemberId } from "../workspace/directory.ts";
import { standardEmojiNamed } from "../workspace/standardEmoji.ts";
import { emojiArtPictureOf, hypeEmblemPicture, milestoneTierArtOf, teamEmblemPicture } from "./emojiCatalogue.ts";
import {
  earnedEmojiCountOf,
  earnedEmojisAmong,
  earnedEmojisOf,
  emojisEarnedBetween,
  emojiStackOf,
  holdsEarnedEmoji,
  holdsEarnedEmojiNamed,
  hypeEmojiOf,
  isEarnedBy,
  levelEmojiOf,
  levelEmojisEarnedIn,
  markEmojiSeen,
  markEmojisSeenBy,
  mostEmojisSeenAtOnce,
  mostHypeEmojisShown,
  seenAtOf,
  sharedEmojisOf,
  teamEmojiOf,
  tierUnlockedAt,
  unlockHypeEmojiOf,
  type EarnedEmoji,
  type EmojiCauses,
} from "./earnedEmojis.ts";
import { reserveSharedEmojiNames } from "./emojiNames.ts";
import { milestoneCatalogue } from "./milestoneCatalogue.ts";
import type { MilestoneAnswer } from "./milestones.ts";
import { earnedWorld } from "./testing/earnedWorld.ts";
import { emojiWorld } from "./testing/emojiWorld.ts";
import type { TeamPage } from "./teamPages.ts";

vi.mock("../workspace/slackEmoji.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "slackEmoji"));
vi.mock("./flag.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "albumFlags"));
vi.mock("./items/flag.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "itemFlags"));
vi.mock("./items/onboardingFlag.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "onboarding"));
vi.mock("./items/ledger.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "ledger"));
vi.mock("./items/hypes.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "itemHypes"));
vi.mock("./packs.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "packs"));
vi.mock("../progression/progression.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "progression"));
vi.mock("../unlocks/levelUps.ts", async (original) => (await import("./testing/earnedWorld.ts")).standIn(original, "levelUps"));

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const levels = [5, 10, 15, 20, 25];

const backend = useTestBackend({ now: tuesday });
let t: TestBackend;
let alice: MemberId;
let bruno: MemberId;

beforeEach(async () => {
  t = backend();
  emojiWorld.reset();
  earnedWorld.reset();
  await t.seed.insert("companyTeams", { team: "otters", name: "Otters", leads: [], people: [1, 2], asOf: tuesday });
  await t.seed.insert("companyTeams", { team: "lanterns", name: "Lanterns", crestImage: "https://crests.example/lanterns.png", leads: [], people: [3], asOf: tuesday });
  alice = await aMember("U_ALICE", "Alice Marchetti");
  bruno = await aMember("U_BRUNO", "Bruno Castellane");
  await t.run((ctx) => reserveSharedEmojiNames(ctx, { workspace: "T1" }));
});

describe("an earned emoji follows its cause", () => {
  test("before any cause, a member reads every company team's emoji, every milestone tier's and each level's, locked with their progress, named from the registry and pictured under their catalogue IDs, and no hype emoji", async () => {
    const { emojis, more } = await emojisOf(alice, causesOf({ pages: [aPage("otters", "Otters", { held: 1, total: 2 }), aPage("lanterns", "Lanterns", { held: 0, total: 1, art: { kind: "image", url: "https://crests.example/lanterns.png" } })] }));

    expect(more).toBe(false);
    expect(emojis.filter(({ kind }) => kind === "hype")).toEqual([]);
    expect(emojis.find(({ id }) => id === "team:otters")).toEqual(locked("team:otters", "team", "team-otters", emojiArtPictureOf("team", "otters"), { have: 1, need: 2 }));
    expect(emojis.find(({ id }) => id === "team:lanterns")).toEqual(locked("team:lanterns", "team", "team-lanterns", "https://crests.example/lanterns.png", { have: 0, need: 1 }));
    expect(emojis.find(({ id }) => id === "milestone:people:bronze")).toEqual(locked("milestone:people:bronze", "milestone", "first-face", emojiArtPictureOf("milestone", milestoneTierArtOf("people", "bronze")), { have: 0, need: 1 }));
    expect(emojis.filter(({ kind }) => kind === "milestone")).toHaveLength(20);
    expect(emojis.filter(({ kind }) => kind === "level").map(({ id, progress }) => ({ id, progress }))).toEqual(levels.map((level) => ({ id: `level:${level}`, progress: { have: 0, need: expect.any(Number) } })));
  });

  test("an unlocked team page and a reached tier earn their emojis, with when, and a level reached earns its emoji", async () => {
    const at = tuesday - minuteMs;
    const { emojis } = await emojisOf(alice, causesOf({ pages: [aPage("otters", "Otters", { held: 2, total: 2, state: "unlocked", unlockedAt: at })], earned: { "people:bronze": at }, level: { level: 10, xp: 999 } }));

    expect(emojis.find(({ id }) => id === "team:otters")).toEqual(earned("team:otters", "team", "team-otters", emojiArtPictureOf("team", "otters"), at));
    expect(emojis.find(({ id }) => id === "milestone:people:bronze")).toEqual(earned("milestone:people:bronze", "milestone", "first-face", expect.any(String) as string, at));
    expect(emojis.filter(({ kind, earned: isEarned }) => kind === "level" && isEarned).map(({ id }) => id)).toEqual(["level:5", "level:10"]);
    expect(emojis.find(({ id }) => id === "level:15")).toMatchObject({ earned: false, progress: { have: 999 } });
  });

  test("LP71: while onboarding is on, a member at level 2 holds :raised_hands:, in Slack and pictured as Slack pictures it, and a member at level 1 reads it locked", async () => {
    earnedWorld.flags.hiddenItems.add(alice).add(bruno);
    earnedWorld.flags.onboarding.add(alice).add(bruno);
    const raisedHands = standardEmojiNamed("raised_hands")!.image;

    expect((await emojisOf(alice, causesOf({ level: { level: 2, xp: 50 } }))).emojis.find(({ id }) => id === "level:2")).toMatchObject({ name: "raised_hands", picture: raisedHands, inSlack: true, earned: true });
    expect((await emojisOf(bruno, causesOf({ level: { level: 1, xp: 0 } }))).emojis.find(({ id }) => id === "level:2")).toMatchObject({ earned: false, progress: { have: 0 } });
    earnedWorld.flags.onboarding.clear();
    expect((await emojisOf(alice, causesOf({ level: { level: 2, xp: 50 } }))).emojis.find(({ id }) => id === "level:2"), "no level 2 emoji while onboarding is off").toBeUndefined();
  });

  test("the first thoughtful pack for a person earns their hype emoji, pictured by their posthog.com face, else their Slack picture, else the hype emblem; a second pack earns no second one", async () => {
    const pia = await aMember("U_PIA", "Pia Snapshot", "https://avatars.example/pia.png");
    const fen = await aMember("U_FEN", "Fen Noface");
    const otter = await aMember("U_OTTER", "Otter Quillfeather");
    await t.seed.insert("companyFaces", { workspace: "T1", member: otter, face: { image: "https://faces.example/otter.png", colour: "teal" }, profile: 1 });
    for (const [person, at] of [[pia, tuesday - 3 * minuteMs], [fen, tuesday - 2 * minuteMs], [otter, tuesday - minuteMs], [pia, tuesday]] as const) await aPack(alice, person, at);

    const hypes = (await emojisOf(alice, causesOf())).emojis.filter(({ kind }) => kind === "hype");

    expect(byId(hypes)).toEqual(
      byId([
        { ...earned(`hype:${pia}`, "hype", "pia-snapshot-hype", "https://avatars.example/pia.png", tuesday - 3 * minuteMs), from: "Pia Snapshot" },
        { ...earned(`hype:${fen}`, "hype", "fen-noface-hype", hypeEmblemPicture, tuesday - 2 * minuteMs), from: "Fen Noface" },
        { ...earned(`hype:${otter}`, "hype", "otter-quillfeather-hype", "https://faces.example/otter.png", tuesday - minuteMs), from: "Otter Quillfeather" },
      ]),
    );
  });

  test("a hype emoji whose pack still waits face down reads locked until its item is turned, and one collected by reactions says so", async () => {
    const carol = await aMember("U_CAROL", "Carol Okafor");
    const dana = await aMember("U_DANA", "Dana Reyes");
    await aPack(alice, carol, tuesday);
    await t.seed.insert("hypesCollected", { workspace: "T1", member: alice, person: dana, at: tuesday });
    earnedWorld.flags.hiddenItems.add(alice);
    earnedWorld.packsFaceDown.add(`${alice}:${carol}`);

    const held = { people: new Set([carol]), every: false };
    const hypes = (await emojisOf(alice, causesOf({ hypesHeld: held }))).emojis.filter(({ kind }) => kind === "hype");

    expect(hypes.find(({ id }) => id === `hype:${carol}`)).toMatchObject({ earned: false, earnedAt: null, progress: { have: 0, need: 1 } });
    expect(hypes.find(({ id }) => id === `hype:${dana}`)).toMatchObject({ earned: true, earnedAt: tuesday, byReactions: true });
    expect(await t.query((ctx) => isEarnedBy(ctx, alice, `hype:${carol}`)), "held for its item").toBe(false);

    await t.run((ctx) => markEmojiSeen(ctx, alice, `hype:${carol}`, tuesday + minuteMs));

    expect((await emojisOf(alice, causesOf({ hypesHeld: held }))).emojis.find(({ id }) => id === `hype:${carol}`)).toMatchObject({ earned: true, seen: true });
    expect(await t.query((ctx) => isEarnedBy(ctx, alice, `hype:${carol}`)), "turned").toBe(true);
  });

  test("a random drop reads earned beside the rest, from the teammate whose pack dropped it, while Slack still has it", async () => {
    earnedWorld.flags.randomEmojis.add(alice);
    emojiWorld.slackHas("T1", { name: "partyparrot", image: "https://emoji.example/partyparrot.png" });
    const pack = await aPack(alice, bruno, tuesday);
    await t.seed.insert("randomEmojiDrops", { member: alice, name: "partyparrot", pack, at: tuesday + minuteMs });
    await t.seed.insert("randomEmojiDrops", { member: alice, name: "gone-from-slack", pack, at: tuesday + minuteMs });

    const random = (await emojisOf(alice, causesOf())).emojis.filter(({ kind }) => kind === "random");

    expect(random).toEqual([{ id: "random:partyparrot", kind: "random", name: "partyparrot", from: "Bruno Castellane", picture: "https://emoji.example/partyparrot.png", earned: true, earnedAt: tuesday + minuteMs, seen: false, inSlack: true, progress: null }]);
  });

  test("an earned emoji is in Slack while the workspace's custom emoji holds its name, pictured as Slack pictures it", async () => {
    emojiWorld.slackHas("T1", { name: "team-otters", image: "https://emoji.example/team-otters.png" });

    const { emojis } = await emojisOf(alice, causesOf({ pages: [aPage("otters", "Otters"), aPage("lanterns", "Lanterns")] }));

    expect(emojis.find(({ id }) => id === "team:otters")).toMatchObject({ inSlack: true, picture: "https://emoji.example/team-otters.png" });
    expect(emojis.find(({ id }) => id === "team:lanterns")).toMatchObject({ inSlack: false });
  });
});

describe("AL26: each earned emoji is seen once", () => {
  test("an earned emoji reads unseen until markEmojisSeen names it, then seen for good; a locked, unknown or repeated ID records nothing", async () => {
    await aTeamSticker(alice, "otters");

    const marked = await t.run((ctx) => markEmojisSeenBy(ctx, alice, ["team:otters", "team:otters", "team:lanterns", "level:5", "nonsense"], tuesday));
    const again = await t.run((ctx) => markEmojisSeenBy(ctx, alice, ["team:otters"], tuesday + minuteMs));

    expect(marked).toEqual(["team:otters"]);
    expect(again, "marking again answers it, writing nothing").toEqual(["team:otters"]);
    expect((await t.seed.all("seenEmojis")).map(({ member, emoji, at }) => ({ member, emoji, at }))).toEqual([{ member: alice, emoji: "team:otters", at: tuesday }]);
    expect((await emojisOf(alice, causesOf({ pages: [aPage("otters", "Otters", { state: "unlocked", unlockedAt: tuesday })] }))).emojis.find(({ id }) => id === "team:otters")).toMatchObject({ seen: true });
  });

  test("more IDs than a member could see at once are refused whole", async () => {
    await aTeamSticker(alice, "otters");

    const refused = await t.run((ctx) => markEmojisSeenBy(ctx, alice, ["team:otters", ...Array.from({ length: mostEmojisSeenAtOnce }, (_, index) => `level:${index}`)], tuesday));

    expect(refused).toBeNull();
    expect(await t.seed.all("seenEmojis")).toEqual([]);
  });

  test("an emoji is turned once: a second turn answers false and writes nothing, and a hype emoji unlocks once", async () => {
    const carol = await aMember("U_CAROL", "Carol Okafor");

    expect(await t.run((ctx) => markEmojiSeen(ctx, alice, "milestone:people:bronze", tuesday))).toBe(true);
    expect(await t.run((ctx) => markEmojiSeen(ctx, alice, "milestone:people:bronze", tuesday + minuteMs))).toBe(false);
    expect(await t.query((ctx) => seenAtOf(ctx, alice, "milestone:people:bronze"))).toBe(tuesday);

    expect(await t.run((ctx) => unlockHypeEmojiOf(ctx, { workspace: "T1", member: alice }, carol, tuesday))).toEqual({ name: "carol-okafor-hype", picture: hypeEmblemPicture, inSlack: false });
    expect(await t.run((ctx) => unlockHypeEmojiOf(ctx, { workspace: "T1", member: alice }, carol, tuesday + minuteMs)), "a second unlock").toBeNull();
    expect(await t.seed.all("seenEmojis")).toHaveLength(2);
  });

  test("past the 200 hype emojis one read answers, the unseen ones come first, so a new hype emoji is never left out", async () => {
    const people: MemberId[] = [];
    for (let index = 0; index <= mostHypeEmojisShown; index += 1) {
      const person = await aMember(`U_CROWD${index}`, `Crowd Person${index}`);
      people.push(person);
      await aPack(alice, person, tuesday + index);
    }
    const newest = people.at(-1)!;
    for (const person of people.slice(0, -1)) await t.seed.insert("seenEmojis", { member: alice, emoji: `hype:${person}`, at: tuesday });

    const { emojis, more } = await emojisOf(alice, causesOf());
    const hypes = emojis.filter(({ kind }) => kind === "hype");

    expect(more).toBe(true);
    expect(hypes).toHaveLength(mostHypeEmojisShown);
    expect(hypes[0]).toMatchObject({ id: `hype:${newest}`, seen: false });
  }, 60_000);
});

describe("AL32: workspace admins and owners get the shared list", () => {
  test("an admin reads every company team, milestone and level emoji, and no hype or random one; another member reads none", async () => {
    await t.seed.patch("members", alice, { admin: true });
    await aPack(alice, bruno, tuesday);
    const read = await emojisOf(alice, causesOf({ pages: [aPage("otters", "Otters"), aPage("gone", "Gone")] }));

    const shared = await t.query((ctx) => sharedEmojisOf(ctx, alice, read));

    expect(shared!.map(({ kind }) => kind).toSorted()).toEqual([...Array(20).fill("milestone"), ...Array(5).fill("level"), "team"].toSorted());
    expect(shared!.find(({ kind }) => kind === "team")).toEqual({ id: "team:otters", kind: "team", name: "team-otters", from: "Otters", picture: expect.any(String), inSlack: false });
    expect(await t.query((ctx) => sharedEmojisOf(ctx, bruno, read))).toBeNull();
  });
});

describe("what a member holds", () => {
  test("each kind is held by its own cause: a team sticker, a tier reached, a level reached, a person thanked or collected, a drop while random emojis show", async () => {
    const carol = await aMember("U_CAROL", "Carol Okafor");
    await aTeamSticker(alice, "otters");
    await t.seed.insert("milestoneTiers", { member: alice, milestone: "people", tier: "bronze", at: tuesday, catalogue: milestoneCatalogue.version });
    earnedWorld.levels.set(alice, 10);
    await aPack(alice, bruno, tuesday);
    await t.seed.insert("hypesCollected", { workspace: "T1", member: alice, person: carol, at: tuesday });
    await t.seed.insert("randomEmojiDrops", { member: alice, name: "partyparrot", pack: await aPack(bruno, alice, tuesday), at: tuesday });

    const held = async (id: string) => t.query((ctx) => isEarnedBy(ctx, alice, id));

    expect(await held("team:otters")).toBe(true);
    expect(await held("team:lanterns")).toBe(false);
    expect(await held("milestone:people:bronze")).toBe(true);
    expect(await held("milestone:people:silver")).toBe(false);
    expect(await held("level:10")).toBe(true);
    expect(await held("level:15")).toBe(false);
    expect(await held("level:010"), "a level not written as the number it is").toBe(false);
    expect(await held(`hype:${bruno}`)).toBe(true);
    expect(await held(`hype:${carol}`)).toBe(true);
    expect(await held(`hype:${alice}`)).toBe(false);
    expect(await held("hype:not\u0000a-member"), "a key Postgres can't hold is no member").toBe(false);
    expect(await held("random:partyparrot"), "random emojis are off").toBe(false);
    expect(await t.query((ctx) => holdsEarnedEmoji(ctx, alice, "random:partyparrot")), "the drop is held whether or not they show").toBe(true);
    earnedWorld.flags.randomEmojis.add(alice);
    expect(await held("random:partyparrot")).toBe(true);
    expect(await held("sticker:otters")).toBe(false);
  });

  test("while hidden items show, a tier reached is held only once its emoji is turned, from the later of reaching and turning", async () => {
    earnedWorld.flags.hiddenItems.add(alice);
    await t.seed.insert("milestoneTiers", { member: alice, milestone: "people", tier: "bronze", at: tuesday, catalogue: milestoneCatalogue.version });

    expect(await t.query((ctx) => isEarnedBy(ctx, alice, "milestone:people:bronze"))).toBe(false);
    expect(await t.query((ctx) => tierUnlockedAt(ctx, alice, { milestone: "people", tier: "bronze" }, tuesday))).toBeNull();

    await t.run((ctx) => markEmojiSeen(ctx, alice, "milestone:people:bronze", tuesday + minuteMs));

    expect(await t.query((ctx) => isEarnedBy(ctx, alice, "milestone:people:bronze"))).toBe(true);
    expect(await t.query((ctx) => tierUnlockedAt(ctx, alice, { milestone: "people", tier: "bronze" }, tuesday))).toBe(tuesday + minuteMs);
    expect(await t.query((ctx) => tierUnlockedAt(ctx, alice, { milestone: "people", tier: "bronze" }, tuesday + 2 * minuteMs))).toBe(tuesday + 2 * minuteMs);
  });

  test("the names a kudos uses find what the member holds, a skin tone left off and a drop before a registered name, whether looked up one by one or past fifty at once", async () => {
    earnedWorld.flags.randomEmojis.add(alice);
    await aTeamSticker(alice, "otters");
    await t.seed.insert("randomEmojiDrops", { member: alice, name: "team-lanterns", pack: await aPack(bruno, alice, tuesday), at: tuesday });
    const asked = ["team-otters::skin-tone-2", "team-lanterns", "first-face", "team-otters::skin-tone-2"];
    const crowd = Array.from({ length: 60 }, (_, index) => `crowd-${index}`);

    const oneByOne = await t.query((ctx) => earnedEmojisAmong(ctx, "T1", alice, asked, () => true));
    const atOnce = await t.query((ctx) => earnedEmojisAmong(ctx, "T1", alice, [...asked, ...crowd], () => true));

    const expected = [
      { name: "team-otters::skin-tone-2", emoji: "team:otters" },
      { name: "team-lanterns", emoji: "random:team-lanterns" },
    ];
    expect(oneByOne).toEqual(expected);
    expect(atOnce.toSorted((one, other) => one.name.localeCompare(other.name))).toEqual(expected.toSorted((one, other) => one.name.localeCompare(other.name)));
    expect(await t.query((ctx) => earnedEmojisAmong(ctx, "T1", alice, asked, (emoji) => emoji !== "random:team-lanterns")), "a drop that doesn't count").toEqual([expected[0]]);
    expect(await t.query((ctx) => holdsEarnedEmojiNamed(ctx, "T1", alice, "team-otters::skin-tone-3"))).toBe(true);
    expect(await t.query((ctx) => holdsEarnedEmojiNamed(ctx, "T1", bruno, "team-otters"))).toBe(false);
  });

  test("the emoji stack counts each earned emoji the registry names and each drop, and shows the first ones", async () => {
    earnedWorld.flags.randomEmojis.add(alice);
    emojiWorld.slackHas("T1", { name: "partyparrot", image: "https://emoji.example/partyparrot.png" });
    await aTeamSticker(alice, "otters");
    await aTeamSticker(alice, "not-in-the-registry");
    earnedWorld.levels.set(alice, 5);
    await aPack(alice, bruno, tuesday);
    await t.seed.insert("randomEmojiDrops", { member: alice, name: "partyparrot", pack: await aPack(bruno, alice, tuesday), at: tuesday });

    expect(await t.query((ctx) => earnedEmojiCountOf(ctx, "T1", alice))).toBe(4);
    expect(await t.query((ctx) => emojiStackOf(ctx, "T1", alice, 2))).toEqual({ count: 4, shown: [{ name: "team-otters", picture: teamEmblemPicture, inSlack: false }, { name: "bruno-castellane-hype", picture: hypeEmblemPicture, inSlack: false }] });
    expect((await t.query((ctx) => emojiStackOf(ctx, "T1", alice, 10))).shown.at(-1)).toEqual({ name: "partyparrot", picture: "https://emoji.example/partyparrot.png", inSlack: true });
  });

  test("while hidden items show, the stack leaves out a hype emoji held for its item and a tier not yet turned", async () => {
    earnedWorld.flags.hiddenItems.add(alice);
    await aPack(alice, bruno, tuesday);
    earnedWorld.packsFaceDown.add(`${alice}:${bruno}`);
    await t.seed.insert("milestoneTiers", { member: alice, milestone: "people", tier: "bronze", at: tuesday, catalogue: milestoneCatalogue.version });

    expect(await t.query((ctx) => earnedEmojiCountOf(ctx, "T1", alice))).toBe(0);

    await t.run((ctx) => markEmojiSeen(ctx, alice, `hype:${bruno}`, tuesday));
    await t.run((ctx) => markEmojiSeen(ctx, alice, "milestone:people:bronze", tuesday));

    expect(await t.query((ctx) => earnedEmojiCountOf(ctx, "T1", alice))).toBe(2);
  });
});

describe("the item board's overflow", () => {
  test("while more items wait face down than the board shows, any unseen hype emoji may be held for one beyond it, so none counts; once all fit, one with no item waiting counts", async () => {
    earnedWorld.flags.hiddenItems.add(alice);
    await aPack(alice, bruno, tuesday);
    earnedWorld.otherItemsWaiting.set(alice, 101);

    expect(await t.query((ctx) => earnedEmojiCountOf(ctx, "T1", alice)), "101 waiting, 100 shown").toBe(0);

    earnedWorld.otherItemsWaiting.set(alice, 100);

    expect(await t.query((ctx) => earnedEmojiCountOf(ctx, "T1", alice)), "all 100 shown, none for Bruno").toBe(1);
  });
});

describe("the emojis earned in a week", () => {
  test("a jump past a level emoji's level reaches it at the jump: from level 1 to 12 earns level 5's and level 10's", async () => {
    const week = { from: tuesday, to: tuesday + 7 * 24 * 60 * minuteMs };
    earnedWorld.levelReachedAt.set(`${alice}:12`, tuesday + minuteMs);

    const names = (await t.query((ctx) => emojisEarnedBetween(ctx, { workspace: "T1", member: alice }, week))).map(({ name }) => name);

    expect(names).toEqual(["level-5", "level-10"]);
  });

  test("a team sticker, a first pack, a collection, a tier and a level reached between the instants are named, and a drop then; the rest are left out", async () => {
    earnedWorld.flags.randomEmojis.add(alice);
    emojiWorld.slackHas("T1", { name: "partyparrot", image: "https://emoji.example/partyparrot.png" });
    const carol = await aMember("U_CAROL", "Carol Okafor");
    const week = { from: tuesday, to: tuesday + 7 * 24 * 60 * minuteMs };
    await aTeamSticker(alice, "otters", tuesday + minuteMs);
    await aTeamSticker(alice, "lanterns", tuesday - minuteMs);
    await aPack(alice, bruno, tuesday + minuteMs);
    await t.seed.insert("hypesCollected", { workspace: "T1", member: alice, person: carol, at: tuesday + 2 * minuteMs });
    await t.seed.insert("milestoneTiers", { member: alice, milestone: "people", tier: "bronze", at: tuesday + minuteMs, catalogue: milestoneCatalogue.version });
    earnedWorld.levelReachedAt.set(`${alice}:5`, tuesday + minuteMs);
    earnedWorld.levelReachedAt.set(`${alice}:10`, week.to);
    await t.seed.insert("randomEmojiDrops", { member: alice, name: "partyparrot", pack: await aPack(bruno, alice, tuesday - minuteMs), at: tuesday + minuteMs });

    const names = (await t.query((ctx) => emojisEarnedBetween(ctx, { workspace: "T1", member: alice }, week))).map(({ name }) => name);

    expect(names).toEqual(["team-otters", "bruno-castellane-hype", "carol-okafor-hype", "first-face", "level-5", "partyparrot"]);
  });

  test("while hidden items show, a hype emoji counts in the week its item is turned, and a tier in the week it is turned", async () => {
    earnedWorld.flags.hiddenItems.add(alice);
    const week = { from: tuesday, to: tuesday + 7 * 24 * 60 * minuteMs };
    await aPack(alice, bruno, tuesday - 3 * week.to);
    await t.seed.insert("milestoneTiers", { member: alice, milestone: "people", tier: "bronze", at: tuesday - minuteMs, catalogue: milestoneCatalogue.version });
    await t.seed.insert("seenEmojis", { member: alice, emoji: `hype:${bruno}`, at: tuesday + minuteMs });
    await t.seed.insert("seenEmojis", { member: alice, emoji: "milestone:people:bronze", at: tuesday + minuteMs });

    const names = (await t.query((ctx) => emojisEarnedBetween(ctx, { workspace: "T1", member: alice }, week))).map(({ name }) => name);

    expect(names).toEqual(["bruno-castellane-hype", "first-face"]);
    expect(await t.query((ctx) => emojisEarnedBetween(ctx, { workspace: "T1", member: alice }, { from: week.to, to: week.to + week.to - week.from }))).toEqual([]);
  });

  test("the level emojis a level up passed are earned at once, each with whether it was seen", async () => {
    await t.seed.insert("seenEmojis", { member: alice, emoji: "level:10", at: tuesday });

    const passed = await t.query((ctx) => levelEmojisEarnedIn(ctx, { workspace: "T1", member: alice }, { above: 4, upTo: 12, at: tuesday }));

    expect(passed.map(({ id, earned: isEarned, earnedAt, seen }) => ({ id, earned: isEarned, earnedAt, seen }))).toEqual([
      { id: "level:5", earned: true, earnedAt: tuesday, seen: false },
      { id: "level:10", earned: true, earnedAt: tuesday, seen: true },
    ]);
  });

  test("a team's, a level's and a person's emoji are shown by their name, as Slack pictures them, else by their art", async () => {
    emojiWorld.slackHas("T1", { name: "level-5", image: "https://emoji.example/level-5.png" });

    expect(await t.query((ctx) => teamEmojiOf(ctx, "T1", { team: "otters", art: null }))).toEqual({ name: "team-otters", picture: teamEmblemPicture, inSlack: false });
    expect(await t.query((ctx) => teamEmojiOf(ctx, "T1", { team: "nobody", art: null }))).toBeNull();
    expect(await t.query((ctx) => levelEmojiOf(ctx, "T1", 5))).toEqual({ name: "level-5", picture: "https://emoji.example/level-5.png", inSlack: true });
    expect(await t.query((ctx) => hypeEmojiOf(ctx, "T1", alice))).toEqual({ name: "alice-marchetti-hype", picture: hypeEmblemPicture, inSlack: false });
    const unnamed = await t.seed.insert("members", { workspace: "T1", user: "U_NEW", kind: "member", name: "New Person" });
    expect(await t.query((ctx) => hypeEmojiOf(ctx, "T1", unnamed)), "no hype name reserved yet").toBeNull();
  });
});

async function aMember(user: string, name: string, picture?: string): Promise<MemberId> {
  const member = await t.seed.insert("members", { workspace: "T1", user, kind: "member", name, ...(picture !== undefined && { picture }) });
  await t.seed.insert("emojiNames", { workspace: "T1", emoji: "hype", person: member, name: `${name.toLowerCase().replace(" ", "-")}-hype` });
  return member;
}

let messages = 0;

function aPack(giver: MemberId, recipient: MemberId, at: number) {
  messages += 1;
  return t.seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-12", message: { workspace: "T1", conversation: "C1", message: `${Math.floor(at / 1000)}.${String(messages).padStart(6, "0")}` }, holdsSticker: true, at });
}

function aTeamSticker(member: MemberId, team: string, at = tuesday) {
  return t.seed.insert("teamStickers", { member, workspace: "T1", team, at, name: team, art: null, emoji: `team-${team}` });
}

function aPage(team: string, name: string, fields: Partial<TeamPage> = {}): TeamPage {
  return { team, name, art: team === "otters" ? { kind: "crest", slug: "otters" } : null, mine: false, people: [], unmatched: [], held: 0, total: 1, state: "locked" as TeamPage["state"], unlockedAt: null, ...fields };
}

function causesOf({ pages = [], earned: earnedTiers = {}, level = { level: 1, xp: 0 }, hypesHeld }: { pages?: TeamPage[]; earned?: Record<string, number>; level?: EmojiCauses["level"]; hypesHeld?: EmojiCauses["hypesHeld"] } = {}): EmojiCauses {
  const milestones: MilestoneAnswer[] = milestoneCatalogue.milestones.map(({ id, steps }) => ({ id, count: 0, tiers: steps.map((step) => ({ ...step, earnedAt: earnedTiers[`${id}:${step.tier}`] ?? null })) }));
  return { pages, milestones, level, ...(hypesHeld !== undefined && { hypesHeld }) };
}

function emojisOf(member: MemberId, causes: EmojiCauses) {
  return t.query((ctx) => earnedEmojisOf(ctx, { workspace: "T1", member }, causes));
}

function locked(id: EarnedEmoji["id"], kind: EarnedEmoji["kind"], name: string, picture: string, progress: EarnedEmoji["progress"]): EarnedEmoji {
  return { id, kind, name, from: expect.any(String) as string, picture, earned: false, earnedAt: null, seen: false, inSlack: false, progress };
}

function earned(id: EarnedEmoji["id"], kind: EarnedEmoji["kind"], name: string, picture: string, earnedAt: number): EarnedEmoji {
  return { id, kind, name, from: expect.any(String) as string, picture, earned: true, earnedAt, seen: false, inSlack: false, progress: null };
}

function byId<T extends { id: string }>(entries: T[]): T[] {
  return entries.toSorted((one, other) => one.id.localeCompare(other.id));
}
