// The sticker book, team pages, pets and the forge on the service's transaction: the bodies of S10's second slice,
// driven through S4's test backend on Postgres with S3's directory and S12's company profiles. A path that reaches a body
// another stack hasn't ported yet waits on it by `waitsOn`, so every step before that body stays proven.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { definitionsStored, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { boughtCrateKeyOf } from "../album/hoggies/boughtCrates.ts";
import { catalogue, hoggieNamed, hoggiesOfRarity } from "../album/hoggies/catalogue.ts";
import type { CrateKey } from "../album/hoggies/crateKey.ts";
import { recordFind, tallyOf } from "../album/hoggies/drops.ts";
import { dropForged, forge } from "../album/hoggies/forge.ts";
import { makePetOf, petOf, petsIn } from "../album/hoggies/pet.ts";
import { waitingPacksOf } from "../album/hoggies/waitingPacks.ts";
import {
  albumStickersOf,
  holdsAnySticker,
  inTheAlbumOf,
  isPutInFrom,
  nextStickerHolderAfter,
  peopleHeldBy,
  recordHistorySticker,
  recordPackSticker,
  recordReactionsSticker,
} from "../album/stickers.ts";
import { teamsUnlockedIn } from "../album/teamStickers.ts";
import type { KudosGivenEvent } from "../bus/events.ts";
import type { Id } from "../db/columns.ts";
import { flagExposures } from "../db/schema/index.ts";
import type { AwardId } from "../engine/awards.ts";
import { createRegistry } from "../registration.ts";
import { memberRowsIn, type MemberId } from "../workspace/directory.ts";
import { completionRecordsInOrder, completionsOf, teamsCompletedBy } from "./completionRecords.ts";
import { checkTeamPages } from "./completions.ts";
import { stickersShownTo, teamSpiritAppliesTo, teamSpiritShownTo } from "./flag.ts";
import { recordStickersOf, stickersNewestFirst } from "./records.ts";
import { registration } from "./registration.ts";
import { isFull, teamPagesOf } from "./teamPages.ts";

const at = Date.parse("2026-10-14T10:00:00Z");
const hour = 60 * 60 * 1000;
const backendOf = useTestBackend({ now: at });

// Only the stickers domain subscribes, so a kudos ends in the stickers' own path, not in another domain's subscriber.
const stickersAlone = createRegistry({ stickers: registration });

function backend(options: Parameters<typeof backendOf>[0] = {}) {
  const t = backendOf(options);
  return {
    ...t,
    flagsOn: (...keys: string[]) => definitionsStored(t.operations, ...keys.map(onForEveryone)),
    exposures: () => t.query(async ({ tx }) => (await tx.select().from(flagExposures)).map(({ member, flag }) => ({ member, flag }))),
    member: (user: string, realName: string) => t.seed.insert("members", { workspace: "T1", user, kind: "member", name: realName, realName }) as Promise<MemberId>,
  };
}

type Backend = ReturnType<typeof backend>;

async function aTeam(...alsoOn: string[]) {
  return aTeamOn(backend(), ...alsoOn);
}

async function aTeamOn(t: Backend, ...alsoOn: string[]) {
  await t.seed.insert("workspaceKeys", { workspace: "T1", workspaceKey: "workspace-key" });
  await t.flagsOn("collection", ...alsoOn);
  return { t, alice: await t.member("U_ALICE", "Alice Archer"), bob: await t.member("U_BOB", "Bob Brook"), carol: await t.member("U_CAROL", "Carol Crane") };
}

function find(t: Backend, member: MemberId, crate: CrateKey, hoggie: string) {
  return t.run((ctx) => recordFind(ctx, member, crate, { hoggie, rarity: hoggieNamed(hoggie)!.rarity }, ctx.now, { waits: false }));
}

const award = (n: number) => `award-${n}` as AwardId;

/** A stored award, as the engine records one, so reads of the first award between two people find it. */
function anAward(t: Backend, giver: MemberId, recipient: MemberId, when = at, message = "1.000100") {
  return t.seed.insert("awards", { workspace: "T1", conversation: "C1", message, giver, recipient, kudos: 1, day: "2026-10-14", at: when }) as Promise<AwardId>;
}

function kudosGiven(giver: MemberId, awards: KudosGivenEvent["awards"]): KudosGivenEvent {
  return {
    type: "kudosGiven",
    workspace: "T1",
    message: { workspace: "T1", conversation: "C1", message: "1.000100" },
    giver,
    awards,
    via: "message",
    kudosEmoji: "hedgehog",
    annotations: {},
    allowance: { dailyOpening: 5, dailyLeft: 4 },
    skippedMentions: 0,
    retry: false,
    inThread: false,
    day: "2026-10-14",
    at,
  };
}

beforeEach(() => {
  vi.stubEnv("HOGGIE_DRAW_SECRET", "draw-test");
  postHogDeciding("sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the album's stickers", () => {
  test("a member holds one sticker of each other person, from history, reactions or a pack, whichever came first", async () => {
    const { t, alice, bob, carol } = await aTeam();
    const pack = "pack-1" as Id<"thoughtfulPacks">;

    await t.run((ctx) => recordHistorySticker(ctx, alice, bob, at));
    await t.run((ctx) => recordReactionsSticker(ctx, alice, bob, at + hour));
    const fromThePack = await t.run((ctx) => recordPackSticker(ctx, alice, carol, pack, at + hour));
    const again = await t.run((ctx) => recordPackSticker(ctx, alice, carol, pack, at + 2 * hour));
    const ofThemself = await t.run((ctx) => recordPackSticker(ctx, alice, alice, pack, at));
    await t.run((ctx) => recordReactionsSticker(ctx, alice, alice, at));

    expect([fromThePack, again, ofThemself]).toEqual([true, false, false]);
    expect((await t.seed.all("albumStickers")).map(({ member, person, from, at }) => ({ member, person, from, at })).toSorted((one, other) => one.at - other.at)).toEqual([
      { member: alice, person: bob, from: "history", at },
      { member: alice, person: carol, from: "pack", at: at + hour },
    ]);
    expect(await t.query((ctx) => inTheAlbumOf(ctx, alice, bob))).toBe(true);
    expect(await t.query((ctx) => inTheAlbumOf(ctx, bob, alice))).toBe(false);
    expect(await t.query((ctx) => isPutInFrom(ctx, alice, carol, pack))).toBe(true);
    expect(await t.query((ctx) => isPutInFrom(ctx, alice, bob, pack))).toBe(false);
    expect(await t.query((ctx) => isPutInFrom(ctx, alice, carol, "pack-2" as Id<"thoughtfulPacks">))).toBe(false);
  });

  test("lists a member's stickers by person, at most so many, and walks the holders in member order", async () => {
    const { t, alice, bob, carol } = await aTeam();
    await t.run((ctx) => recordHistorySticker(ctx, alice, bob, at));
    await t.run((ctx) => recordHistorySticker(ctx, alice, carol, at + hour));
    await t.run((ctx) => recordHistorySticker(ctx, carol, bob, at));
    const byPerson = [bob, carol].toSorted();
    const holders = [alice, carol].toSorted();

    expect(await t.query((ctx) => albumStickersOf(ctx, alice, 1))).toEqual({ stickers: [{ person: byPerson[0], at: byPerson[0] === bob ? at : at + hour }], more: true });
    expect((await t.query((ctx) => albumStickersOf(ctx, alice, 2))).more).toBe(false);
    expect(await t.query((ctx) => peopleHeldBy(ctx, alice))).toEqual(new Set([bob, carol]));
    expect(await t.query((ctx) => holdsAnySticker(ctx, bob))).toBe(false);
    expect(await t.query((ctx) => holdsAnySticker(ctx, carol))).toBe(true);
    expect(await t.query((ctx) => nextStickerHolderAfter(ctx, null))).toBe(holders[0]);
    expect(await t.query((ctx) => nextStickerHolderAfter(ctx, holders[0]!))).toBe(holders[1]);
    expect(await t.query((ctx) => nextStickerHolderAfter(ctx, holders[1]!))).toBeNull();
  });
});

describe("pets and the forge", () => {
  test("a member's pet is a hoggie they own, one per member, and the workspace's pets skip a hoggie the catalogue dropped", async () => {
    const { t, alice, bob } = await aTeam();
    const [first, second] = hoggiesOfRarity("common");
    const owner = { workspace: "T1", member: alice };

    expect(await t.run((ctx) => makePetOf(ctx, owner, first!.hoggie))).toBeNull();
    await find(t, alice, "quest:week-1", first!.hoggie);
    await find(t, alice, "quest:week-2", second!.hoggie);
    expect(await t.run((ctx) => makePetOf(ctx, owner, first!.hoggie))).toBe(first!.hoggie);
    expect(await t.run((ctx) => makePetOf(ctx, owner, second!.hoggie))).toBe(second!.hoggie);
    await t.seed.insert("petHoggies", { workspace: "T1", member: bob, hoggie: "a-retired-hoggie" });

    expect(await t.seed.all("petHoggies")).toHaveLength(2);
    expect(await t.query((ctx) => petOf(ctx, owner))).toBe(second!.hoggie);
    expect(await t.query((ctx) => petOf(ctx, { workspace: "T2", member: alice }))).toBeNull();
    expect(await t.query((ctx) => petsIn(ctx, "T1"))).toEqual([{ person: alice, hoggie: second!.hoggie, name: second!.name, rarity: second!.rarity }]);
  });

  test("a forged drop is a hoggie of the next rarity the member doesn't hold yet, dropped once, and a malformed request forges nothing", async () => {
    const { t, alice } = await aTeam();
    const common = hoggiesOfRarity("common")[0]!.hoggie;
    const uncommons = hoggiesOfRarity("uncommon").map(({ hoggie }) => hoggie);
    for (const [n, hoggie] of uncommons.slice(0, -1).entries()) await find(t, alice, `quest:week-${n}`, hoggie);

    await t.run((ctx) => dropForged(ctx, alice, "forge:request-1", common, at));
    await t.run((ctx) => dropForged(ctx, alice, "forge:request-1", common, at + hour));
    await t.run((ctx) => dropForged(ctx, alice, "forge:request-2", "a-retired-hoggie", at));

    const forged = (await t.seed.all("drops")).filter(({ crate }) => crate.startsWith("forge:"));
    expect(forged).toEqual([expect.objectContaining({ crate: "forge:request-1", hoggie: uncommons.at(-1), rarity: "uncommon", at })]);
    expect(await t.run((ctx) => forge(ctx, { workspace: "T1", member: alice }, common, "not a request!", at))).toBeNull();
  });

  waitsOn(["S8"], "forging spends three spares of a held hoggie for one face-down item per request", async () => {
    const { t, alice } = await aTeam();
    const common = hoggiesOfRarity("common")[0]!.hoggie;
    for (let n = 0; n < 4; n++) await find(t, alice, `quest:week-${n}`, common);
    const owner = { workspace: "T1", member: alice };

    const item = await t.run((ctx) => forge(ctx, owner, common, "request-1", at));
    const again = await t.run((ctx) => forge(ctx, owner, common, "request-1", at + hour));

    expect(again).toBe(item);
    expect((await t.query((ctx) => tallyOf(ctx, alice, common)))?.count).toBe(1);
  });

  waitsOn(["S6"], "waiting packs list the longest waiting first, equal waits in crate number order, numbered", async () => {
    const { t, alice } = await aTeam();
    await t.seed.insert("boughtCrates", { member: alice, crate: boughtCrateKeyOf(10), n: 10, boughtAt: at });
    await t.seed.insert("boughtCrates", { member: alice, crate: boughtCrateKeyOf(3), n: 3, boughtAt: at + hour });
    await t.seed.insert("boughtCrates", { member: alice, crate: boughtCrateKeyOf(2), n: 2, boughtAt: at });

    expect(await t.query((ctx) => waitingPacksOf(ctx, alice))).toEqual({
      packs: [
        { crate: "bought:2", kind: "bought", n: 1 },
        { crate: "bought:10", kind: "bought", n: 2 },
        { crate: "bought:3", kind: "bought", n: 3 },
      ],
      morePacks: false,
    });
  });

  waitsOn(["S6"], "waiting packs list fifty, and say when more wait", async () => {
    const { t, alice, bob } = await aTeam();
    for (let n = 1; n <= 51; n++) await t.seed.insert("boughtCrates", { member: alice, crate: boughtCrateKeyOf(n), n, boughtAt: at + n });
    for (let n = 1; n <= 50; n++) await t.seed.insert("boughtCrates", { member: bob, crate: boughtCrateKeyOf(n), n, boughtAt: at + n });

    const [ofAlice, ofBob] = await Promise.all([t.query((ctx) => waitingPacksOf(ctx, alice)), t.query((ctx) => waitingPacksOf(ctx, bob))]);

    expect([ofAlice.packs.length, ofAlice.morePacks, ofAlice.packs.at(-1)?.crate]).toEqual([50, true, "bought:50"]);
    expect([ofBob.packs.length, ofBob.morePacks]).toEqual([50, false]);
  });
});

describe("stickers of people", () => {
  test("a member's stickers read newest first, and a pair that already holds each other's records none", async () => {
    const { t, alice, bob, carol } = await aTeam();
    await t.seed.insert("stickers", { member: alice, person: bob, firstAward: award(1), firstAt: at });
    await t.seed.insert("stickers", { member: alice, person: carol, firstAward: award(2), firstAt: at + hour });
    await t.seed.insert("stickers", { member: bob, person: alice, firstAward: award(1), firstAt: at });

    expect(await t.query((ctx) => stickersNewestFirst(ctx, alice))).toEqual([
      { person: carol, firstAward: award(2), firstAt: at + hour },
      { person: bob, firstAward: award(1), firstAt: at },
    ]);
    expect(await t.run((ctx) => recordStickersOf(ctx, { giver: alice, recipient: bob }))).toEqual([]);
    expect(await t.run((ctx) => recordStickersOf(ctx, { giver: alice, recipient: alice }))).toEqual([]);
    expect(await t.seed.all("stickers")).toHaveLength(3);
  });

  test("a kudos gives the giver and the recipient each other's sticker from their first award, and starts the workspace's backfill", async () => {
    const { t, alice, bob } = await aTeamOn(backend({ registry: stickersAlone }));
    const first = await anAward(t, alice, bob);

    await t.run((ctx) => ctx.publish(kudosGiven(alice, [{ award: first, giver: alice, recipient: bob, kudos: 1 }])));
    await t.settle();

    expect((await t.seed.all("stickers")).map(({ member, person, firstAward, firstAt }) => ({ member, person, firstAward, firstAt }))).toEqual(
      expect.arrayContaining([
        { member: alice, person: bob, firstAward: first, firstAt: at },
        { member: bob, person: alice, firstAward: first, firstAt: at },
      ]),
    );
    expect((await t.published()).filter(({ type }) => type === "stickersCollected")).not.toEqual([]);
    expect(await t.seed.all("stickerBackfills")).toEqual([expect.objectContaining({ workspace: "T1", isDone: true })]);
  });

  test("a kudos of more awards than one job records goes on in the next, and every pair gets its stickers once", async () => {
    const { t, alice } = await aTeamOn(backend({ registry: stickersAlone }));
    const recipients: MemberId[] = [];
    for (let n = 0; n < 51; n++) recipients.push(await t.member(`U_R${n}`, `Rae ${n}`));
    const awards = [];
    for (const recipient of recipients) awards.push({ award: await anAward(t, alice, recipient), giver: alice, recipient, kudos: 1 });
    const event = kudosGiven(alice, awards);

    await t.run((ctx) => ctx.publish(event));
    await t.settle();
    await t.run((ctx) => ctx.publish(event));
    await t.settle();

    const stickers = await t.seed.all("stickers");
    expect(stickers).toHaveLength(2 * 51);
    expect(new Set(stickers.filter(({ member }) => member === alice).map(({ person }) => person))).toEqual(new Set(recipients));
  });

  test("the sticker book shows by sticker-book, and Team Spirit where the book and its team pages show, exposed when it applies", async () => {
    const { t, alice } = await aTeam();
    expect(await t.query((ctx) => stickersShownTo(ctx, alice))).toBe(false);

    await t.flagsOn("collection", "sticker-book", "team-spirit");
    expect(await t.query((ctx) => stickersShownTo(ctx, alice))).toBe(true);
    expect(await t.query((ctx) => teamSpiritShownTo(ctx, alice))).toBe(false);

    await t.flagsOn("collection", "sticker-book", "team-spirit", "team-pages");
    expect(await t.query((ctx) => teamSpiritShownTo(ctx, alice))).toBe(true);
    expect(await t.run((ctx) => teamSpiritAppliesTo(ctx, alice))).toBe(true);
    expect(await t.exposures()).toEqual([{ member: alice, flag: "team-spirit" }]);
  });
});

describe("team pages", () => {
  async function onTheCompanySite(t: Backend) {
    const profile = (profile: number, firstName: string, lastName: string, teams: string[]) =>
      t.seed.insert("companyProfiles", { profile, firstName, lastName, normalisedName: `${firstName} ${lastName}`.toLowerCase(), colour: "teal", teams, asOf: 0 });
    await profile(1, "Alice", "Archer", ["growth"]);
    await profile(2, "Bob", "Brook", ["growth", "analytics"]);
    await profile(3, "Carol", "Crane", ["growth"]);
    await profile(4, "Dana", "Dale", ["growth"]);
    await t.seed.insert("companyTeams", { team: "growth", name: "Growth", leads: [2], people: [1, 2, 3, 4], asOf: 0 });
    await t.seed.insert("companyTeams", { team: "analytics", name: "Analytics", crestImage: "https://example.com/analytics.png", leads: [], people: [2], asOf: 0 });
  }

  test("each team's page holds the people the directory matches but the owner, the stickers held of them, and the earlier crest", async () => {
    const { t, alice, bob } = await aTeam();
    await onTheCompanySite(t);
    const crest = catalogue.crests[0]!;

    const pages = await t.query(async (ctx) =>
      teamPagesOf(ctx, { member: alice, workspace: "T1" }, {
        members: await memberRowsIn(ctx, "T1"),
        stickers: [{ person: bob, firstAward: award(1), firstAt: at }],
        crests: [{ crest: crest.crest, collectedAt: at }, { crest: "growth", collectedAt: at + 2 * hour }],
        completions: [{ team: "growth", name: "Growth", at: at + hour }],
      }),
    );

    const byName = [{ team: "analytics", name: "Analytics" }, { team: crest.crest, name: crest.name }].toSorted((one, other) => one.name.localeCompare(other.name));
    expect(pages.map(({ team }) => team)).toEqual(["growth", ...byName.map(({ team }) => team)]);
    const [growth, analytics, unlisted] = ["growth", "analytics", crest.crest].map((team) => pages.find((page) => page.team === team));
    expect(growth).toEqual(expect.objectContaining({ mine: true, listed: true, leads: ["Bob Brook"], held: 1, total: 2, unmatched: 1, complete: true, crest: { collectedAt: at + hour, by: "page" }, completion: { at: at + hour } }));
    expect(growth!.people.map(({ person, lead, held, heldAt }) => ({ person, lead, held, heldAt }))).toEqual([
      { person: bob, lead: true, held: true, heldAt: at },
      { person: expect.any(String), lead: false, held: false, heldAt: null },
    ]);
    expect(growth!.unmatchedPeople).toEqual([{ name: "Dana Dale", role: null }]);
    expect(analytics).toEqual(expect.objectContaining({ mine: false, art: { kind: "image", url: "https://example.com/analytics.png" }, held: 1, total: 1, complete: true, crest: null, completion: null }));
    expect(unlisted).toEqual(expect.objectContaining({ name: crest.name, art: { kind: "crest", slug: crest.crest }, listed: false, total: 0, complete: false, crest: { collectedAt: at, by: "roster" }, completion: null }));
    expect([isFull(analytics!), isFull(growth!), isFull(unlisted!)]).toEqual([true, false, false]);
  });

  test("a member's completed pages read by team, and in the order they were recorded", async () => {
    const { t, alice } = await aTeam();
    await t.seed.insert("teamPageCompletions", { member: alice, team: "zeta", name: "Zeta", crestImage: "https://example.com/zeta.png", award: award(1), at, people: 3, told: false });
    await t.seed.insert("teamPageCompletions", { member: alice, team: "alpha", name: "Alpha", award: award(2), at: at + hour, people: 2, told: true });

    expect(await t.query((ctx) => completionsOf(ctx, alice))).toEqual([
      { team: "alpha", name: "Alpha", at: at + hour },
      { team: "zeta", name: "Zeta", crestImage: "https://example.com/zeta.png", at },
    ]);
    expect(await t.query((ctx) => teamsCompletedBy(ctx, alice))).toEqual(["alpha", "zeta"]);
    expect(await t.query((ctx) => completionRecordsInOrder(ctx, alice))).toEqual([
      { award: award(1), at, told: false },
      { award: award(2), at: at + hour, told: true },
    ]);
  });

  waitsOn(["S4", "S6"], "a full team page is recorded once with the award that completed it, and published", async () => {
    const { t, alice, bob } = await aTeam("sticker-book", "team-spirit", "team-pages");
    await onTheCompanySite(t);
    const first = await anAward(t, alice, bob);
    await t.seed.insert("stickers", { member: alice, person: bob, firstAward: first, firstAt: at });

    await t.run((ctx) => checkTeamPages(ctx, { check: { workspace: "T1", member: alice, award: first, at } }));
    await t.run((ctx) => checkTeamPages(ctx, { check: { workspace: "T1", member: alice, award: first, at } }));
    await t.settle();

    expect(await t.seed.all("teamPageCompletions")).toEqual([expect.objectContaining({ member: alice, team: "analytics", award: first, at, people: 1, told: false })]);
    expect((await t.published()).filter(({ type }) => type === "teamPagesCompleted")).toHaveLength(1);
  });

  waitsOn(["S4", "S6"], "a first check of more full pages than one job records goes on in the next and tells nothing; a later completion is told", async () => {
    const { t, alice, bob, carol } = await aTeam("sticker-book", "team-spirit", "team-pages");
    await onTheCompanySite(t);
    for (let n = 0; n < 26; n++) await t.seed.insert("companyTeams", { team: `team-${n}`, name: `Team ${n}`, leads: [], people: [2], asOf: 0 });
    const ofBob = await anAward(t, alice, bob);
    await t.seed.insert("stickers", { member: alice, person: bob, firstAward: ofBob, firstAt: at });

    await t.run((ctx) => checkTeamPages(ctx, { check: { workspace: "T1", member: alice, award: ofBob, at } }));
    await t.settle();
    const firstCheck = await t.seed.all("teamPageCompletions");
    await t.seed.insert("companyTeams", { team: "late", name: "Late", leads: [], people: [3], asOf: 0 });
    const ofCarol = await anAward(t, alice, carol, at + hour, "1.000200");
    await t.seed.insert("stickers", { member: alice, person: carol, firstAward: ofCarol, firstAt: at + hour });
    await t.run((ctx) => checkTeamPages(ctx, { check: { workspace: "T1", member: alice, award: ofCarol, at: at + hour } }));
    await t.settle();

    expect(firstCheck).toHaveLength(27);
    expect(firstCheck.every(({ told }) => !told)).toBe(true);
    const late = (await t.seed.all("teamPageCompletions")).filter(({ team }) => team === "late");
    expect(late).toEqual([expect.objectContaining({ award: ofCarol, told: true })]);
  });

  waitsOn(["S9"], "the week's team stickers count per team, most unlocked first", async () => {
    const { t, alice, bob } = await aTeam();
    const sticker = (member: MemberId, team: string, name: string, when: number) => t.seed.insert("teamStickers", { member, workspace: "T1", team, name, art: null, emoji: team, at: when });
    await sticker(alice, "growth", "Growth", at);
    await sticker(alice, "analytics", "Analytics", at);
    await sticker(bob, "analytics", "Analytics", at + hour);
    await sticker(bob, "growth", "Growth", at + 8 * 24 * hour);

    expect((await t.query((ctx) => teamsUnlockedIn(ctx, "T1", { from: at, to: at + 7 * 24 * hour }, 10))).map(({ name, count }) => ({ name, count }))).toEqual([
      { name: "Analytics", count: 2 },
      { name: "Growth", count: 1 },
    ]);
  });
});
