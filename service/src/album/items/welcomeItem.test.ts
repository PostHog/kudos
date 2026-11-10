// Port of convex/album/items/welcomeItem.test.ts. Today's beforeEach (the deployment, the flags and both members'
// team_join) runs at the top of each test, so a test waiting on the join's stub still runs it as its own first step.
// Today's backend ran with Convex's transaction limits; the service has no counterpart to switch on.
import { afterEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { httpStatus } from "../../../testing/fakeSlack.ts";
import { emoji, memberEvent, mention, messageEvent, section, text } from "../../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../../testing/waiting.ts";
import type { Id } from "../../db/columns.ts";
import type { AlbumAnswer, TurnAnswer } from "../../website/album.ts";
import type { Denial } from "../../website/memberQuery.ts";
import { catalogue } from "../hoggies/catalogue.ts";
import { drawOf } from "../hoggies/draw.ts";
import { aDeploymentForWorkspace, allowedWorkspace, aSignedInSession, memberOf as memberIn, registry, setTime, settleInTimeOrder, slackEvent, switchWebsite, type Person, type Reader } from "../albumPorts.testing.ts";
import { earnWelcomeItemOnGreeting, welcomeCrateKey } from "./welcome.ts";

const tuesday = new Date("2026-10-13T10:00:00Z").getTime();
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const albumOpen = ["album", "collection", "packs"];
const itemsOn = [...albumOpen, "hidden-items"];
const welcomeOn = [...itemsOn, "welcome-item"];

const backend = useTestBackend({ now: tuesday, workspace: allowedWorkspace, registry });

let t: TestBackend;

// Every test joins Juno and Bob first, through today's team_join (S4); the sign-in is S15's, the album's routes S16's,
// the greeting S5's, and the welcome hoggie S10's rarity caps.
const joined: [Stack, ...Stack[]] = ["S4", "S5", "S10", "S15", "S16"];

async function setUp() {
  aDeploymentForWorkspace();
  t = backend();
  for (const person of [juno, bob]) t.slack.withMember(person.user, { real_name: person.name });
  await t.seed.insert("workspaces", { workspace: allowedWorkspace, kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(t, true, ...welcomeOn);
  for (const person of [juno, bob]) await joins(person);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LP44 LP50: a member's first sign-in earns one welcome item", () => {
  waitsOn(joined, "the first sign-in earns one welcome item, and a second sign-in earns nothing more", async () => {
    await setUp();
    const first = await signsIn(juno);
    await signsIn(juno, first.user);

    const { board } = await albumOf(first.reader);

    expect(board?.items.map(({ reason }) => reason)).toEqual([{ kind: "welcome" }]);
    expect(await itemsOf(juno)).toEqual([{ source: "hoggie", key: welcomeCrateKey, floor: "rare", reason: { kind: "welcome" } }]);
  });

  waitsOn(joined, "a member who signed in before welcome-item shipped earns none at a later sign-in", async () => {
    await setUp();
    await switchWebsite(t, true, ...itemsOn);
    const before = await signsIn(juno);
    await switchWebsite(t, true, ...welcomeOn);

    await signsIn(juno, before.user);

    expect((await albumOf(before.reader)).board?.items).toEqual([]);
  });

  waitsOn(joined, "a person the directory learns of only by verifying their first sign-in earns the welcome item once verified", async () => {
    await setUp();
    const newcomer = { user: "U_NEW", name: "Nell Arden" };
    t.slack.withMember(newcomer.user, { real_name: newcomer.name });
    const first = await signsIn(newcomer);
    await t.settle();

    await signsIn(newcomer, first.user);
    await t.settle();

    expect((await albumOf(first.reader)).board?.items.map(({ reason }) => reason), "the verified newcomer's welcome item").toEqual([{ kind: "welcome" }]);
  });

  waitsOn(joined, "a newcomer whose first sign-in's checks all failed earns the welcome item once a later sign-in verifies them", async () => {
    await setUp();
    const newcomer = { user: "U_NEW", name: "Nell Arden" };
    t.slack.withMember(newcomer.user, { real_name: newcomer.name }).answering("users.info", httpStatus(500), httpStatus(500), httpStatus(500));
    const first = await signsIn(newcomer);
    await settleInTimeOrder(t);

    await signsIn(newcomer, first.user);
    await t.settle();

    expect((await albumOf(first.reader)).board?.items.map(({ reason }) => reason), "the newcomer verified at a later sign-in").toEqual([{ kind: "welcome" }]);
  });

  for (const [name, flags] of [
    ["welcome-item off", itemsOn],
    ["hidden-items off", [...albumOpen, "welcome-item"]],
  ] as const) {
    waitsOn(joined, `with ${name} the first sign-in earns nothing`, async () => {
      await setUp();
      await switchWebsite(t, true, ...flags);

      await signsIn(juno);

      expect(await itemsOf(juno)).toEqual([]);
    });
  }
});

describe("LP44: Album earns the welcome item from memberGreeted", () => {
  waitsOn(["S4", "S5", "S10"], "a greeting delivered twice earns one welcome item", async () => {
    await setUp();
    const event = { type: "memberGreeted" as const, workspace: allowedWorkspace, member: await memberOf(juno), owesTheWelcomeItem: true, at: t.clock.now() };

    await t.run((ctx) => earnWelcomeItemOnGreeting(ctx, { event }));
    await t.run((ctx) => earnWelcomeItemOnGreeting(ctx, { event }));

    expect(await itemsOf(juno)).toEqual([{ source: "hoggie", key: welcomeCrateKey, floor: "rare", reason: { kind: "welcome" } }]);
  });
});

describe("LP11 LP44 LP49: the welcome item turns at least rare, pays no XP and teaches the loop once", () => {
  waitsOn(joined, "its turn draws the rare-floored hoggie, pays no XP and answers the workspace's kudos emoji for the line that teaches the loop", async () => {
    await setUp();
    const { reader } = await signsIn(juno);
    const before = (await albumOf(reader)).level.xp;
    const [item] = (await albumOf(reader)).board!.items;

    const turned = await turn(reader, item!.item);
    await t.settle();

    const drawn = await drawOf({ secret: "", member: await memberOf(juno), crate: welcomeCrateKey, version: catalogue.version, floor: "rare" });
    expect(drawn.rarity, "the welcome hoggie is drawn at least rare").not.toBe("common");
    expect(turned).toMatchObject({ kind: "turned", again: false, face: { kind: "hoggie", drop: { hoggie: drawn.hoggie, rarity: drawn.rarity } }, applied: null, teaches: { kudosEmoji: "taco", kudosEmojiImage: null } });
    expect((await albumOf(reader)).level.xp, "the welcome item pays no XP").toBe(before);
  });

  waitsOn(joined, "a replayed turn of the welcome item teaches nothing again, and a thanks item's turn teaches nothing", async () => {
    await setUp();
    const { reader } = await signsIn(juno);
    const [welcome] = (await albumOf(reader)).board!.items;
    await turn(reader, welcome!.item);

    const again = await turn(reader, welcome!.item);
    await thanks(juno, "Thanks for untangling the flaky migration", bob);
    const [thanked] = (await albumOf(reader)).board!.items;
    const thanksTurn = await turn(reader, thanked!.item);

    expect(again).toMatchObject({ kind: "turned", again: true });
    expect(again).not.toHaveProperty("teaches");
    expect(thanksTurn).toMatchObject({ kind: "turned", again: false });
    expect(thanksTurn).not.toHaveProperty("teaches");
  });

  waitsOn(joined, "with welcome-item off once earned, the welcome item still turns and teaches nothing", async () => {
    await setUp();
    const { reader } = await signsIn(juno);
    const [item] = (await albumOf(reader)).board!.items;
    await switchWebsite(t, true, ...itemsOn);

    const turned = await turn(reader, item!.item);

    expect(turned).toMatchObject({ kind: "turned", again: false, applied: null });
    expect(turned).not.toHaveProperty("teaches");
  });
});

async function joins(person: Person) {
  await slackEvent(t, memberEvent("team_join", { id: person.user, team_id: allowedWorkspace, real_name: person.name }, { team: allowedWorkspace }));
  await t.settle();
}

async function signsIn(person: Person, existingUserId: Id<"users"> | null = null) {
  const { user, asSignedIn } = await aSignedInSession(t, person, { existingUserId });
  await t.settle();
  return { user, reader: asSignedIn };
}

let messages = 0;

async function thanks(giver: Person, words: string, recipient: Person) {
  messages += 1;
  setTime(t, t.clock.now() + 60_000);
  const ts = `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}`;
  await slackEvent(t, messageEvent([section(text(`${words} `), mention(recipient.user), emoji("taco"))], { user: giver.user, ts }));
  await t.settle();
}

function turn(reader: Reader, item: Id<"items">): Promise<TurnAnswer | Denial> {
  return reader.turnItem({ item });
}

async function albumOf(reader: Reader): Promise<AlbumAnswer> {
  const album = await reader.getAlbum();
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album;
}

function memberOf(person: Person) {
  return memberIn(t, person);
}

async function itemsOf(person: Person) {
  const member = await memberOf(person);
  const rows = (await t.seed.all("items")).filter((item) => item.member === member);
  return rows.map(({ source, key, floor, reason }) => ({ source, key, floor, reason }));
}
