// The maintainer's map of Slack emoji onto earned emojis over the service, ported from convex/album/emojiMappings.test.ts
// by the cases' own names, and a member's pick of their own hype emoji, written new.
//
// Today's file reads and maps through the website (getEmojiMappings, mapSlackEmoji: S16) and reads the result in the
// album's earned emojis (S9, later in the stack); its people, Slack's custom emoji, the standard-emoji flag and each
// member's level emojis come from Slack and the directory (S3). Here the cases call this module's own reads and
// writes, and those other stacks' reads answer from a world the test gives (service/src/album/testing/emojiWorld.ts). What
// a case proved only through another module stays with that module's port: the hype picker's people (#128, the
// website's), Slack's standard emoji in the listing (S3's slackEmoji), random drops from packs and the album's random
// emojis (S9's randomEmojis), and the website's guards (S16).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { emojiWorld } from "./testing/emojiWorld.ts";
import { replaceCompanyProfiles } from "../companyProfiles/sync.ts";
import { standardEmojiNamed } from "../workspace/standardEmoji.ts";
import type { MemberId } from "../workspace/directory.ts";
import { mostRandomEmojis } from "./emojiClasses.ts";
import { mostSlackEmojiListed, pickOwnHypeEmoji, placeSlackEmoji, slackEmojiMappingsIn, type EmojiPlace, type SlackEmojiMappings } from "./emojiMappings.ts";
import { emojiNameOf, giveEmojiASecondName, nameHypeEmojiOf, type EarnedEmojiId } from "./emojiNames.ts";

vi.mock("../workspace/directory.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "directory"));
vi.mock("../workspace/slackEmoji.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "slackEmoji"));
vi.mock("./levelEmojis.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "levelEmojis"));

const owner = "m_owner" as MemberId;
const alice = "m_alice" as MemberId;
const bruno = "m_bruno" as MemberId;
const otter = "m_otter1" as MemberId;
const lantern = "m_lantern1" as MemberId;
const everyLevel = [5, 10, 15, 20, 25];
const asMaintainer = { member: owner, as: "maintainer" } as const;

const slackPicture = (name: string) => `https://emoji.example/T1/${name}/a1b2c3.png`;

const backend = useTestBackend({ now: Date.parse("2026-10-13T10:00:00Z") });
let t: TestBackend;
let syncs = 0;

beforeEach(async () => {
  t = backend();
  emojiWorld.reset();
  syncs = 0;
  for (const [member, fullName] of [
    [owner, "Mona Keeper"],
    [alice, "Alice Marchetti"],
    [bruno, "Bruno Castellane"],
    [otter, "Otter Quillfeather1"],
    [lantern, "Lantern Wickfield1"],
  ] as const) emojiWorld.member(member, { fullName });
  await theCompanyCopyHolds(...twoTeams());
});

describe("the maintainer maps Slack emojis to earned emojis", () => {
  test("Settings list every Slack custom emoji with its picture, a name the registry holds already mapped to its earned emoji and the rest unmapped, beside every team, milestone, level and person to map to", async () => {
    await aliceCollects(otter);
    slackHas("team-otters", "level-10", "full-of-friends", "otter-quillfeather1-hype", "party-parrot");

    const mappings = await mappingsOf();

    expect(mappings.emoji).toEqual([
      { name: "full-of-friends", image: slackPicture("full-of-friends"), mapping: { kind: "milestone", milestone: "people:gold" } },
      { name: "level-10", image: slackPicture("level-10"), mapping: { kind: "level", level: 10 } },
      { name: "otter-quillfeather1-hype", image: slackPicture("otter-quillfeather1-hype"), mapping: { kind: "hype", person: otter } },
      { name: "party-parrot", image: slackPicture("party-parrot"), mapping: null },
      { name: "team-otters", image: slackPicture("team-otters"), mapping: { kind: "team", team: "otters" } },
    ]);
    expect(mappings.more).toBe(false);
    expect(mappings.randomDrops).toBe(true);
    expect(mappings.teams).toEqual([
      { team: "lanterns", name: "Lanterns" },
      { team: "otters", name: "Otters" },
    ]);
    expect(mappings.milestones.map(({ milestone }) => milestone)).toEqual(["people", "teams", "reach", "hoggies", "thoughtful"].flatMap((milestone) => ["bronze", "silver", "gold", "diamond"].map((tier) => `${milestone}:${tier}`)));
    expect(mappings.milestones.slice(0, 4)).toEqual([
      { milestone: "people:bronze", name: "First face" },
      { milestone: "people:silver", name: "Familiar faces" },
      { milestone: "people:gold", name: "Full of friends" },
      { milestone: "people:diamond", name: "Everyone's album" },
    ]);
    expect(mappings.levels).toEqual(everyLevel);
  });

  test("LP71: while onboarding is on for the maintainer, Settings offer level 2 and list raised_hands as its emoji; while off, raised_hands is Slack's own emoji with no place and mapping to level 2 is refused, writing nothing", async () => {
    await aliceCollects(otter);
    slackHas("party-parrot");
    emojiWorld.standardEmoji.add(owner);
    const raisedHands = standardEmojiNamed("raised_hands")!.image;

    // Onboarding offers level 2 among the maintainer's level emojis (S9's levelEmojis answers the levels).
    const offered = await mappingsOf({ reach: "customAndStandard", levels: [2, ...everyLevel] });
    expect(offered.levels).toEqual([2, ...everyLevel]);
    expect(offered.emoji).toContainEqual({ name: "raised_hands", image: raisedHands, mapping: { kind: "level", level: 2 } });

    emojiWorld.levels.set(owner, everyLevel);
    const withheld = await mappingsOf({ reach: "customAndStandard", levels: everyLevel });
    expect(withheld.levels).toEqual(everyLevel);
    expect(withheld.emoji).toContainEqual({ name: "raised_hands", image: raisedHands, mapping: null });
    const before = await everyTable();
    expect(await place("party-parrot", { kind: "level", level: 2 })).toBe(false);
    expect(await everyTable()).toEqual(before);
  });

  test("a Slack emoji mapped to a team is that team's emoji at once: named and pictured as in Slack, in Slack, and kept by a member who unlocked it before", async () => {
    // What a member who unlocked the team sees is the album's earned emojis' read (S9, later); the registry holds the name.
    await aliceCollects(otter);
    slackHas("hedgehog-otters");

    expect(await place("hedgehog-otters", { kind: "team", team: "otters" })).toBe(true);

    expect(await namesOf("team:otters")).toEqual(["hedgehog-otters"]);
    expect((await mappingsOf()).emoji).toEqual([{ name: "hedgehog-otters", image: slackPicture("hedgehog-otters"), mapping: { kind: "team", team: "otters" } }]);
  });

  test("a Slack emoji maps to a person's hype emoji, a milestone tier's and a level's, each earned emoji taking its name and picture", async () => {
    await aliceCollects(otter);
    slackHas("otter-cheer", "gold-friends", "first-friend", "ten");

    for (const [name, to] of [
      ["otter-cheer", { kind: "hype", person: otter }],
      ["gold-friends", { kind: "milestone", milestone: "people:gold" }],
      ["first-friend", { kind: "milestone", milestone: "people:bronze" }],
      ["ten", { kind: "level", level: 10 }],
    ] as const) expect(await place(name, to), name).toBe(true);

    expect(await namesOf(`hype:${otter}`, "milestone:people:gold", "milestone:people:bronze", "level:10")).toEqual(["otter-cheer", "gold-friends", "first-friend", "ten"]);
  });

  test("a person's hype emoji mapped before their first thoughtful pack keeps that name once the pack earns it", async () => {
    await aliceCollects(bruno);
    slackHas("lantern-cheer");

    await place("lantern-cheer", { kind: "hype", person: lantern });
    await aliceCollects(lantern);

    expect(await namesOf(`hype:${lantern}`)).toEqual(["lantern-cheer"]);
  });

  test("mapping a Slack emoji that names another earned emoji moves it: the other one takes the next free name Slack doesn't have, and reads not in Slack with its catalogue picture", async () => {
    await aliceCollects(otter);
    slackHas("team-otters", "team-otters-2");

    await place("team-otters", { kind: "team", team: "lanterns" });

    expect(await namesOf("team:lanterns", "team:otters")).toEqual(["team-otters", "team-otters-3"]);
    expect(placesOf(await mappingsOf())).toEqual([
      ["team-otters", { kind: "team", team: "lanterns" }],
      ["team-otters-2", null],
    ]);
  });

  test("an earned emoji mapped to a second Slack emoji leaves the first unmapped", async () => {
    await aliceCollects(otter);
    slackHas("team-otters", "sea-otters");

    await place("sea-otters", { kind: "team", team: "otters" });

    expect(placesOf(await mappingsOf())).toEqual([
      ["sea-otters", { kind: "team", team: "otters" }],
      ["team-otters", null],
    ]);
  });

  test.each([
    ["mapping it to another team", { kind: "team", team: "lanterns" }, { kind: "team", team: "lanterns" }],
    ["clearing it", { kind: "unmapped" }, null],
  ] as const)("an earned emoji's second name is listed in its place, and %s takes it from the emoji, which keeps its first name", async (_, to, mapping) => {
    await aliceCollects(otter);
    slackHas("team-otters", "otter-heart");
    await t.run((ctx) => giveEmojiASecondName(ctx, { workspace: "T1", emoji: "team:otters", name: "otter-heart" }));
    expect(placesOf(await mappingsOf()), "before the mapping").toEqual([
      ["otter-heart", { kind: "team", team: "otters" }],
      ["team-otters", { kind: "team", team: "otters" }],
    ]);

    expect(await place("otter-heart", to)).toBe(true);

    expect(placesOf(await mappingsOf()), "after the mapping").toEqual([
      ["otter-heart", mapping],
      ["team-otters", { kind: "team", team: "otters" }],
    ]);
  });

  test("clearing a mapping leaves the Slack emoji unmapped for good, and its earned emoji reads not in Slack under a free name", async () => {
    await aliceCollects(otter);
    slackHas("team-otters");

    expect(await place("team-otters", { kind: "unmapped" })).toBe(true);

    expect((await mappingsOf()).emoji).toEqual([{ name: "team-otters", image: slackPicture("team-otters"), mapping: null }]);
    expect(await namesOf("team:otters")).toEqual(["team-otters-2"]);
    await theCompanyCopyHolds(...twoTeams());
    expect((await mappingsOf()).emoji[0]!.mapping, "after the next company sync").toBeNull();
  });

  test("a Slack emoji the maintainer doesn't have, and a team, milestone, level or person nobody knows, are refused and change nothing; a Slack emoji already in that place only records the maintainer as who mapped it", async () => {
    await aliceCollects(otter);
    slackHas("team-otters", "spare");
    const before = await everyTable();

    for (const [name, to] of [
      ["not-in-slack", { kind: "team", team: "otters" }],
      ["spare", { kind: "team", team: "walruses" }],
      ["spare", { kind: "milestone", milestone: "speed" }],
      ["spare", { kind: "milestone", milestone: "people" }],
      ["spare", { kind: "milestone", milestone: "people:platinum" }],
      ["spare", { kind: "level", level: 7 }],
      ["spare", { kind: "hype", person: "not-a-key" as MemberId }],
    ] as const) expect(await place(name, to), `${name} to ${JSON.stringify(to)}`).toBe(false);
    expect(await everyTable()).toEqual(before);

    expect(await place("team-otters", { kind: "team", team: "otters" })).toBe(true);
    const { emojiNames, ...after } = await everyTable();
    const { emojiNames: _namesBefore, ...beforeWithoutNames } = before;
    expect(after, "mapping a Slack emoji to the place it already has changes nothing else").toEqual(beforeWithoutNames);
    expect(emojiNames.find(({ name }) => name === "team-otters"), "and records the maintainer as who mapped it").toMatchObject({ name: "team-otters", mappedBy: asMaintainer });
  });

  test("a Slack emoji classed random or left unmapped keeps that place when the registry opens, when a person's first pack names their hype emoji and when a later sync adds a team named like it", async () => {
    slackHas("level-5", "lantern-wickfield1-hype", "team-beavers");
    for (const [name, to] of [
      ["level-5", { kind: "random" }],
      ["lantern-wickfield1-hype", { kind: "unmapped" }],
      ["team-beavers", { kind: "random" }],
    ] as const) await place(name, to);

    await aliceCollects(lantern);
    await theCompanyCopyHolds(...twoTeams(), { team: "beavers", name: "Beavers" });

    expect(placesOf(await mappingsOf())).toEqual([
      ["lantern-wickfield1-hype", null],
      ["level-5", { kind: "random" }],
      ["team-beavers", { kind: "random" }],
    ]);
    expect(await namesOf("level:5", `hype:${lantern}`, "team:beavers")).toEqual(["level-5-2", "lantern-wickfield1-2-hype", "team-beavers-2"]);
  });

  test(`at most ${mostRandomEmojis} Slack emojis are random drops; one more is refused`, async () => {
    // The pack that then drops one of them is S9's randomEmojis, later in the stack.
    const names = Array.from({ length: mostRandomEmojis + 1 }, (_, index) => `drop-${String(index).padStart(3, "0")}`);
    slackHas(...names);
    for (const name of names.slice(0, mostRandomEmojis)) expect(await place(name, { kind: "random" }), name).toBe(true);

    expect(await place(names.at(-1)!, { kind: "random" })).toBe(false);
    expect(await t.seed.all("emojiClasses")).toHaveLength(mostRandomEmojis);
  });

  test(`a random drop classed random again, with ${mostRandomEmojis} drops already, keeps its place and writes nothing more`, async () => {
    const names = Array.from({ length: mostRandomEmojis }, (_, index) => `drop-${String(index).padStart(3, "0")}`);
    slackHas(...names);
    for (const name of names) await place(name, { kind: "random" });
    const once = await everyTable();

    expect(await place(names[0]!, { kind: "random" })).toBe(true);
    expect(await everyTable()).toEqual(once);
  });
});

describe("random emojis are dark where random-emojis is off", () => {
  test("with random-emojis off the maintainer reads no random drops place and can't class one, no pack drops one, and a drop already held stays out of the album", async () => {
    // No pack drops one and the album leaves a held drop out: S9's randomEmojis and earned emojis, later in the stack.
    slackHas("party-parrot");

    expect((await mappingsOf({ randomDrops: false })).randomDrops).toBe(false);
    expect(await place("party-parrot", { kind: "random" }, false)).toBe(false);
    expect(await t.seed.all("emojiClasses")).toEqual([]);
  });
});

describe("Settings list at most what one read holds", () => {
  test("past the most Slack emojis one read lists, the listing says more wait", async () => {
    slackHas("party-parrot");
    expect((await mappingsOf()).more).toBe(false);
    emojiWorld.slackHas("T1", ...Array.from({ length: mostSlackEmojiListed }, (_, index) => ({ name: `e-${String(index).padStart(5, "0")}`, image: slackPicture(`e-${index}`) })));

    const full = await mappingsOf();

    expect([full.emoji.length, full.more]).toEqual([mostSlackEmojiListed, true]);
  });
});

describe("a member picks a Slack emoji as their own hype emoji", () => {
  test("a free Slack emoji becomes theirs, mapped by them as a member; picking it again answers picked and writes nothing more", async () => {
    slackHas("alice-sparkle");

    expect(await pickOwn(alice, "alice-sparkle")).toEqual({ kind: "picked" });
    const once = await everyTable();
    expect(await pickOwn(alice, "alice-sparkle")).toEqual({ kind: "picked" });

    expect(await everyTable()).toEqual(once);
    expect(once.emojiNames.find(({ name }) => name === "alice-sparkle")).toMatchObject({ emoji: "hype", person: alice, mappedBy: { member: alice, as: "member" } });
  });

  test("a Slack emoji another place holds is taken, by that place's kind; one Slack doesn't have, or only an alias of, is refused", async () => {
    await aliceCollects(otter);
    slackHas("team-otters", "parrot", "spare");
    emojiWorld.slackHas("T1", { name: "parrot-alias", image: slackPicture("parrot"), aliasOf: "parrot" });
    await place("parrot", { kind: "random" });
    const before = await everyTable();

    expect(await pickOwn(alice, "team-otters")).toEqual({ kind: "taken", by: "team" });
    expect(await pickOwn(alice, "otter-quillfeather1-hype")).toEqual({ kind: "refused" });
    expect(await pickOwn(alice, "parrot")).toEqual({ kind: "taken", by: "random" });
    expect(await pickOwn(alice, "parrot-alias")).toEqual({ kind: "refused" });
    expect(await everyTable()).toEqual(before);

    expect(await pickOwn(bruno, "spare")).toEqual({ kind: "picked" });
    expect(await pickOwn(alice, "spare")).toEqual({ kind: "taken", by: "hype" });
  });
});

function twoTeams() {
  return [
    { team: "otters", name: "Otters" },
    { team: "lanterns", name: "Lanterns" },
  ];
}

// posthog.com's sync through its own mutation; its companyTeamsReplaced event runs the registry's job on the worker.
async function theCompanyCopyHolds(...teams: Array<{ team: string; name: string }>) {
  await t.run((ctx) => replaceCompanyProfiles(ctx, { asOf: ++syncs, profiles: [], teams: teams.map(({ team, name }) => ({ team, name, leads: [], people: [] })) }));
  await t.settle();
}

// Alice's thoughtful kudos grants a pack, whose grant names the recipient's hype emoji (convex/album/packs.ts, S8).
async function aliceCollects(...people: MemberId[]) {
  for (const person of people) await t.run((ctx) => nameHypeEmojiOf(ctx, "T1", person));
}

function slackHas(...names: string[]) {
  emojiWorld.slackHas("T1", ...names.map((name) => ({ name, image: slackPicture(name) })));
}

function mappingsOf({ randomDrops = true, reach = "custom", levels = everyLevel }: { randomDrops?: boolean; reach?: "custom" | "customAndStandard"; levels?: number[] } = {}): Promise<SlackEmojiMappings> {
  return t.query((ctx) => slackEmojiMappingsIn(ctx, "T1", randomDrops, reach, levels));
}

function place(name: string, to: EmojiPlace, randomDrops = true) {
  return t.run((ctx) => placeSlackEmoji(ctx, "T1", name, to, randomDrops, asMaintainer));
}

function pickOwn(member: MemberId, name: string) {
  return t.run((ctx) => pickOwnHypeEmoji(ctx, "T1", member, name));
}

function placesOf({ emoji }: SlackEmojiMappings) {
  return emoji.map(({ name, mapping }) => [name, mapping]);
}

async function everyTable() {
  return { emojiNames: await t.seed.all("emojiNames"), secondEmojiNames: await t.seed.all("secondEmojiNames"), emojiNameNumbers: await t.seed.all("emojiNameNumbers"), emojiClasses: await t.seed.all("emojiClasses") };
}

function namesOf(...emojis: EarnedEmojiId[]) {
  return t.query(async (ctx) => {
    const names: Array<string | null> = [];
    for (const id of emojis) names.push(await emojiNameOf(ctx, "T1", id));
    return names;
  });
}
