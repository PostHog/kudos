import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../testing/fakePostHog";
import { FakeSlack } from "../../testing/fakeSlack";
import { memberChanged, post, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, section, text } from "../../testing/slackMessages";
import { aDeploymentForWorkspace, aSignedInSession, switchWebsite } from "../../testing/website";
import { api } from "../_generated/api";
import { xpToReach } from "../progression/levels";
import type { MemberId } from "../workspace/directory";

const tuesday = new Date("2026-10-13T10:00:00Z");
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const picksOn = [...albumOpen, "kudos-emoji-picks"];
const levelEmojis = ["level:5", "level:10", "level:15", "level:20", "level:25"];

type Person = { user: string; name: string };
type Reader = Pick<Backend, "query" | "mutation">;

const alice = { user: "U_ALICE", name: "Alice Marchetti" };
const bruno = { user: "U_BRUNO", name: "Bruno Castellane" };

let postHog: FakePostHog;
let t: Backend;

beforeEach(async () => {
  vi.useFakeTimers({ now: tuesday });
  aDeploymentForWorkspace();
  postHog = new FakePostHog();
  const slack = new FakeSlack();
  for (const { user, name } of [alice, bruno]) slack.withMember(user, { profile: { display_name: name, real_name: name } });
  vi.stubGlobal("fetch", routedFetch(postHog, (input, init) => slack.fetch(input, init)));
  t = testBackend();
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 }));
  await switchWebsite(t, postHog, true, ...picksOn);
  for (const { user, name } of [alice, bruno]) await memberChanged(t, "team_join", { id: user, team_id: "T1", name, real_name: name, profile: { real_name: name, display_name: name } });
  await settle(t);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a member picks up to five earned emojis that count in their kudos messages", () => {
  test("the album reads the picks; a sixth is full until one is unpicked", async () => {
    await reachesXp(alice, xpToReach(25));
    await dropsRandomEmoji(alice, bruno, "party-parrot");
    const asAlice = await signedIn(alice);

    for (const level of levelEmojis) expect(await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: level, picked: true })).toMatchObject({ kind: "picked" });
    const sixth = await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: "random:party-parrot", picked: true });
    await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: "level:5", picked: false });
    const afterUnpick = await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: "random:party-parrot", picked: true });

    expect(sixth).toEqual({ kind: "full" });
    expect(afterUnpick).toMatchObject({ kind: "picked" });
    expect((await picksOf(asAlice)).toSorted()).toEqual([...levelEmojis.slice(1), "random:party-parrot"].toSorted());
  });

  test("a hype emoji can't be picked: it counts on its own when the kudos mentions its person", async () => {
    await thanks(alice, bruno);
    const asAlice = await signedIn(alice);
    const hype = `hype:${await memberOf(bruno)}`;

    expect(await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: hype, picked: true })).toEqual({ kind: "refused" });
    expect(await picksOf(asAlice)).toEqual([]);
  });

  test("a hype emoji picked before picking it ended holds no slot: the album leaves it out, and five picks still fit", async () => {
    await reachesXp(alice, xpToReach(25));
    await thanks(alice, bruno);
    const asAlice = await signedIn(alice);
    const [member, hype] = [await memberOf(alice), `hype:${await memberOf(bruno)}`];
    await t.run((ctx) => ctx.db.insert("kudosEmojiPicks", { member, emoji: hype }));

    expect(await picksOf(asAlice)).toEqual([]);
    for (const level of levelEmojis) expect(await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: level, picked: true })).toMatchObject({ kind: "picked" });
    expect((await picksOf(asAlice)).toSorted()).toEqual(levelEmojis.toSorted());
  });

  test("a pick no longer held holds no slot: the album leaves it out, and a fifth pick still fits", async () => {
    await reachesXp(alice, xpToReach(25));
    const asAlice = await signedIn(alice);
    const member = await memberOf(alice);
    await t.run((ctx) => ctx.db.insert("kudosEmojiPicks", { member, emoji: "team:nowhere" }));

    expect(await picksOf(asAlice)).toEqual([]);
    for (const level of levelEmojis.slice(0, 4)) await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: level, picked: true });
    const fifth = await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: "level:25", picked: true });

    expect(fifth).toMatchObject({ kind: "picked" });
    expect((await picksOf(asAlice)).toSorted()).toEqual(levelEmojis.toSorted());
  });

  test.each([
    ["an emoji they haven't earned", "level:25"],
    ["First thank-you, which always counts", "milestone:thoughtful:bronze"],
  ])("picking %s is refused and records nothing", async (_, id) => {
    await thanks(alice, bruno);
    const asAlice = await signedIn(alice);

    expect(await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: id, picked: true })).toEqual({ kind: "refused" });
    expect(await picksOf(asAlice)).toEqual([]);
  });

  test.each([
    ["the album", []],
    ["kudos-emoji-picks", albumOpen],
  ])("with %s off, a pick is refused and records nothing", async (_, on) => {
    await reachesXp(alice, xpToReach(5));
    await switchWebsite(t, postHog, true, ...on);
    const asAlice = await signedIn(alice);

    expect(await asAlice.mutation(api.website.album.pickKudosEmoji, { emoji: "level:5", picked: true })).toEqual({ kind: "refused" });
    expect(await t.run((ctx) => ctx.db.query("kudosEmojiPicks").collect())).toEqual([]);
  });

  test("with kudos-emoji-picks off, the album answers no picks", async () => {
    await switchWebsite(t, postHog, true, ...albumOpen);
    const album = await (await signedIn(alice)).query(api.website.album.getAlbum, {});

    expect(album).toMatchObject({ kind: "album" });
    expect(album).not.toHaveProperty("kudosEmojiPicks");
  });
});

async function picksOf(reader: Reader): Promise<string[]> {
  const album = await reader.query(api.website.album.getAlbum, {});
  if (album.kind !== "album" || album.kudosEmojiPicks === undefined) throw new Error("expected an album with picks");
  return album.kudosEmojiPicks;
}

async function thanks(giver: Person, recipient: Person) {
  await post(t, [section(text(`${why} `), mention(recipient.user), emoji("taco"))], { user: giver.user, ts: `${Date.now() / 1000 - 60}.000100` });
  await settle(t);
}

async function dropsRandomEmoji(holder: Person, recipient: Person, name: string) {
  const [member, to] = [await memberOf(holder), await memberOf(recipient)];
  await t.run(async (ctx) => {
    const pack = await ctx.db.insert("thoughtfulPacks", { workspace: "T1", giver: member, recipient: to, week: "2026-10-12", message: { workspace: "T1", conversation: "C1", message: "1760000000.000100" }, holdsSticker: false, at: Date.now() });
    await ctx.db.insert("randomEmojiDrops", { member, name, pack, at: Date.now() });
  });
}

async function reachesXp(someone: Person, xp: number) {
  const member = await memberOf(someone);
  await t.run((ctx) => ctx.db.insert("memberProgress", { member, xp, pointsSpent: 0 }));
}

async function signedIn(someone: Person) {
  const { asSignedIn } = await aSignedInSession(t, { user: someone.user, name: someone.name });
  return asSignedIn;
}

async function memberOf(someone: Person): Promise<MemberId> {
  const row = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("workspace", "T1").eq("user", someone.user))
      .unique(),
  );
  if (row === null) throw new Error(`${someone.name} is no member`);
  return row._id;
}
