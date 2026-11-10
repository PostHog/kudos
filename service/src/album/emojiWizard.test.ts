// The emoji wizard over the service, ported from convex/album/emojiWizard.test.ts by the cases' own names.
//
// Today's file finds, maps and lists through the website (findSlackEmojis, mapMyEmoji, getAppEmojis, getAlbum: S16),
// reads what a member sees in the album's earned emojis (S9, later in the stack), and gets its people, Slack's custom
// emoji and the flags from Slack, the directory and PostHog (S3, S9's flag.ts). Here the cases call this module's own
// reads and writes, as the website calls them, and those other stacks' reads answer from a world the test gives
// (service/src/album/testing/emojiWorld.ts); what a member holds is the world's, and the holdings the maintainer's list counts
// are the album's own tables, seeded. The website's own guards (the wizard and list off, WS61, the person page) stay
// with the website's port, and a standard emoji's place among custom ones with S3's slackEmoji.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { emojiWorld } from "./testing/emojiWorld.ts";
import { replaceCompanyProfiles } from "../companyProfiles/sync.ts";
import { fromDocument } from "../db/documents.ts";
import { emojiNames } from "../db/schema/index.ts";
import { xpToReach } from "../progression/levels.ts";
import { standardEmojiNamed } from "../workspace/standardEmoji.ts";
import type { MemberId } from "../workspace/directory.ts";
import { placeSlackEmoji, type EmojiPlace } from "./emojiMappings.ts";
import { emojiNameOf, nameHypeEmojiOf, teamEmojiNameOf, type EarnedEmojiId } from "./emojiNames.ts";
import { appEmojisIn, emojiInPlaceFor, mapAppEmojiInPlace, mapHeldEmoji, mostAppEmojisListed, slackEmojisNear, type AppEmojiRow, type AppEmojiRows } from "./emojiWizard.ts";

vi.mock("../workspace/directory.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "directory"));
vi.mock("../workspace/slackEmoji.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "slackEmoji"));
vi.mock("../workspace/workspaceSettings.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "workspaceSettings"));
vi.mock("./levelEmojis.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "levelEmojis"));
vi.mock("./earnedEmojis.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "earnedEmojis"));
vi.mock("./flag.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "flags"));

const owner = "m_owner" as MemberId;
const alice = "m_alice" as MemberId;
const bruno = "m_bruno" as MemberId;
const otters = ["m_otter1", "m_otter2", "m_otter3"] as [MemberId, MemberId, MemberId];
const lanterns = ["m_lantern1", "m_lantern2"] as [MemberId, MemberId];
const everyLevel = [5, 10, 15, 20, 25];
const crowdRows = 3_000;
const names: Record<string, string> = { [owner]: "Mona Keeper", [alice]: "Alice Marchetti", [bruno]: "Bruno Castellane" };
for (const [index, otter] of otters.entries()) names[otter] = `Otter Quillfeather${index + 1}`;
for (const [index, lantern] of lanterns.entries()) names[lantern] = `Lantern Wickfield${index + 1}`;

const slackPicture = (name: string) => `https://emoji.example/T1/${name}/a1b2c3.png`;

const backend = useTestBackend({ now: Date.parse("2026-10-13T10:00:00Z") });
let t: TestBackend;
let syncs = 0;

beforeEach(async () => {
  t = backend();
  emojiWorld.reset();
  syncs = 0;
  for (const [member, fullName] of Object.entries(names)) emojiWorld.member(member, { fullName });
  for (const flag of ["emojiWizard", "workspaceSettings"] as const) emojiWorld.flags[flag].add(owner);
  await theCompanyCopyHolds({ team: "otters", name: "Otters", crestImage: "https://images.example/otters-crest.png" }, { team: "lanterns", name: "Lanterns" });
});

describe("the emoji wizard finds an earned emoji in Slack", () => {
  test("the Slack emojis closest to the earned emoji's name come first, the free ones before those another earned emoji or the maintainer holds, each with its picture", async () => {
    slackHas("otter", "otters-wave", "otterly", "lanterns", "party-parrot", "level-5");
    await place("otterly", { kind: "unmapped" });

    const found = await matchesOf({ near: "otters", search: "" });

    expect(found.map(({ name }) => name)).toEqual(["otter", "otters-wave", "otterly"]);
    expect(found).toEqual([
      { name: "otter", image: slackPicture("otter"), free: true },
      { name: "otters-wave", image: slackPicture("otters-wave"), free: true },
      { name: "otterly", image: slackPicture("otterly"), free: false },
    ]);
  });

  test("a search finds the Slack emojis whose names start with any of its words, the closest to the search first", async () => {
    slackHas("hedgehog-otters", "hedgehog", "hedge-fund", "otter");

    const found = await matchesOf({ near: "otters", search: "Hedgehog" });

    expect(found.map(({ name }) => name)).toEqual(["hedgehog", "hedgehog-otters", "hedge-fund"]);
  });

  test("a search keeps the name as typed, underscores and colons included, so an exact Slack name is found even behind 40 names that share its start", async () => {
    slackHas(...Array.from({ length: 45 }, (_, index) => `party_a${String(index).padStart(2, "0")}`), "party_parrot");

    const found = await matchesOf({ near: "otters", search: ":party_parrot:" });

    expect(found[0]).toEqual({ name: "party_parrot", image: slackPicture("party_parrot"), free: true });
  });

  test("a Slack emoji held by another earned emoji reads taken, and an alias is found by the name it is an alias of", async () => {
    await aliceCollects(otters[0]!);
    slackHas("team-lanterns", "lantern-glow");
    emojiWorld.slackHas("T1", { name: "lantern-light", image: slackPicture("lantern-glow"), aliasOf: "lantern-glow" });

    expect(await matchesOf({ near: "team-lanterns", search: "" })).toEqual([
      { name: "lantern-glow", image: slackPicture("lantern-glow"), free: true },
      { name: "team-lanterns", image: slackPicture("team-lanterns"), free: false },
    ]);
  });
});

describe("the emoji wizard offers Slack's standard emoji behind standard-emoji", () => {
  test("a search finds Slack's standard emoji by any of their names, each under its own name with Slack's picture, and a member maps their earned emoji to one", async () => {
    await holds(alice, "team:otters");
    emojiWorld.standardEmoji.add(alice);
    const [plusOne, otter] = [standardEmojiNamed("+1")!, standardEmojiNamed("otter")!];

    expect(await matchesOf({ near: "otters", search: "thumbsup" }, "customAndStandard")).toContainEqual({ name: "+1", image: plusOne.image, free: true });
    expect(await matchesOf({ near: "otters", search: "" }, "customAndStandard")).toContainEqual({ name: "otter", image: otter.image, free: true });

    expect(await mapHeld(alice, "team:otters", "otter")).toBe(true);
    expect(await namesOf("team:otters")).toEqual(["otter"]);
  });

  test("with standard-emoji off, a search finds no standard emoji and mapping to one is refused and writes nothing", async () => {
    await holds(alice, "team:otters");
    const before = await everyTable();

    expect(await matchesOf({ near: "otters", search: "otter" })).toEqual([]);
    expect(await mapHeld(alice, "team:otters", "otter")).toBe(false);
    expect(await everyTable()).toEqual(before);
  });
});

describe("a member maps an earned emoji they hold to a Slack emoji", () => {
  test("a member maps their own earned emoji Slack doesn't have to a free Slack emoji: it is that Slack emoji at once, in Slack and pictured as Slack pictures it, for everyone who holds it", async () => {
    await holds(alice, "team:otters");
    await holds(bruno, "team:otters");
    slackHas("otter");

    expect(await mapHeld(alice, "team:otters", "otter")).toBe(true);

    expect(await namesOf("team:otters")).toEqual(["otter"]);
    expect(await registryRow("otter")).toMatchObject({ emoji: "team:otters", mappedBy: { member: alice, as: "member" } });
  });

  test("a member maps their hype, milestone tier and level emojis too", async () => {
    await aliceCollects(otters[0]!);
    const hype = `hype:${otters[0]}` as const;
    await holds(alice, hype, "milestone:people:bronze", "level:5");
    slackHas("otter-cheer", "first-face-medal", "five");

    for (const [id, to] of [
      [hype, "otter-cheer"],
      ["milestone:people:bronze", "first-face-medal"],
      ["level:5", "five"],
    ] as const) expect(await mapHeld(alice, id, to), id).toBe(true);

    expect(await namesOf(hype, "milestone:people:bronze", "level:5")).toEqual(["otter-cheer", "first-face-medal", "five"]);
  });

  test("an emoji the member doesn't hold, one already in Slack, a Slack emoji another earned emoji holds or the maintainer left unmapped, a name Slack doesn't have and a random drop are refused and write nothing", async () => {
    await holds(alice, "team:otters", "random:spare");
    slackHas("team-lanterns", "spare", "held-back", "team-otters-2");
    await place("held-back", { kind: "unmapped" });
    await place("team-otters-2", { kind: "team", team: "otters" });
    await place("team-otters-2", { kind: "unmapped" });
    slackHas("fresh");
    const before = await everyTable();

    for (const [id, to] of [
      ["team:lanterns", "spare"],
      ["level:10", "spare"],
      ["team:otters", "team-lanterns"],
      ["team:otters", "held-back"],
      ["team:otters", "not-in-slack"],
      ["random:spare", "fresh"],
      ["team:walruses", "fresh"],
      ["nonsense", "fresh"],
    ] as const) expect(await mapHeld(alice, id, to), `${id} to ${to}`).toBe(false);

    expect(await everyTable()).toEqual(before);
  });

  test("an emoji already in Slack is refused: a member never remaps it", async () => {
    await holds(alice, "team:otters");
    await aliceCollects(otters[0]!);
    slackHas("team-otters", "fresh");
    const before = await everyTable();

    expect(await mapHeld(alice, "team:otters", "fresh")).toBe(false);
    expect(await everyTable()).toEqual(before);
  });

  test("the maintainer's mapping is locked for members: once its Slack emoji is gone from Slack, a member still can't map the earned emoji", async () => {
    await holds(alice, "team:otters");
    slackHas("sea-otters", "fresh");
    await place("sea-otters", { kind: "team", team: "otters" });
    slackLoses("sea-otters");
    expect(await namesOf("team:otters")).toEqual(["sea-otters"]);
    const before = await everyTable();

    expect(await mapHeld(alice, "team:otters", "fresh")).toBe(false);
    expect(await everyTable()).toEqual(before);
  });

  test("the maintainer picking the Slack emoji a member mapped takes the mapping over and locks it for members", async () => {
    await holds(alice, "team:otters");
    slackHas("sea-otters", "fresh");
    await mapHeld(alice, "team:otters", "sea-otters");

    expect(await place("sea-otters", { kind: "team", team: "otters" })).toBe(true);

    expect(rowNamed(await appEmojisOf(), "sea-otters").slack).toEqual({ image: slackPicture("sea-otters"), mappedBy: { member: owner, as: "maintainer" } });
    slackLoses("sea-otters");
    expect(await mapHeld(alice, "team:otters", "fresh")).toBe(false);
  });

  test("the maintainer picking an earned emoji's own name, already in Slack, records the maintainer and locks it for members", async () => {
    await holds(alice, "team:otters");
    await aliceCollects(otters[0]!);
    slackHas("team-otters", "fresh");

    expect(await place("team-otters", { kind: "team", team: "otters" })).toBe(true);

    expect(rowNamed(await appEmojisOf(), "team-otters").slack).toEqual({ image: slackPicture("team-otters"), mappedBy: { member: owner, as: "maintainer" } });
    slackLoses("team-otters");
    expect(await mapHeld(alice, "team:otters", "fresh")).toBe(false);
  });
});

describe("the maintainer lists every app emoji, mapped or not", () => {
  test("every earned emoji Slack doesn't have is not mapped, with its picture, what earns it and how many members hold it, the most held first", async () => {
    await aliceCollects(otters[0]!, lanterns[0]!);
    for (const member of [alice, bruno]) {
      await t.seed.insert("teamStickers", { member, workspace: "T1", team: "otters", at: 1, name: "Otters", art: null, emoji: "team-otters" });
      await t.seed.insert("milestoneTiers", { member, milestone: "people", tier: "bronze", at: 1, catalogue: 1 });
      await aPack(member, otters[0]!);
    }
    await aPack(alice, lanterns[0]!);
    await t.seed.insert("memberProgress", { member: bruno, xp: xpToReach(10), pointsSpent: 0 });
    slackHas("team-lanterns");

    const { rows } = await appEmojisOf();
    const notMapped = rows.filter(({ slack }) => slack === null);

    const heldByBoth = notMapped.filter(({ holders }) => holders === 2).map(({ name }) => name);
    expect(heldByBoth, "ties by name").toEqual(heldByBoth.toSorted());
    expect(heldByBoth).toEqual(expect.arrayContaining(["first-face", "otter-quillfeather1-hype", "team-otters"]));
    expect(notMapped[0]!.holders).toBe(2);
    expect(notMapped.find(({ name }) => name === "otter-quillfeather1-hype")).toEqual({ emoji: `hype:${otters[0]}`, kind: "hype", name: "otter-quillfeather1-hype", from: "Otter Quillfeather1", picture: expect.any(String), holders: 2, slack: null });
    expect(notMapped.find(({ name }) => name === "level-10")).toMatchObject({ kind: "level", from: "Level 10", picture: "/emoji/level-10.png", holders: 1 });
    expect(notMapped.find(({ name }) => name === "level-25")).toMatchObject({ holders: 0 });
    expect(notMapped.find(({ name }) => name === "team-otters")).toMatchObject({ kind: "team", from: "Otters", picture: "https://images.example/otters-crest.png" });
    expect(notMapped.some(({ name }) => name === "team-lanterns"), "a name Slack holds is mapped").toBe(false);
    expect(rows.find(({ name }) => name === "team-lanterns")).toMatchObject({ kind: "team", from: "Lanterns", slack: { image: slackPicture("team-lanterns"), mappedBy: null } });
    expect(holdersOrder(notMapped)).toEqual(holdersOrder(notMapped).toSorted((one, other) => other - one));
  });

  test("a mapping shows who set it: a member's name, or the maintainer's; and undoing a member's mapping holds the Slack emoji back and returns the earned emoji to its own name, not in Slack", async () => {
    await holds(alice, "team:otters");
    slackHas("otter", "lantern-glow");
    await mapHeld(alice, "team:otters", "otter");
    await place("lantern-glow", { kind: "team", team: "lanterns" });

    expect(rowNamed(await appEmojisOf(), "otter").slack).toEqual({ image: slackPicture("otter"), mappedBy: { member: alice, as: "member" } });
    expect(rowNamed(await appEmojisOf(), "lantern-glow").slack).toEqual({ image: slackPicture("lantern-glow"), mappedBy: { member: owner, as: "maintainer" } });

    expect(await place("otter", { kind: "unmapped" })).toBe(true);

    expect(rowNamed(await appEmojisOf(), "team-otters")).toMatchObject({ emoji: "team:otters", slack: null });
    expect(await mapHeld(alice, "team:otters", "otter"), "the Slack emoji is held back").toBe(false);
  });

  test("a former teammate's hype emoji stays off the list, since only a current member's hype can be mapped to", async () => {
    await aliceCollects(otters[0]!, lanterns[0]!);
    emojiWorld.members.get(lanterns[0]!)!.current = false;

    const listed = (await appEmojisOf()).rows.map(({ name }) => name);

    expect(listed).toContain("otter-quillfeather1-hype");
    expect(listed).not.toContain("lantern-wickfield1-hype");
  });

  test(`the list answers at most ${mostAppEmojisListed} app emojis, the most held first, and says more wait, within Convex's limits`, async () => {
    await aliceCollects(otters[0]!);
    await t.seed.insert("milestoneTiers", { member: alice, milestone: "people", tier: "bronze", at: 1, catalogue: 1 });
    const crowd = Array.from({ length: crowdRows }, (_, index) => `m_crowd_${index}`);
    for (const [index, member] of crowd.entries()) emojiWorld.member(member, { fullName: `Crowd ${index}` });
    await t.run(async (ctx) => {
      const rows = crowd.map((person, index) => fromDocument(emojiNames, { ...ctx.newRow(), workspace: "T1", emoji: "hype", person, name: `crowd-${index}-hype` }));
      await ctx.tx.insert(emojiNames).values(rows as never);
    });

    const { rows, more } = await appEmojisOf();

    expect(rows).toHaveLength(mostAppEmojisListed);
    expect(more).toBe(true);
    expect(rows.find(({ name }) => name === "first-face")).toMatchObject({ holders: 1 });
  });

  test("the maintainer's wizard searches like a member's and maps through mapSlackEmoji, so it may take a Slack emoji another earned emoji holds", async () => {
    await aliceCollects(otters[0]!);
    slackHas("team-lanterns");

    expect(await matchesOf({ near: "team-otters", search: "lan" })).toEqual([{ name: "team-lanterns", image: slackPicture("team-lanterns"), free: false }]);
    expect(await place("team-lanterns", { kind: "team", team: "otters" })).toBe(true);
    expect(await namesOf("team:otters")).toEqual(["team-lanterns"]);
  });

  test("LP71: while onboarding is on for the maintainer, level 2's emoji is listed under raised_hands, in Slack, with every member at level 2 or above as a holder; while off it is not listed", async () => {
    await aliceCollects(lanterns[0]!);
    await t.seed.insert("memberProgress", { member: alice, xp: xpToReach(2), pointsSpent: 0 });
    await t.seed.insert("memberProgress", { member: bruno, xp: xpToReach(10), pointsSpent: 0 });
    const raisedHands = standardEmojiNamed("raised_hands")!.image;

    expect(rowNamed(await appEmojisOf({ levels: [2, ...everyLevel] }), "raised_hands")).toEqual({ emoji: "level:2", kind: "level", name: "raised_hands", from: "Level 2", picture: raisedHands, holders: 2, slack: { image: raisedHands, mappedBy: null } });

    expect((await appEmojisOf()).rows.some(({ name }) => name === "raised_hands")).toBe(false);
  });
});

describe("AL80: behind admin-hype-emojis, the maintainer lists every current member's hype emoji, named or not", () => {
  test("a member nobody has thanked yet is listed not mapped, under the name their hype emoji takes, and the maintainer's mapping names it at once for whoever earns it later", async () => {
    slackHas("alice-wave");

    const unnamed = rowNamed(await appEmojisOf({ everyHype: true }), "alice-marchetti-hype");
    expect(unnamed).toEqual({ emoji: `hype:${alice}`, kind: "hype", name: "alice-marchetti-hype", from: "Alice Marchetti", picture: expect.any(String), holders: 0, slack: null });
    expect(await place("alice-wave", { kind: "hype", person: alice })).toBe(true);

    expect(rowNamed(await appEmojisOf({ everyHype: true }), "alice-wave")).toMatchObject({ emoji: unnamed.emoji, slack: { image: slackPicture("alice-wave"), mappedBy: { member: owner, as: "maintainer" } } });
    await aliceCollects(alice);
    expect(await namesOf(`hype:${alice}`)).toEqual(["alice-wave"]);
  });

  test("an unnamed row stays not mapped though Slack has an emoji under its name, until the maintainer maps that emoji to it", async () => {
    slackHas("alice-marchetti-hype");

    expect(rowNamed(await appEmojisOf({ everyHype: true }), "alice-marchetti-hype").slack, "before the mapping").toBeNull();
    expect(await place("alice-marchetti-hype", { kind: "hype", person: alice })).toBe(true);

    expect(rowNamed(await appEmojisOf({ everyHype: true }), "alice-marchetti-hype").slack, "after the mapping").toEqual({ image: slackPicture("alice-marchetti-hype"), mappedBy: { member: owner, as: "maintainer" } });
  });

  test("an unnamed row shows the name the member's first thoughtful kudos gives their hype emoji, a name without Latin letters included", async () => {
    const lei = "m_lei" as MemberId;
    emojiWorld.member(lei, { fullName: "李雷" });
    const listed = (await appEmojisOf({ everyHype: true })).rows;
    const shownFor = (fullName: string) => listed.find(({ kind, from }) => kind === "hype" && from === fullName)?.name;
    const shown = { alice: shownFor("Alice Marchetti"), lei: shownFor("李雷") };

    await aliceCollects(alice, lei);

    expect(await namesOf(`hype:${alice}`, `hype:${lei}`)).toEqual([shown.alice, shown.lei]);
    expect(shown.lei).toBe("person-1-hype");
  });

  test("namesakes of a member whose hype emoji is named each show the free name their first thoughtful kudos gives them", async () => {
    const namesakes = ["m_alice_two", "m_alice_three"] as MemberId[];
    await aliceCollects(alice);
    for (const namesake of namesakes) emojiWorld.member(namesake, { fullName: "Alice Marchetti" });
    emojiWorld.member("m_alice_bell", { fullName: "Alice Marchetti Bell" });
    const listed = (await appEmojisOf({ everyHype: true })).rows;
    const shown = new Set(listed.filter(({ kind, from }) => kind === "hype" && from === "Alice Marchetti").map(({ name }) => name));

    await aliceCollects(...namesakes);

    const given = await namesOf(`hype:${alice}`, ...namesakes.map((namesake) => `hype:${namesake}` as const));
    expect(shown).toEqual(new Set(given));
    expect(shown.size).toBe(3);
    const unheld = listed.filter(({ holders }) => holders === 0).map(({ name }) => name);
    expect(unheld).toEqual(unheld.toSorted((one, other) => one.localeCompare(other)));
  });

  test("a former member's hype emoji stays off the list, named or not", async () => {
    await aliceCollects(lanterns[0]!);
    for (const left of lanterns) emojiWorld.members.get(left)!.current = false;

    const listed = (await appEmojisOf({ everyHype: true })).rows.map(({ name }) => name);

    expect(listed).toContain("bruno-castellane-hype");
    expect(listed).not.toContain("lantern-wickfield1-hype");
    expect(listed).not.toContain("lantern-wickfield2-hype");
  });

  test("with admin-hype-emojis off, only the hype emojis already named are listed", async () => {
    await aliceCollects(otters[0]!);

    const listed = (await appEmojisOf()).rows.filter(({ kind }) => kind === "hype").map(({ name }) => name);

    expect(listed).toEqual(["otter-quillfeather1-hype"]);
  });

  test.each([
    { crowd: "distinct names", nameOf: (index: number) => `Crowd ${index}` },
    { crowd: "one shared name", nameOf: () => "Crowd" },
    { crowd: "names without Latin letters", nameOf: () => "李雷" },
  ])(`thousands of unnamed members with $crowd still answer at most ${mostAppEmojisListed} app emojis, the most held first, within Convex's limits`, async ({ nameOf }) => {
    await aliceCollects(otters[0]!);
    await aPack(alice, otters[0]!);
    for (let index = 0; index < crowdRows; index++) emojiWorld.member(`m_crowd_${index}`, { fullName: nameOf(index) });

    const { rows, more } = await appEmojisOf({ everyHype: true });

    expect(rows).toHaveLength(mostAppEmojisListed);
    expect(more).toBe(true);
    expect(rowNamed({ rows, more }, "otter-quillfeather1-hype")).toMatchObject({ holders: 1 });
  });
});

describe("#736: with emoji-mapping-in-place on, the maintainer maps app emojis where they show and members map none", () => {
  beforeEach(() => {
    emojiWorld.flags.emojiMappingInPlace.add(owner).add(alice);
    emojiWorld.flags.emojiWizard.add(alice);
  });

  test("the maintainer maps a team, hype, milestone tier and level emoji they don't hold, Slack's or not, to any Slack emoji, as the maintainer, at once for everyone who holds it", async () => {
    await aliceCollects(lanterns[0]!);
    slackHas("otter", "lantern-cheer", "first-face-medal", "level-5", "five");
    const hype = `hype:${lanterns[0]}` as const;

    for (const [id, to] of [
      ["team:otters", "otter"],
      [hype, "lantern-cheer"],
      ["milestone:people:bronze", "first-face-medal"],
      ["level:5", "five"],
    ] as const) expect(await mapInPlace(id, to), id).toBe(true);

    expect(await namesOf("team:otters", hype, "milestone:people:bronze", "level:5")).toEqual(["otter", "lantern-cheer", "first-face-medal", "five"]);
    const listed = await appEmojisOf();
    for (const name of ["otter", "lantern-cheer", "first-face-medal", "five"]) expect(rowNamed(listed, name).slack, name).toEqual({ image: slackPicture(name), mappedBy: { member: owner, as: "maintainer" } });
  });

  test("the maintainer remaps a member's mapping and takes a Slack emoji another earned emoji holds, which moves that one to a free name", async () => {
    await aliceCollects(otters[0]!);
    slackHas("team-lanterns", "sea-otters");

    expect(await mapInPlace("team:otters", "team-lanterns")).toBe(true);
    expect(await mapInPlace("team:otters", "sea-otters")).toBe(true);

    expect(rowNamed(await appEmojisOf(), "sea-otters")).toMatchObject({ emoji: "team:otters", slack: { image: slackPicture("sea-otters"), mappedBy: { member: owner, as: "maintainer" } } });
    expect(rowNamed(await appEmojisOf(), "team-lanterns-2")).toMatchObject({ emoji: "team:lanterns", slack: null });
  });

  test("the maintainer is refused a name Slack doesn't have, a random drop, and a team, tier, level or person nobody knows, and nothing is written", async () => {
    slackHas("fresh");
    const before = await everyTable();

    for (const [id, to] of [
      ["team:otters", "not-in-slack"],
      ["random:fresh", "fresh"],
      ["team:walruses", "fresh"],
      ["milestone:people", "fresh"],
      ["level:7", "fresh"],
      ["hype:not-a-member", "fresh"],
      ["nonsense", "fresh"],
    ] as const) expect(await mapInPlace(id, to), `${id} to ${to}`).toBe(false);

    expect(await everyTable()).toEqual(before);
  });

  test("getAlbum answers emojiInPlace: admin for the maintainer, member for everyone else, and null while emoji-mapping-in-place, emoji-wizard or workspace-settings says otherwise", async () => {
    expect(await inPlaceFor(owner)).toBe("admin");
    expect(await inPlaceFor(alice)).toBe("member");

    emojiWorld.flags.workspaceSettings.delete(owner);
    expect(await inPlaceFor(owner), "the maintainer without workspace-settings").toBe("member");

    emojiWorld.flags.workspaceSettings.add(owner);
    emojiWorld.flags.emojiWizard.delete(owner);
    expect(await inPlaceFor(owner), "without emoji-wizard").toBeNull();

    emojiWorld.flags.emojiWizard.add(owner);
    emojiWorld.flags.emojiMappingInPlace.clear();
    expect(await inPlaceFor(owner), "without emoji-mapping-in-place").toBeNull();
    expect(await inPlaceFor(alice)).toBeNull();
  });

  test("with emoji-mapping-in-place off a member maps their own emoji as before, and the maintainer can't map one they don't hold", async () => {
    await holds(alice, "team:otters");
    slackHas("otter", "lantern-glow");
    emojiWorld.flags.emojiMappingInPlace.clear();

    expect(await mapHeld(alice, "team:otters", "otter")).toBe(true);
    expect(await mapHeld(owner, "team:lanterns", "lantern-glow")).toBe(false);
  });
});

describe("a mapping made twice changes nothing more", () => {
  test("a member's second mapping of the same emoji is refused, and the maintainer's second mapping in place writes nothing", async () => {
    await holds(alice, "team:otters");
    slackHas("otter", "lantern-glow");

    expect(await mapHeld(alice, "team:otters", "otter")).toBe(true);
    const once = await everyTable();
    expect(await mapHeld(alice, "team:otters", "otter")).toBe(false);
    expect(await everyTable()).toEqual(once);

    expect(await mapInPlace("team:lanterns", "lantern-glow")).toBe(true);
    const inPlace = await everyTable();
    expect(await mapInPlace("team:lanterns", "lantern-glow")).toBe(true);
    expect(await everyTable()).toEqual(inPlace);
  });
});

function holdersOrder(rows: AppEmojiRow[]): number[] {
  return rows.map(({ holders }) => holders);
}

function rowNamed({ rows }: AppEmojiRows, name: string): AppEmojiRow {
  const found = rows.find((each) => each.name === name);
  if (found === undefined) throw new Error(`no app emoji is named ${name}: ${rows.map((each) => each.name).join(", ")}`);
  return found;
}

// What the member earned; a team sticker put in names its team's emoji, as convex/album/teamStickers.ts does (another stack).
async function holds(member: MemberId, ...ids: string[]) {
  emojiWorld.earns(member, ...ids);
  for (const id of ids) if (id.startsWith("team:")) await t.run((ctx) => teamEmojiNameOf(ctx, "T1", id.slice("team:".length)));
}

// posthog.com's sync through its own mutation; its companyTeamsReplaced event runs the registry's job on the worker.
async function theCompanyCopyHolds(...teams: Array<{ team: string; name: string; crestImage?: string }>) {
  await t.run((ctx) => replaceCompanyProfiles(ctx, { asOf: ++syncs, profiles: [], teams: teams.map((team) => ({ ...team, leads: [], people: [] })) }));
  await t.settle();
}

// A thoughtful pack's grant names its recipient's hype emoji (convex/album/packs.ts, S8).
async function aliceCollects(...people: MemberId[]) {
  for (const person of people) await t.run((ctx) => nameHypeEmojiOf(ctx, "T1", person));
}

function aPack(giver: MemberId, recipient: MemberId) {
  return t.seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-12", message: { workspace: "T1", conversation: "C1", message: "1760000000.000100" }, holdsSticker: true, at: 1 });
}

function slackHas(...emoji: string[]) {
  emojiWorld.slackHas("T1", ...emoji.map((name) => ({ name, image: slackPicture(name) })));
}

function slackLoses(name: string) {
  emojiWorld.customEmoji.set("T1", (emojiWorld.customEmoji.get("T1") ?? []).filter((each) => each.name !== name));
}

function matchesOf({ near, search }: { near: string; search: string }, reach: "custom" | "customAndStandard" = "custom") {
  return t.query((ctx) => slackEmojisNear(ctx, "T1", near, search, reach));
}

function mapHeld(member: MemberId, emoji: string, name: string) {
  return t.run((ctx) => mapHeldEmoji(ctx, "T1", member, emoji, name));
}

function mapInPlace(emoji: string, name: string) {
  return t.run((ctx) => mapAppEmojiInPlace(ctx, "T1", owner, emoji, name));
}

function place(name: string, to: EmojiPlace) {
  return t.run((ctx) => placeSlackEmoji(ctx, "T1", name, to, true, { member: owner, as: "maintainer" }));
}

function inPlaceFor(member: MemberId) {
  return t.query((ctx) => emojiInPlaceFor(ctx, member));
}

function appEmojisOf({ levels = everyLevel, everyHype = false }: { levels?: number[]; everyHype?: boolean } = {}) {
  return t.query((ctx) => appEmojisIn(ctx, "T1", levels, everyHype));
}

async function registryRow(name: string) {
  const row = (await t.seed.all("emojiNames")).find((each) => each.name === name);
  return row && { emoji: row.person === undefined ? row.emoji : `hype:${row.person}`, mappedBy: row.mappedBy };
}

async function everyTable() {
  return { emojiNames: await t.seed.all("emojiNames"), secondEmojiNames: await t.seed.all("secondEmojiNames"), emojiNameNumbers: await t.seed.all("emojiNameNumbers"), emojiClasses: await t.seed.all("emojiClasses") };
}

function namesOf(...emojis: EarnedEmojiId[]) {
  return t.query(async (ctx) => {
    const found: Array<string | null> = [];
    for (const id of emojis) found.push(await emojiNameOf(ctx, "T1", id));
    return found;
  });
}
