// The port of convex/album/items/milestoneUnlocks.test.ts: each milestone tier unlocks once, in the turn that brings it,
// and a medal a turn unlocks pays XP by its metal. Its setup joins the members through Slack's team_join (S3's handler,
// none registered yet); each test thanks through Slack (S4) into a pack (S9, S10), signs in (S15) and turns and reads
// on the website (S16), and the milestones, their emojis and medal XP are S9's.
import { afterEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../../testing/backend.ts";
import { emoji, mention, section, text } from "../../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../../testing/waiting.ts";
import type { Id } from "../../db/columns.ts";
import { jobs } from "../../db/schema/index.ts";
import type { Doc } from "../../db/schema/index.ts";
import type { AlbumAnswer, TurnAnswer } from "../../website/album.ts";
import type { Denial } from "../../website/memberQuery.ts";
import { notPorted } from "../../notPorted.ts";
import { milestoneCatalogue } from "../milestoneCatalogue.ts";
import { aDeploymentForWorkspace, aSignedInSession, kudosReceived, memberChanged, memberOf, person, post, react, registry, switchWebsite, type Person, type Reader } from "../albumPorts.testing.ts";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const itemsOn = [...albumOpen, "hidden-items"];
const firstThankYou = { milestone: "thoughtful", tier: "bronze" } as const;
const firstFace = { milestone: "people", tier: "bronze" } as const;

type Turned = Extract<TurnAnswer, { kind: "turned" }>;
type Tier = { milestone: string; tier: string };

const alice = person("Alice", "Marchetti");
const bob = person("Bob", "Okonkwo");
const everyone = [alice, bob];

// The members join through Slack (S3); a thanks in Slack (S4) grants a pack (S9, S10), turned and read on the website
// (S15, S16) into S9's milestones.
const unlocked: [Stack, ...Stack[]] = ["S3", "S4", "S9", "S10", "S15", "S16"];

const backend = useTestBackend({ now: tuesday, registry });
let t: TestBackend;
let messages = 0;

async function setUp() {
  aDeploymentForWorkspace();
  t = backend();
  for (const { user, name } of everyone) t.slack.withMember(user, { profile: { display_name: name, real_name: name } });
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(t, true, ...itemsOn);
  for (const { user, name } of everyone) await memberChanged(t, "team_join", { id: user, team_id: "T1", name, real_name: name, profile: { real_name: name, display_name: name } });
  await t.settle();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LP14 LP19a: each milestone tier unlocks once, in the turn that brings it", { timeout: 60_000 }, () => {
  waitsOn(unlocked, "a turn that reaches a tier answers it, reads it earned from the turn with its emoji earned and seen, so no emoji moment shows it, and a replay answers none", async () => {
    await setUp();
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    t.time.advance(minuteMs);

    const turned = await turnTheItem(asAlice, "sticker");
    const again = await turn(asAlice, await itemOf(alice, "sticker"));

    expect(turned.unlocked.milestones).toContainEqual(firstFace);
    expect(again).toMatchObject({ kind: "turned", again: true, unlocked: { milestones: [] } });
    const album = await albumOf(asAlice);
    expect(tierOf(album, firstFace)).toMatchObject({ earnedAt: t.clock.now(), unlockedAt: t.clock.now() });
    expect(emojiOf(album, firstFace)).toMatchObject({ earned: true, seen: true });
  });

  waitsOn(unlocked, "a thoughtful tier reached in Slack reads unearned, its emoji too, until the giver's next turn, which answers it once and reads it unlocked at the turn", async () => {
    await setUp();
    const thanked = await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const before = await albumOf(asAlice);
    t.time.advance(minuteMs);

    const first = await turnTheItem(asAlice, "hoggie");
    const unlockedAt = t.clock.now();
    t.time.advance(minuteMs);
    const second = await turnTheItem(asAlice, "sticker");

    expect(tierOf(before, firstThankYou)).toMatchObject({ earnedAt: null });
    expect(emojiOf(before, firstThankYou)).toMatchObject({ earned: false, seen: false });
    expect(first.unlocked.milestones).toEqual([firstThankYou]);
    expect(second.unlocked.milestones).not.toContainEqual(firstThankYou);
    const after = await albumOf(asAlice);
    expect(tierOf(after, firstThankYou)).toMatchObject({ earnedAt: thanked, unlockedAt });
    expect(emojiOf(after, firstThankYou)).toMatchObject({ earned: true, seen: true });
  });

  // The shared emoji names are S9's; a hug is S13's, through Slack's reaction handler (S4).
  waitsOn(["S13", ...unlocked], "a thoughtful tier reached in Slack gives no kudos and no hug with its emoji until the giver's next turn unlocks it", async () => {
    await setUp();
    await switchWebsite(t, true, ...itemsOn, "hugs");
    await reserveSharedEmojiNames("T1");
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

  waitsOn(unlocked, "with hidden-items off a thoughtful tier reads earned at the thanks with its emoji unseen, as today", async () => {
    await setUp();
    await switchWebsite(t, true, ...albumOpen);
    const thanked = await thanks(alice, bob);

    const album = await albumOf(await signedIn(alice));

    expect(tierOf(album, firstThankYou)).toEqual(expect.objectContaining({ earnedAt: thanked }));
    expect(tierOf(album, firstThankYou)).not.toHaveProperty("unlockedAt");
    expect(emojiOf(album, firstThankYou)).toMatchObject({ earned: true, seen: false });
  });
});

describe("LP19a: a medal unlocked by a turn pays XP by its metal", { timeout: 60_000 }, () => {
  waitsOn(unlocked, "while milestone-xp is on, a turn answers each tier it unlocks with its XP, 100 for bronze, and pays it once after the turn, a replay paying nothing", async () => {
    await setUp();
    await switchWebsite(t, true, ...itemsOn, "milestone-xp");
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;

    const turned = await turnTheItem(asAlice, "sticker");
    await t.settle();
    const paid = (await albumOf(asAlice)).level.xp;
    const again = await turn(asAlice, await itemOf(alice, "sticker"));
    await t.settle();

    expect(turned.unlocked.milestones.map(({ tier, xp }) => [tier, xp])).toEqual(turned.unlocked.milestones.map(() => ["bronze", 100]));
    expect(turned.unlocked.milestones).toContainEqual({ ...firstFace, xp: 100 });
    expect(paid - before, "the pack bonus and every bronze medal").toBe((turned.applied?.xp ?? 0) + 100 * turned.unlocked.milestones.length);
    expect(again).toMatchObject({ unlocked: { milestones: [] } });
    expect((await albumOf(asAlice)).level.xp, "after the replay").toBe(paid);
  });

  waitsOn(unlocked, "a turn that unlocks silver, gold and diamond pays 250, 500 and 1000, each recorded once under the tier's reward key", async () => {
    await setUp();
    await switchWebsite(t, true, ...itemsOn, "milestone-xp");
    const member = await memberOf(t, alice);
    const medals = [
      { milestone: "people", tier: "silver" },
      { milestone: "teams", tier: "gold" },
      { milestone: "hoggies", tier: "diamond" },
    ] as const;
    for (const medal of medals) await t.seed.insert("milestoneTiers", { member, ...medal, at: t.clock.now(), catalogue: milestoneCatalogue.version });
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;

    const turned = await turnTheItem(asAlice, "sticker");
    const payments = await t.query(async ({ tx }) => (await tx.select({ name: jobs.name }).from(jobs)).filter(({ name }) => name.includes("payMedalsUnlocked")).length);
    await t.settle();
    await turn(asAlice, await itemOf(alice, "sticker"));
    await t.settle();

    expect(payments, "one payment for all of the turn's medals, so they never contend").toBe(1);
    for (const [medal, xp] of [[medals[0], 250], [medals[1], 500], [medals[2], 1000]] as const) expect(turned.unlocked.milestones).toContainEqual({ ...medal, xp });
    const owed = turned.unlocked.milestones.reduce((sum, { xp = 0 }) => sum + xp, 0);
    expect((await albumOf(asAlice)).level.xp - before, "the pack bonus and every medal, once").toBe((turned.applied?.xp ?? 0) + owed);
    const rewards = await t.seed.all("rewardRecords");
    expect(rewards.filter(({ key }) => medals.some(({ milestone, tier }) => key === `milestone:${milestone}:${tier}`)).map(({ key, xp }) => [key, xp])).toEqual([
      ["milestone:people:silver", 250],
      ["milestone:teams:gold", 500],
      ["milestone:hoggies:diamond", 1000],
    ]);
  });

  waitsOn(unlocked, "while milestone-xp is off, a turn unlocks its tiers as before and pays no medal XP", async () => {
    await setUp();
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const before = (await albumOf(asAlice)).level.xp;

    const turned = await turnTheItem(asAlice, "sticker");
    await t.settle();

    expect(turned.unlocked.milestones).toContainEqual(firstFace);
    expect(turned.unlocked.milestones.filter((tier) => "xp" in tier)).toEqual([]);
    expect((await albumOf(asAlice)).level.xp - before).toBe(turned.applied?.xp ?? 0);
  });
});

function thanks(giver: Person, ...recipients: Person[]) {
  return thanksWith("taco", giver, ...recipients);
}

async function thanksWith(kudosEmoji: string, giver: Person, ...recipients: Person[]) {
  messages += 1;
  t.time.advance(minuteMs);
  const at = t.clock.now();
  const ts = `${at / 1000}.${String(messages).padStart(6, "0")}`;
  await post(t, [section(text(`${why} `), ...recipients.map(({ user }) => mention(user)), emoji(kudosEmoji))], { user: giver.user, ts });
  await t.settle();
  return at;
}

async function hugsWith(reaction: string, giver: Person, author: Person) {
  messages += 1;
  t.time.advance(minuteMs);
  const ts = `${t.clock.now() / 1000}.${String(messages).padStart(6, "0")}`;
  await react(t, { eventId: `EvHug${messages}`, user: giver.user, itemUser: author.user, reaction, ts });
  await t.settle();
}

async function hugsCount() {
  return (await t.seed.all("hugs")).length;
}

/**
 * Today's `t.mutation(internal.album.emojiNames.reserveSharedEmojiNames, { workspace })`. It is no website command, so
 * S15's route table will never list it, and the module map gave S9's `emojiNames.ts` no stub for it because only tests
 * call it. The test waits on S9 exporting it from that module; this then becomes
 * `t.run((ctx) => reserveSharedEmojiNames(ctx, { workspace }))`.
 */
async function reserveSharedEmojiNames(workspace: string): Promise<void> {
  void workspace;
  throw notPorted("album.emojiNames.reserveSharedEmojiNames");
}

async function signedIn(person: Person) {
  return (await aSignedInSession(t, person)).asSignedIn;
}

function turn(reader: Reader, item: Id<"items">): Promise<TurnAnswer | Denial> {
  return reader.turnItem({ item });
}

async function turnTheItem(reader: Reader, source: Doc<"items">["source"]): Promise<Turned> {
  const turned = await turn(reader, await itemOf(alice, source));
  if (turned.kind !== "turned") throw new Error(`expected the ${source} turned, got ${JSON.stringify(turned)}`);
  return turned;
}

async function albumOf(reader: Reader): Promise<AlbumAnswer> {
  const album = await reader.getAlbum();
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album as AlbumAnswer;
}

function tierOf(album: AlbumAnswer, { milestone, tier }: Tier) {
  return album.milestones.find(({ id }) => id === milestone)?.tiers.find((listed) => listed.tier === tier);
}

function emojiOf(album: AlbumAnswer, { milestone, tier }: Tier) {
  return album.emojis.find(({ id }) => id === `milestone:${milestone}:${tier}`);
}

// The first of the giver's items from the source, in `items.by_member_turned`'s order: waiting ones first.
async function itemOf(giver: Person, source: Doc<"items">["source"]): Promise<Id<"items">> {
  const member = await memberOf(t, giver);
  const items = (await t.seed.all("items"))
    .filter((row) => row.member === member)
    .sort((a, b) => (a.turnedAt ?? -Infinity) - (b.turnedAt ?? -Infinity) || a.earnedAt - b.earnedAt || a._creationTime - b._creationTime);
  const item = items.find((row) => row.source === source);
  if (item === undefined) throw new Error(`no ${source} item for ${giver.name}`);
  return item._id;
}
