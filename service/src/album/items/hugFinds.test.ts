// Port of convex/album/items/hugFinds.test.ts. A hug comes in as today's signed reaction; the board and turns are
// read through the website's member routes, as a signed-in member reads them (see ../albumPorts.testing.ts).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { reactionEvent } from "../../../testing/slackMessages.ts";
import { waitsOn } from "../../../testing/waiting.ts";
import type { HugGivenEvent } from "../../bus/events.ts";
import type { Id } from "../../db/columns.ts";
import { standingOf } from "../../progression/progression.ts";
import type { TurnAnswer } from "../../website/album.ts";
import type { Denial } from "../../website/memberQuery.ts";
import type { MemberId } from "../../workspace/directory.ts";
import { catalogue, rankOf } from "../hoggies/catalogue.ts";
import { drawOf, findsOnHug } from "../hoggies/draw.ts";
import { findOnHug } from "./hugFinds.ts";
import { aDeploymentForWorkspace, aMember, aSignedInSession, registry, setTime, slackEvent, switchWebsite, type Person, type Reader } from "../albumPorts.testing.ts";

const tuesday = new Date("2026-10-13T10:00:00Z").getTime();
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const rewardsOn = ["album", "collection", "packs", "hidden-items", "hugs", "hug-rewards"];

const backend = useTestBackend({ now: tuesday, registry });

let t: TestBackend;
let bobsId: MemberId;

beforeEach(async () => {
  aDeploymentForWorkspace();
  t = backend();
  for (const person of [alice, bob]) t.slack.withMember(person.user, { real_name: person.name });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 10 });
  await switchWebsite(t, true, ...rewardsOn);
  await aMember(t, alice.user);
  bobsId = await aMember(t, bob.user);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HH35 HH36: a hug given can find a hoggie, capped at rare", () => {
  waitsOn(["S4", "S13", "S15", "S16"], "a hug that finds earns Bob one face-down item, and its turn draws a hoggie and pays no XP", async () => {
    await hugAlice(await aMessageWhereBobsHug("finds"));
    const asBob = await signedIn(bob);
    const board = await boardOf(asBob);
    const xpBefore = await xpOfBob();

    const turned = await turn(asBob, board.items[0]!.item);

    expect(board.items.map(({ reason }) => reason)).toEqual([{ kind: "hug" }]);
    expect(turned).toMatchObject({ kind: "turned", face: { kind: "hoggie" }, applied: null });
    expect(await xpOfBob()).toBe(xpBefore);
  });

  waitsOn(["S4", "S13", "S15", "S16"], "a hug that doesn't find earns nothing", async () => {
    await hugAlice(await aMessageWhereBobsHug("misses"));

    expect(await hugFindsOnTheBoardOf(bob)).toEqual([]);
  });

  waitsOn(["S4", "S13", "S15", "S16"], "Bob finds at most once a day: a second finding hug that day earns nothing, and the next day's finds again", async () => {
    await hugAlice(await aMessageWhereBobsHug("finds"));
    await hugAlice(await aMessageWhereBobsHug("finds"));
    setTime(t, tuesday + dayMs);
    await hugAlice(await aMessageWhereBobsHug("finds"));

    expect(await hugFindsOnTheBoardOf(bob)).toHaveLength(2);
  });

  waitsOn(["S4", "S13", "S15", "S16"], "on a day whose uncapped draw would be epic or legendary, the find still turns up a hoggie no rarer than rare, with rarity-caps off", async () => {
    setTime(t, await aDayWhoseUncappedDrawIsAboveRare());
    await hugAlice(await aMessageWhereBobsHug("finds"));
    const asBob = await signedIn(bob);

    const turned = await turn(asBob, (await boardOf(asBob)).items[0]!.item);

    expect(turned.kind === "turned" && turned.face.kind === "hoggie" && rankOf(turned.face.drop.rarity)).toBeLessThanOrEqual(rankOf("rare"));
  });

  waitsOn(["S4", "S13", "S15", "S16"], "while hug-rewards is off, a hug finds nothing", async () => {
    await switchWebsite(t, true, ...rewardsOn.filter((flag) => flag !== "hug-rewards"));

    await hugAlice(await aMessageWhereBobsHug("finds"));

    expect(await hugFindsOnTheBoardOf(bob)).toEqual([]);
  });
});

describe("HH34 HH35: Album finds from hugGiven as the hug decided", () => {
  waitsOn(["S15", "S16"], "a finding hugGiven delivered twice earns one item", async () => {
    const event = hugGiven(await aMessageWhereBobsHug("finds"), { rewards: true });

    await t.run((ctx) => findOnHug(ctx, { event }));
    await t.run((ctx) => findOnHug(ctx, { event }));

    expect(await hugFindsOnTheBoardOf(bob)).toHaveLength(1);
  });

  waitsOn(["S15", "S16"], "a finding hugGiven decided with rewards finds after hug-rewards turned off", async () => {
    await switchWebsite(t, true, ...rewardsOn.filter((flag) => flag !== "hug-rewards"));

    const event = hugGiven(await aMessageWhereBobsHug("finds"), { rewards: true });
    await t.run((ctx) => findOnHug(ctx, { event }));

    expect(await hugFindsOnTheBoardOf(bob)).toHaveLength(1);
  });

  waitsOn(["S15", "S16"], "a finding hugGiven decided without rewards, or from before the flag, finds nothing after hug-rewards turned on", async () => {
    const ts = await aMessageWhereBobsHug("finds");

    await t.run((ctx) => findOnHug(ctx, { event: hugGiven(ts, { rewards: false }) }));
    await t.run((ctx) => findOnHug(ctx, { event: hugGiven(ts) }));

    expect(await hugFindsOnTheBoardOf(bob)).toEqual([]);
  });

  test("a giver who left finds nothing, and nothing throws", async () => {
    await t.seed.patch("members", bobsId, { kind: "not-a-member" });

    const event = hugGiven(await aMessageWhereBobsHug("finds"), { rewards: true });
    await t.run((ctx) => findOnHug(ctx, { event }));

    expect((await t.seed.all("items")).filter(({ member }) => member === bobsId).slice(0, 1)).toEqual([]);
  });
});

let candidates = 0;

async function aMessageWhereBobsHug(outcome: "finds" | "misses") {
  for (;;) {
    candidates += 1;
    const ts = `${Math.floor((t.clock.now() - hourMs) / 1000)}.${String(candidates).padStart(6, "0")}`;
    if ((await findsOnHug({ secret: "", member: bobsId, hug: `C1:${ts}` })) === (outcome === "finds")) return ts;
  }
}

async function aDayWhoseUncappedDrawIsAboveRare() {
  for (let day = tuesday; ; day += dayMs) {
    const crate = `hug-find:${new Date(day).toISOString().slice(0, 10)}`;
    const { rarity } = await drawOf({ secret: "", member: bobsId, crate, version: catalogue.version, weights: "base" });
    if (rankOf(rarity) > rankOf("rare")) return day;
  }
}

async function hugAlice(ts: string) {
  await slackEvent(t, reactionEvent({ user: bob.user, itemUser: alice.user, ts }));
  await t.settle();
}

function hugGiven(ts: string, rewarded: Pick<HugGivenEvent, "rewards"> = {}): HugGivenEvent {
  return { type: "hugGiven", workspace: "T1", giver: bobsId, message: { workspace: "T1", conversation: "C1", message: ts }, onKudos: false, at: t.clock.now(), day: "2026-10-13", first: false, reaction: "taco", ...rewarded };
}

async function signedIn(person: Person) {
  return (await aSignedInSession(t, person)).asSignedIn;
}

async function boardOf(reader: Reader) {
  const album = await reader.getAlbum();
  const board = album.kind === "album" ? album.board : undefined;
  if (board === undefined) throw new Error(`expected the item board, got ${JSON.stringify(album)}`);
  return board;
}

async function hugFindsOnTheBoardOf(person: Person) {
  return (await boardOf(await signedIn(person))).items.filter(({ reason }) => reason.kind === "hug");
}

function turn(reader: Reader, item: Id<"items">): Promise<TurnAnswer | Denial> {
  return reader.turnItem({ item });
}

async function xpOfBob() {
  return (await t.run((ctx) => standingOf(ctx, bobsId))).xp;
}
