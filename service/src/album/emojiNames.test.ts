// The emoji name registry over the service, ported from convex/album/emojiNames.test.ts, case for case and by name.
//
// Today's file drives each case through Slack: a kudos grants a thoughtful pack, whose grant names the recipient's
// hype emoji (convex/album/packs.ts), and posthog.com's sync replaces the company's teams. The packs (S8) and the
// directory (S3) are still stubs in the module map, so here `thanks` names each recipient's hype emoji as the grant
// does, the directory's names come from a world the test gives (service/src/album/testing/emojiWorld.ts), and the company's
// teams change through the ported sync's own mutation, whose companyTeamsReplaced event runs the registry's
// subscriber through the test backend's worker.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { emojiWorld } from "./testing/emojiWorld.ts";
import { replaceCompanyProfiles } from "../companyProfiles/sync.ts";
import { serviceRegistry } from "../registry.ts";
import type { MemberId } from "../workspace/directory.ts";
import { emojiNameOf, giveEmojiASecondName, nameHypeEmojiOf, reserveSharedEmojiNames, reserveTeamNamesAfterTheSync, type EarnedEmojiId } from "./emojiNames.ts";

vi.mock("../workspace/directory.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "directory"));
vi.mock("../workspace/slackEmoji.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "slackEmoji"));

type Team = { slug: string; name: string };

const backend = useTestBackend({ now: Date.parse("2026-10-13T10:00:00Z") });
let t: TestBackend;
let syncs = 0;

beforeEach(() => {
  t = backend();
  emojiWorld.reset();
  syncs = 0;
});

describe("an earned emoji's name never moves", () => {
  test("the first kudos, short or not, reserves the level, every milestone tier's and the company team names before it names the hype emoji of the person it thanked", async () => {
    await companyTeams(team("lanterns", "Lanterns"), team("kites", "Kites"));
    const wren = aMember("m_wren", "Wren Halloway");

    await thanks(wren);

    expect(await namesOf("level:5", "level:10", "level:15", "level:20", "level:25")).toEqual(["level-5", "level-10", "level-15", "level-20", "level-25"]);
    expect(await namesOf("milestone:people:bronze", "milestone:people:silver", "milestone:people:gold", "milestone:people:diamond")).toEqual(["first-face", "familiar-faces", "full-of-friends", "everyone-s-album"]);
    expect(await namesOf("milestone:teams:gold", "milestone:reach:gold", "milestone:hoggies:gold", "milestone:thoughtful:gold")).toEqual(["most-of-the-company", "well-travelled", "hoarder", "heart-of-the-team"]);
    expect(await namesOf("milestone:hoggies:bronze", "milestone:thoughtful:diamond")).toEqual(["curious", "patron-of-praise"]);
    expect(await namesOf("team:lanterns", "team:kites")).toEqual(["team-lanterns", "team-kites"]);
    expect(await hypeNameOf(wren)).toBe("wren-halloway-hype");
  });

  test("two namesakes get the name and its first free number, and a namesake who joins and leaves after the first was named moves nothing", async () => {
    const first = aMember("m_sam_1", "Sam Rivera");
    const second = aMember("m_sam_2", "Sam Rivera");
    await thanks(first);
    await thanks(second);
    const third = aMember("m_sam_3", "Sam Rivera");
    emojiWorld.members.get(third)!.current = false;
    await thanks(first);

    expect([await hypeNameOf(first), await hypeNameOf(second), await hypeNameOf(third)]).toEqual(["sam-rivera-hype", "sam-rivera-2-hype", null]);
  });

  test("a hype name is the slug of the person's full name, not their Slack display name", async () => {
    // The directory answers the full name (S3's fullNameOf); the display name "sam" never reaches the registry.
    const sam = aMember("m_sam", "Sam Rivera");

    await thanks(sam);

    expect(await hypeNameOf(sam)).toBe("sam-rivera-hype");
  });

  test("a rename keeps the name a person's hype emoji was given", async () => {
    const wren = aMember("m_wren", "Wren Halloway");
    await thanks(wren);

    emojiWorld.members.get(wren)!.fullName = "Wren Okafor";
    const namesake = aMember("m_wren_2", "Wren Halloway");
    await thanks(namesake);

    expect([await hypeNameOf(wren), await hypeNameOf(namesake)]).toEqual(["wren-halloway-hype", "wren-halloway-2-hype"]);
  });

  test("a name with accents keeps its letters, and a name with no Latin letter becomes person-n-hype in registry order", async () => {
    const zoe = aMember("m_zoe", "Zoë Ångström-Núñez");
    const lei = aMember("m_lei", "李雷");
    const mei = aMember("m_mei", "韩梅梅");

    await thanks(zoe, lei, mei);

    expect([await hypeNameOf(zoe), await hypeNameOf(lei), await hypeNameOf(mei)]).toEqual(["zoe-angstrom-nunez-hype", "person-1-hype", "person-2-hype"]);
  });

  test("a team named team-<slug> of its name gets the first free number where another team took it, a team with no Latin letter becomes team-n, and a team that appears later is reserved by the next sync", async () => {
    await companyTeams(team("hoarders", "Hoarders"), team("hoarders-guild", "Hoarders!"), team("kanji", "数据"));
    await thanks(aMember("m_wren", "Wren Halloway"));

    await companyTeams(team("hoarders", "Hoarders"), team("hoarders-guild", "Hoarders!"), team("kanji", "数据"), team("lanterns", "Lanterns"));
    await companyTeams(team("lanterns", "Lantern Bearers"));

    expect(await namesOf("team:hoarders", "team:hoarders-guild", "team:kanji", "team:lanterns")).toEqual(["team-hoarders", "team-hoarders-2", "team-1", "team-lanterns"]);
  });

  test("a team named like a hype emoji keeps its name when a first pack comes before the sync's reservation runs", async () => {
    await thanks(aMember("m_wren", "Wren Halloway"));
    const sam = aMember("m_sam", "Team Sam Rivera");
    // The sync keeps the team; its companyTeamsReplaced subscriber is still a pending job when the pack is granted.
    await t.run((ctx) => replaceCompanyProfiles(ctx, { asOf: ++syncs, profiles: [], teams: [companyTeam(team("sam-rivera-hype", "Sam Rivera Hype"))] }));

    await thanks(sam);

    expect([await hypeNameOf(sam), ...(await namesOf("team:sam-rivera-hype"))]).toEqual(["team-sam-rivera-2-hype", "team-sam-rivera-hype"]);
  });

  test("a registry opened before team emojis were named team-<slug> moves every team nobody mapped to team-<slug> at the next sync, even where Slack already has that name, keeping a mapped team's name and every row, and a later rename moves nothing", async () => {
    const teams = [team("lanterns", "Lanterns"), team("kites", "Kites"), team("people-ops", "People & Ops")];
    await companyTeams(...teams);
    const maintainer = aMember("m_maintainer", "Maya Brandt");
    emojiWorld.slackHas("T1", { name: "team-lanterns", image: "https://emoji.example/T1/team-lanterns.png" }, { name: "team-people-ops", image: "https://emoji.example/T1/team-people-ops.png" });
    await aRegistryOpenedBeforeTheTeamPrefix([
      { emoji: "team:lanterns", name: "lanterns" },
      { emoji: "team:kites", name: "kites", mappedBy: { member: maintainer, as: "maintainer" } },
      { emoji: "team:people-ops", name: "people-ops" },
      { emoji: "team:otters", name: "otters" },
    ]);
    const teamRowsBefore = await teamEmojisNamed();

    await companyTeams(...teams);
    const moved = await namesOf("team:lanterns", "team:kites", "team:people-ops", "team:otters");
    await companyTeams(team("lanterns", "Lantern Bearers"), team("kites", "Kites"), team("people-ops", "People & Ops"));

    expect([moved, await teamEmojisNamed()], "a team that left posthog.com moves to team- and its own slug").toEqual([["team-lanterns", "kites", "team-people-ops", "team-otters"], teamRowsBefore]);
    expect(await namesOf("team:lanterns", "team:kites", "team:people-ops", "team:otters"), "after the team's rename").toEqual(moved);
  });

  test("a bare team name the registry still holds after a rollback, or one whose team was renamed to a name with no Latin letter, moves at the next sync", async () => {
    await companyTeams(team("lanterns", "Lanterns"));
    await thanks(aMember("m_wren", "Wren Halloway"));
    await namedByTheCodeBeforeTheTeamPrefix({ emoji: "team:kites", name: "kites" }, { emoji: "team:kanji", name: "kanji-club" });

    await companyTeams(team("lanterns", "Lanterns"), team("kites", "Kites"), team("kanji", "数据"));

    expect(await namesOf("team:lanterns", "team:kites", "team:kanji")).toEqual(["team-lanterns", "team-kites", "team-1"]);
  });

  test("a legacy team name already under team- stays, so the team whose team-<slug> name it holds gets the next number", async () => {
    const teams = [team("lanterns", "Lanterns"), team("team-lanterns", "Team Lanterns")];
    await companyTeams(...teams);
    await aRegistryOpenedBeforeTheTeamPrefix([
      { emoji: "team:lanterns", name: "lanterns" },
      { emoji: "team:team-lanterns", name: "team-lanterns" },
    ]);

    await companyTeams(...teams);

    expect(await namesOf("team:lanterns", "team:team-lanterns")).toEqual(["team-lanterns-2", "team-lanterns"]);
  });

  test("a registry opened with team-<slug> names keeps a renamed team's name at the next sync", async () => {
    await companyTeams(team("lanterns", "Lanterns"));
    await thanks(aMember("m_wren", "Wren Halloway"));

    await companyTeams(team("lanterns", "Lantern Bearers"));

    expect(await namesOf("team:lanterns")).toEqual(["team-lanterns"]);
  });

  test("a hype name is lower-cased, accent-free, one hyphen per run of other characters, trimmed and cut to 80 characters before its suffix", async () => {
    const friends = aMember("m_friends", "  Ünïcode -- & Friends!! ");
    const long = aMember("m_long", `${"A".repeat(79)} B`);

    await thanks(friends, long);

    expect([await hypeNameOf(friends), await hypeNameOf(long)]).toEqual(["unicode-friends-hype", `${"a".repeat(79)}-hype`]);
  });
});

describe("an earned emoji's second name", () => {
  test("a team the next sync adds, named like a milestone tier's second name, takes the next number, and the tier keeps its first name", async () => {
    await thanks(aMember("m_wren", "Wren Halloway"));
    expect(await giveASecondName("milestone:thoughtful:bronze", "team-kites")).toBe(true);

    await companyTeams(team("kites", "Kites"));

    expect(await namesOf("team:kites", "milestone:thoughtful:bronze")).toEqual(["team-kites-2", "first-thank-you"]);
  });

  test("a name another emoji holds, a classed name, another second name and an emoji the registry hasn't named are refused, writing nothing", async () => {
    await thanks(aMember("m_wren", "Wren Halloway"));
    await giveASecondName("milestone:thoughtful:bronze", "heart-hog");
    await t.seed.insert("emojiClasses", { workspace: "T1", name: "party-parrot", class: "random" });
    const before = await t.seed.all("secondEmojiNames");

    for (const [emoji, name] of [
      ["milestone:thoughtful:bronze", "level-5"],
      ["milestone:thoughtful:bronze", "party-parrot"],
      ["milestone:people:bronze", "heart-hog"],
      ["team:nobody", "nobodys-heart"],
    ] as const) expect(await giveASecondName(emoji, name), `${emoji} as ${name}`).toBe(false);

    expect(await t.seed.all("secondEmojiNames")).toEqual(before);
  });
});

describe("running a job or a naming twice changes nothing more", () => {
  test("the companyTeamsReplaced subscriber is the registry's job under its Convex name, and a second run of it, or of the operator's reservation, writes nothing", async () => {
    await companyTeams(team("lanterns", "Lanterns"), team("kites", "Kites"));
    await thanks(aMember("m_wren", "Wren Halloway"));
    await namedByTheCodeBeforeTheTeamPrefix({ emoji: "team:otters", name: "otters" });
    const event = { type: "companyTeamsReplaced" as const, at: 1, fact: "f1" };

    await t.run((ctx) => reserveTeamNamesAfterTheSync(ctx, { event }));
    const once = await registry();
    await t.run((ctx) => reserveTeamNamesAfterTheSync(ctx, { event }));
    await t.run((ctx) => reserveSharedEmojiNames(ctx, {}));
    await t.run((ctx) => reserveSharedEmojiNames(ctx, { workspace: "T1" }));

    expect(await registry()).toEqual(once);
    expect(serviceRegistry.subscribers.get("companyTeamsReplaced")?.map(({ job }) => job.name)).toContain("album.emojiNames.reserveTeamNamesAfterTheSync");
    for (const name of ["album.emojiNames.giveEmojiASecondName", "album.emojiNames.reserveSharedEmojiNames"]) expect(serviceRegistry.jobs.has(name), name).toBe(true);
  });

  test("naming a hype emoji twice keeps its one row and its number, and a second name given twice is refused the second time", async () => {
    const first = aMember("m_sam_1", "Sam Rivera");
    const second = aMember("m_sam_2", "Sam Rivera");
    await thanks(first, second);
    const once = await registry();

    await thanks(first, second);
    expect(await registry()).toEqual(once);

    expect(await giveASecondName("milestone:thoughtful:bronze", "heart-hog")).toBe(true);
    expect(await giveASecondName("milestone:thoughtful:bronze", "heart-hog")).toBe(false);
    expect(await t.seed.all("secondEmojiNames")).toHaveLength(1);
  });
});

function team(slug: string, name: string): Team {
  return { slug, name };
}

function companyTeam({ slug, name }: Team) {
  return { team: slug, name, leads: [], people: [slug.length] };
}

// posthog.com's sync, through its own mutation; its companyTeamsReplaced event runs the registry's job on the worker.
async function companyTeams(...teams: Team[]) {
  await t.run((ctx) => replaceCompanyProfiles(ctx, { asOf: ++syncs, profiles: [], teams: teams.map(companyTeam) }));
  await t.settle();
}

function aMember(member: string, fullName: string): MemberId {
  emojiWorld.member(member, { fullName });
  return member as MemberId;
}

// A thoughtful pack's grant names its recipient's hype emoji, one recipient after another (convex/album/packs.ts).
async function thanks(...recipients: MemberId[]) {
  for (const recipient of recipients) await t.run((ctx) => nameHypeEmojiOf(ctx, "T1", recipient));
}

function giveASecondName(emoji: string, name: string) {
  return t.run((ctx) => giveEmojiASecondName(ctx, { workspace: "T1", emoji, name }));
}

type OldRegistryRow = { emoji: EarnedEmojiId; name: string; mappedBy?: { member: MemberId; as: "member" | "maintainer" } };

function aRegistryOpenedBeforeTheTeamPrefix(teamRows: OldRegistryRow[]) {
  return namedByTheCodeBeforeTheTeamPrefix({ emoji: "level:5", name: "level-5" }, ...teamRows);
}

async function namedByTheCodeBeforeTheTeamPrefix(...rows: OldRegistryRow[]) {
  for (const { emoji: key, name, mappedBy } of rows) await t.seed.insert("emojiNames", { workspace: "T1", emoji: key, name, ...(mappedBy ? { mappedBy } : {}) });
}

async function teamEmojisNamed() {
  return (await t.seed.all("emojiNames")).flatMap(({ emoji: key }) => (key.startsWith("team:") ? [key] : [])).toSorted();
}

async function registry() {
  return { names: await t.seed.all("emojiNames"), numbers: await t.seed.all("emojiNameNumbers"), second: await t.seed.all("secondEmojiNames") };
}

function namesOf(...emojis: EarnedEmojiId[]) {
  return t.query(async (ctx) => {
    const names: Array<string | null> = [];
    for (const id of emojis) names.push(await emojiNameOf(ctx, "T1", id));
    return names;
  });
}

function hypeNameOf(person: MemberId) {
  return t.query((ctx) => emojiNameOf(ctx, "T1", `hype:${person}`));
}
