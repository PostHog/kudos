// The earned emojis a member picks to count in their kudos, over the service, ported from
// convex/album/kudosEmojis.test.ts by the cases' own names.
//
// Today's file picks through the website (pickKudosEmoji, getAlbum: S16) and earns its emojis through Slack and the
// album's progression (S8's packs, S9's earned emojis later in the stack). Here the cases call this module's own pick
// and read, as the website calls them, and what a member holds is the world's (service/src/album/testing/emojiWorld.ts), as
// convex/album/earnedEmojis.ts answers it. The album and kudos-emoji-picks flags guard the website's mutation, so their
// two cases stay with the website's port. The parse hook, which convex/slack/earnedEmojiKudos.test.ts proves end to end
// through Slack, is proven here at its own seam.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { emojiWorld } from "./testing/emojiWorld.ts";
import { replaceCompanyProfiles } from "../companyProfiles/sync.ts";
import type { Mention } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { nameHypeEmojiOf, openTheRegistryIn, teamEmojiNameOf } from "./emojiNames.ts";
import { earnedEmojiHook, kudosEmojiPicksOf, pickKudosEmoji } from "./kudosEmojis.ts";

vi.mock("../workspace/directory.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "directory"));
vi.mock("./earnedEmojis.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "earnedEmojis"));
vi.mock("./flag.ts", async (original) => (await import("./testing/emojiWorld.ts")).standIn(original, "flags"));

const levelEmojis = ["level:5", "level:10", "level:15", "level:20", "level:25"];
const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bruno = { user: "U_BRUNO", name: "Bruno Castellane" };

const backend = useTestBackend({ now: Date.parse("2026-10-13T10:00:00Z") });
let t: TestBackend;
let members: { alice: MemberId; bruno: MemberId };

beforeEach(async () => {
  t = backend();
  emojiWorld.reset();
  const ids: MemberId[] = [];
  for (const { user, name } of [alice, bruno]) {
    const member = await t.seed.insert("members", { workspace: "T1", user, kind: "member", name });
    emojiWorld.member(member, { fullName: name, user });
    ids.push(member);
  }
  members = { alice: ids[0]!, bruno: ids[1]! };
  emojiWorld.flags.kudosEmojiPicks.add(members.alice);
});

describe("a member picks up to five earned emojis that count in their kudos messages", () => {
  test("the album reads the picks; a sixth is full until one is unpicked", async () => {
    reachesLevel25(members.alice);
    dropsRandomEmoji(members.alice, "party-parrot");

    for (const level of levelEmojis) expect(await pick(members.alice, level, true)).toMatchObject({ kind: "picked" });
    const sixth = await pick(members.alice, "random:party-parrot", true);
    await pick(members.alice, "level:5", false);
    const afterUnpick = await pick(members.alice, "random:party-parrot", true);

    expect(sixth).toEqual({ kind: "full" });
    expect(afterUnpick).toMatchObject({ kind: "picked" });
    expect((await picksOf(members.alice)).toSorted()).toEqual([...levelEmojis.slice(1), "random:party-parrot"].toSorted());
  });

  test("a hype emoji can't be picked: it counts on its own when the kudos mentions its person", async () => {
    const hype = await thanks(members.alice, members.bruno);

    expect(await pick(members.alice, hype, true)).toEqual({ kind: "refused" });
    expect(await picksOf(members.alice)).toEqual([]);
  });

  test("a hype emoji picked before picking it ended holds no slot: the album leaves it out, and five picks still fit", async () => {
    reachesLevel25(members.alice);
    const hype = await thanks(members.alice, members.bruno);
    await t.seed.insert("kudosEmojiPicks", { member: members.alice, emoji: hype });

    expect(await picksOf(members.alice)).toEqual([]);
    for (const level of levelEmojis) expect(await pick(members.alice, level, true)).toMatchObject({ kind: "picked" });
    expect((await picksOf(members.alice)).toSorted()).toEqual(levelEmojis.toSorted());
  });

  test("a pick no longer held holds no slot: the album leaves it out, and a fifth pick still fits", async () => {
    reachesLevel25(members.alice);
    await t.seed.insert("kudosEmojiPicks", { member: members.alice, emoji: "team:nowhere" });

    expect(await picksOf(members.alice)).toEqual([]);
    for (const level of levelEmojis.slice(0, 4)) await pick(members.alice, level, true);
    const fifth = await pick(members.alice, "level:25", true);

    expect(fifth).toMatchObject({ kind: "picked" });
    expect((await picksOf(members.alice)).toSorted()).toEqual(levelEmojis.toSorted());
  });

  test.each([
    ["an emoji they haven't earned", "level:25"],
    ["First thank-you, which always counts", "milestone:thoughtful:bronze"],
  ])("picking %s is refused and records nothing", async (_, id) => {
    await thanks(members.alice, members.bruno);
    emojiWorld.earns(members.alice, "milestone:thoughtful:bronze");

    expect(await pick(members.alice, id, true)).toEqual({ kind: "refused" });
    expect(await picksOf(members.alice)).toEqual([]);
  });
});

describe("a pick made twice changes nothing more", () => {
  test("picking the same emoji again keeps its one row, and unpicking it again finds nothing to remove", async () => {
    reachesLevel25(members.alice);

    expect(await pick(members.alice, "level:5", true)).toEqual({ kind: "picked", picks: ["level:5"] });
    const once = await t.seed.all("kudosEmojiPicks");
    expect(await pick(members.alice, "level:5", true)).toEqual({ kind: "picked", picks: ["level:5"] });
    expect(await t.seed.all("kudosEmojiPicks")).toEqual(once);

    await pick(members.alice, "level:5", false);
    expect(await pick(members.alice, "level:5", false)).toEqual({ kind: "picked", picks: [] });
    expect(await t.seed.all("kudosEmojiPicks")).toEqual([]);
  });
});

describe("the earned emoji hook claims a kudos message's earned emojis for the parser", () => {
  beforeEach(async () => {
    await t.run((ctx) => replaceCompanyProfiles(ctx, { asOf: 1, profiles: [], teams: [{ team: "otters", name: "Otters", leads: [], people: [] }] }));
    await t.settle();
    await t.run((ctx) => openTheRegistryIn(ctx, "T1"));
    await t.run((ctx) => teamEmojiNameOf(ctx, "T1", "otters"));
    await t.run((ctx) => nameHypeEmojiOf(ctx, "T1", members.bruno));
    emojiWorld.earns(members.alice, "level:5", "team:otters", `hype:${members.bruno}`, "milestone:thoughtful:bronze");
  });

  test("with kudos-emoji-picks on, First thank-you and the picks count for everyone, an unpicked earned emoji doesn't, and a hype emoji counts only for its mentioned person", async () => {
    await pick(members.alice, "team:otters", true);

    expect(await claimsOf(members.alice, ["first-thank-you", "team-otters", "level-5", "bruno-castellane-hype"], [person(bruno.user)])).toEqual([
      { name: "first-thank-you" },
      { name: "team-otters" },
      { name: "bruno-castellane-hype", onlyFor: bruno.user },
    ]);
  });

  test("a hype emoji whose person the kudos doesn't mention counts for no one", async () => {
    expect(await claimsOf(members.alice, ["bruno-castellane-hype"], [person(alice.user)])).toEqual([]);
  });

  test("with kudos-emoji-picks off, every earned emoji counts for everyone, a hype emoji too", async () => {
    emojiWorld.flags.kudosEmojiPicks.clear();

    expect(await claimsOf(members.alice, ["first-thank-you", "team-otters", "level-5", "bruno-castellane-hype", "level-10"], [])).toEqual([
      { name: "first-thank-you" },
      { name: "team-otters" },
      { name: "level-5" },
      { name: "bruno-castellane-hype" },
    ]);
  });

  test("a message with no giver claims nothing", async () => {
    expect(await t.run((ctx) => earnedEmojiHook.kudosEmoji!(ctx, { workspace: "T1", giver: undefined }, { emoji: ["team-otters"], mentions: [] }))).toEqual([]);
  });
});

function reachesLevel25(member: MemberId) {
  emojiWorld.earns(member, ...levelEmojis);
}

function dropsRandomEmoji(member: MemberId, name: string) {
  emojiWorld.drops.set(member, new Set([...(emojiWorld.drops.get(member) ?? []), name]));
}

// A thoughtful kudos names the recipient's hype emoji and the giver collects it (convex/album/packs.ts, S8).
async function thanks(giver: MemberId, recipient: MemberId): Promise<string> {
  await t.run((ctx) => nameHypeEmojiOf(ctx, "T1", recipient));
  const hype = `hype:${recipient}`;
  emojiWorld.earns(giver, hype);
  return hype;
}

function pick(member: MemberId, emoji: string, picked: boolean) {
  return t.run((ctx) => pickKudosEmoji(ctx, member, emoji, picked));
}

function picksOf(member: MemberId) {
  return t.query((ctx) => kudosEmojiPicksOf(ctx, member));
}

function person(user: string): Mention {
  return { kind: "person", user };
}

function claimsOf(giver: MemberId, emoji: string[], mentions: Mention[]) {
  return t.run((ctx) => earnedEmojiHook.kudosEmoji!(ctx, { workspace: "T1", giver }, { emoji, mentions }));
}
