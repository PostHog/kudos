import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../../testing/fakePostHog";
import { FakeSlack } from "../../../testing/fakeSlack";
import { kudosReceived, memberChanged, post, react, settle, testBackend, type Backend } from "../../../testing/slackBackend";
import { emoji, mention, section, text } from "../../../testing/slackMessages";
import { aDeploymentForWorkspace, aSignedInSession, switchWebsite } from "../../../testing/website";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { AlbumAnswer, AlbumRead, TurnAnswer } from "../../website/album";
import type { Denial } from "../../website/memberQuery";
import type { MemberId } from "../../workspace/directory";
import { milestoneCatalogue } from "../milestoneCatalogue";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const itemsOn = [...albumOpen, "hidden-items"];
const firstThankYou = { milestone: "thoughtful", tier: "bronze" } as const;
const firstFace = { milestone: "people", tier: "bronze" } as const;

type Person = { user: string; name: string };
type Reader = Pick<Backend, "query" | "mutation">;
type Turned = Extract<TurnAnswer, { kind: "turned" }>;
type Tier = { milestone: string; tier: string };

const alice = person("Alice", "Marchetti");
const bob = person("Bob", "Okonkwo");
const everyone = [alice, bob];

let postHog: FakePostHog;
let t: Backend;
let messages = 0;

beforeEach(async () => {
  vi.useFakeTimers({ now: tuesday });
  aDeploymentForWorkspace();
  postHog = new FakePostHog();
  const slack = new FakeSlack();
  for (const { user, name } of everyone) slack.withMember(user, { profile: { display_name: name, real_name: name } });
  vi.stubGlobal("fetch", routedFetch(postHog, (input, init) => slack.fetch(input, init)));
  t = testBackend({ transactionLimits: true });
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 }));
  await switchWebsite(t, postHog, true, ...itemsOn);
  for (const { user, name } of everyone) await memberChanged(t, "team_join", { id: user, team_id: "T1", name, real_name: name, profile: { real_name: name, display_name: name } });
  await settle(t);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LP14 LP19a: each milestone tier unlocks once, in the turn that brings it", { timeout: 60_000 }, () => {
  test("a turn that reaches a tier answers it, reads it earned from the turn with its emoji earned and seen, so no emoji moment shows it, and a replay answers none", async () => {
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    vi.setSystemTime(Date.now() + minuteMs);

    const turned = await turnTheItem(asAlice, "sticker");
    const again = await turn(asAlice, await itemOf(alice, "sticker"));

    expect(turned.unlocked.milestones).toContainEqual(firstFace);
    expect(again).toMatchObject({ kind: "turned", again: true, unlocked: { milestones: [] } });
    const album = await albumOf(asAlice);
    expect(tierOf(album, firstFace)).toMatchObject({ earnedAt: Date.now(), unlockedAt: Date.now() });
    expect(emojiOf(album, firstFace)).toMatchObject({ earned: true, seen: true });
  });

  test("a thoughtful tier reached in Slack reads unearned, its emoji too, until the giver's next turn, which answers it once and reads it unlocked at the turn", async () => {
    const thanked = await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const before = await albumOf(asAlice);
    vi.setSystemTime(Date.now() + minuteMs);

    const first = await turnTheItem(asAlice, "hoggie");
    const unlockedAt = Date.now();
    vi.setSystemTime(Date.now() + minuteMs);
    const second = await turnTheItem(asAlice, "sticker");

    expect(tierOf(before, firstThankYou)).toMatchObject({ earnedAt: null });
    expect(emojiOf(before, firstThankYou)).toMatchObject({ earned: false, seen: false });
    expect(first.unlocked.milestones).toEqual([firstThankYou]);
    expect(second.unlocked.milestones).not.toContainEqual(firstThankYou);
    const after = await albumOf(asAlice);
    expect(tierOf(after, firstThankYou)).toMatchObject({ earnedAt: thanked, unlockedAt });
    expect(emojiOf(after, firstThankYou)).toMatchObject({ earned: true, seen: true });
  });

  test("a thoughtful tier reached in Slack gives no kudos and no hug with its emoji until the giver's next turn unlocks it", async () => {
    await switchWebsite(t, postHog, true, ...itemsOn, "hugs");
    await t.mutation(internal.album.emojiNames.reserveSharedEmojiNames, { workspace: "T1" });
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);

    await thanksWith("first-thank-you", alice, bob);
    await hugsWith("first-thank-you", alice, bob);
    const kudosWhileHeld = await kudosReceived(t, bob.user);
    const hugsWhileHeld = await hugsCount();
    await turnTheItem(asAlice, "hoggie");
    await thanksWith("first-thank-you", alice, bob);
    await hugsWith("first-thank-you", alice, bob);

    expect(kudosWhileHeld, "kudos with First thank-you while the tier waits for its turn").toBe(1);
    expect(hugsWhileHeld, "hugs with First thank-you while the tier waits for its turn").toBe(0);
    expect(await kudosReceived(t, bob.user), "kudos with First thank-you after the turn").toBe(2);
    expect(await hugsCount(), "hugs with First thank-you after the turn").toBe(1);
  });

  test("with hidden-items off a thoughtful tier reads earned at the thanks with its emoji unseen, as today", async () => {
    await switchWebsite(t, postHog, true, ...albumOpen);
    const thanked = await thanks(alice, bob);

    const album = await albumOf(await signedIn(alice));

    expect(tierOf(album, firstThankYou)).toEqual(expect.objectContaining({ earnedAt: thanked }));
    expect(tierOf(album, firstThankYou)).not.toHaveProperty("unlockedAt");
    expect(emojiOf(album, firstThankYou)).toMatchObject({ earned: true, seen: false });
  });
});

describe("LP19a: a medal unlocked by a turn pays XP by its metal", { timeout: 60_000 }, () => {
  test("while milestone-xp is on, a turn answers each tier it unlocks with its XP, 100 for bronze, and pays it once after the turn, a replay paying nothing", async () => {
    await switchWebsite(t, postHog, true, ...itemsOn, "milestone-xp");
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;

    const turned = await turnTheItem(asAlice, "sticker");
    await settle(t);
    const paid = (await albumOf(asAlice)).level.xp;
    const again = await turn(asAlice, await itemOf(alice, "sticker"));
    await settle(t);

    expect(turned.unlocked.milestones.map(({ tier, xp }) => [tier, xp])).toEqual(turned.unlocked.milestones.map(() => ["bronze", 100]));
    expect(turned.unlocked.milestones).toContainEqual({ ...firstFace, xp: 100 });
    expect(paid - before, "the pack bonus and every bronze medal").toBe((turned.applied?.xp ?? 0) + 100 * turned.unlocked.milestones.length);
    expect(again).toMatchObject({ unlocked: { milestones: [] } });
    expect((await albumOf(asAlice)).level.xp, "after the replay").toBe(paid);
  });

  test("a turn that unlocks silver, gold and diamond pays 250, 500 and 1000, each recorded once under the tier's reward key", async () => {
    await switchWebsite(t, postHog, true, ...itemsOn, "milestone-xp");
    const member = await memberOf(alice);
    const medals = [
      { milestone: "people", tier: "silver" },
      { milestone: "teams", tier: "gold" },
      { milestone: "hoggies", tier: "diamond" },
    ] as const;
    await t.run(async (ctx) => {
      for (const medal of medals) await ctx.db.insert("milestoneTiers", { member, ...medal, at: Date.now(), catalogue: milestoneCatalogue.version });
    });
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;

    const turned = await turnTheItem(asAlice, "sticker");
    const payments = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).filter(({ name }) => name.includes("payMedalsUnlocked")).length);
    await settle(t);
    await turn(asAlice, await itemOf(alice, "sticker"));
    await settle(t);

    expect(payments, "one payment for all of the turn's medals, so they never contend").toBe(1);
    for (const [medal, xp] of [[medals[0], 250], [medals[1], 500], [medals[2], 1000]] as const) expect(turned.unlocked.milestones).toContainEqual({ ...medal, xp });
    const owed = turned.unlocked.milestones.reduce((sum, { xp = 0 }) => sum + xp, 0);
    expect((await albumOf(asAlice)).level.xp - before, "the pack bonus and every medal, once").toBe((turned.applied?.xp ?? 0) + owed);
    const rewards = await t.run((ctx) => ctx.db.query("rewardRecords").collect());
    expect(rewards.filter(({ key }) => medals.some(({ milestone, tier }) => key === `milestone:${milestone}:${tier}`)).map(({ key, xp }) => [key, xp])).toEqual([
      ["milestone:people:silver", 250],
      ["milestone:teams:gold", 500],
      ["milestone:hoggies:diamond", 1000],
    ]);
  });

  test("while milestone-xp is off, a turn unlocks its tiers as before and pays no medal XP", async () => {
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;

    const turned = await turnTheItem(asAlice, "sticker");
    await settle(t);

    expect(turned.unlocked.milestones).toContainEqual(firstFace);
    expect(turned.unlocked.milestones.filter((tier) => "xp" in tier)).toEqual([]);
    expect((await albumOf(asAlice)).level.xp - before).toBe(turned.applied?.xp ?? 0);
  });
});

function person(first: string, last: string): Person {
  return { user: `U_${first}_${last}`.toUpperCase(), name: `${first} ${last}` };
}

function thanks(giver: Person, ...recipients: Person[]) {
  return thanksWith("taco", giver, ...recipients);
}

async function thanksWith(kudosEmoji: string, giver: Person, ...recipients: Person[]) {
  messages += 1;
  vi.setSystemTime(Date.now() + minuteMs);
  const at = Date.now();
  const ts = `${at / 1000}.${String(messages).padStart(6, "0")}`;
  await post(t, [section(text(`${why} `), ...recipients.map(({ user }) => mention(user)), emoji(kudosEmoji))], { user: giver.user, ts });
  await settle(t);
  return at;
}

async function hugsWith(reaction: string, giver: Person, author: Person) {
  messages += 1;
  vi.setSystemTime(Date.now() + minuteMs);
  const ts = `${Date.now() / 1000}.${String(messages).padStart(6, "0")}`;
  await react(t, { eventId: `EvHug${messages}`, user: giver.user, itemUser: author.user, reaction, ts });
  await settle(t);
}

async function hugsCount() {
  return (await t.run((ctx) => ctx.db.query("hugs").collect())).length;
}

function turn(reader: Reader, item: Id<"items">): Promise<TurnAnswer | Denial> {
  return reader.mutation(api.website.album.turnItem, { item });
}

async function turnTheItem(reader: Reader, source: Doc<"items">["source"]): Promise<Turned> {
  const turned = await turn(reader, await itemOf(alice, source));
  if (turned.kind !== "turned") throw new Error(`expected the ${source} turned, got ${JSON.stringify(turned)}`);
  return turned;
}

async function albumOf(reader: Reader): Promise<AlbumAnswer> {
  const album: AlbumRead | { kind: string } = await reader.query(api.website.album.getAlbum, {});
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album as AlbumAnswer;
}

function tierOf(album: AlbumAnswer, { milestone, tier }: Tier) {
  return album.milestones.find(({ id }) => id === milestone)?.tiers.find((listed) => listed.tier === tier);
}

function emojiOf(album: AlbumAnswer, { milestone, tier }: Tier) {
  return album.emojis.find(({ id }) => id === `milestone:${milestone}:${tier}`);
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
  return row!._id;
}

async function itemOf(giver: Person, source: Doc<"items">["source"]): Promise<Id<"items">> {
  const member = await memberOf(giver);
  const items = await t.run((ctx) =>
    ctx.db
      .query("items")
      .withIndex("by_member_turned", (q) => q.eq("member", member))
      .collect(),
  );
  const item = items.find((row) => row.source === source);
  if (item === undefined) throw new Error(`no ${source} item for ${giver.name}`);
  return item._id;
}
