import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, routedFetch } from "../../testing/fakePostHog";
import { aCutout, FakePostHogCom, type TeamPage } from "../../testing/fakePostHogCom";
import { FakeSlack } from "../../testing/fakeSlack";
import { memberChanged, post, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, section, text } from "../../testing/slackMessages";
import { aDeploymentForWorkspace, aSignedInSession, switchWebsite } from "../../testing/website";
import { api, internal } from "../_generated/api";
import { xpToReach } from "../progression/levels";
import { mostHypeEmojisShown, mostPeoplePackedRead } from "./earnedEmojis";
import schema from "../schema";
import type { AlbumAnswer, AlbumRead } from "../website/album";
import type { MemberId } from "../workspace/directory";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const weekMs = 7 * 24 * 60 * minuteMs;
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const onboardingOn = [...albumOpen, "hidden-items", "onboarding"];
const raisedHandsPicture = "https://a.slack-edge.com/production-standard-emoji-assets/17.0/apple-large/1f64c.png";

type Person = { user: string; name: string; picture?: string };
type Reader = Pick<Backend, "query" | "mutation">;
type Emoji = AlbumAnswer["emojis"][number];

const alice = person("Alice", "Marchetti");
const bruno = person("Bruno", "Castellane");
const otters = Array.from({ length: 3 }, (_, index) => person("Otter", `Quillfeather${index + 1}`));
const lanterns = Array.from({ length: 2 }, (_, index) => person("Lantern", `Wickfield${index + 1}`));
const analysts = Array.from({ length: 2 }, (_, index) => person("Analyst", `Funnelwright${index + 1}`));
const crowd = Array.from({ length: 25 }, (_, index) => person("Crowd", `Merriweather${index + 1}`));
const pictured = { ...person("Pia", "Snapshot"), picture: "https://avatars.slack-edge.com/pia-snapshot_192.png" };
const faceless = person("Fen", "Noface");
const everyone = [alice, bruno, ...otters, ...lanterns, ...analysts, ...crowd, pictured, faceless];
const ottersCrest = aCutout("otters-crest");
const otterCutout = aCutout("otter-quillfeather1");
const ottersCrestPicture = expect.stringMatching(/\/v1\/otters-crest\.png$/) as string;
const otterFace = expect.stringMatching(/\/v1\/otter-quillfeather1\.png$/) as string;

const levels = [5, 10, 15, 20, 25];
const milestoneTiers = [
  ["people", "bronze", "first-face", 1],
  ["people", "silver", "familiar-faces", 10],
  ["people", "gold", "full-of-friends", 25],
  ["people", "diamond", "everyone-s-album", 50],
  ["teams", "bronze", "first-full-page", 1],
  ["teams", "silver", "five-teams-strong", 5],
  ["teams", "gold", "most-of-the-company", 15],
  ["teams", "diamond", "every-page", 50],
  ["reach", "bronze", "next-door", 3],
  ["reach", "silver", "bridge-builder", 10],
  ["reach", "gold", "well-travelled", 25],
  ["reach", "diamond", "all-hands", 50],
  ["hoggies", "bronze", "curious", 10],
  ["hoggies", "silver", "collector", 40],
  ["hoggies", "gold", "hoarder", 100],
  ["hoggies", "diamond", "completionist", expect.any(Number) as unknown as number],
  ["thoughtful", "bronze", "first-thank-you", 1],
  ["thoughtful", "silver", "generous-soul", 25],
  ["thoughtful", "gold", "heart-of-the-team", 100],
  ["thoughtful", "diamond", "patron-of-praise", 500],
] as const;

let postHog: FakePostHog;
let postHogCom: FakePostHogCom;
let slack: FakeSlack;
let t: Backend;
let messages = 0;

beforeEach(async () => {
  vi.useFakeTimers({ now: tuesday });
  aDeploymentForWorkspace();
  postHog = new FakePostHog();
  postHogCom = new FakePostHogCom();
  slack = new FakeSlack();
  for (const { user, name, picture } of everyone) slack.withMember(user, { profile: { display_name: name, real_name: name, ...(picture && { image_192: picture }) } });
  vi.stubGlobal("fetch", routedFetch(postHog, (input, init) => (postHogCom.owns(new URL(input instanceof Request ? input.url : String(input))) ? postHogCom.fetch(input) : slack.fetch(input, init))));
  t = testBackend({ transactionLimits: true });
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 }));
  await switchWebsite(t, postHog, true, ...albumOpen);
  for (const someone of everyone) await memberChanged(t, "team_join", slackUser(someone));
  await settle(t);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("an earned emoji follows its cause", { timeout: 90_000 }, () => {
  test("before any cause, a member reads every company team's emoji, every milestone tier's and each level's, locked with their progress, named from the registry and pictured under their catalogue IDs, and no hype emoji", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await thanks(bruno, why, lanterns[0]!);
    await aliceCollects(otters[0]!);
    const reachedAtOne = new Set(["people:bronze", "thoughtful:bronze"]);

    expect(await emojisOf(await signedIn(alice))).toEqual(
      byId([
        locked("team:otters", "team", "team-otters", ottersCrestPicture, { have: 1, need: 3 }),
        locked("team:lanterns", "team", "team-lanterns", "/emoji/team.png", { have: 0, need: 2 }),
        locked("team:product-analytics", "team", "team-product-analytics", "/emoji/team-product-analytics.png", { have: 0, need: 2 }),
        ...milestoneTiers.map(([milestone, tier, name, at]) =>
          reachedAtOne.has(`${milestone}:${tier}`) ? earned(`milestone:${milestone}:${tier}`, "milestone", name, `/emoji/milestone-${milestone}-${tier}.png`) : locked(`milestone:${milestone}:${tier}`, "milestone", name, `/emoji/milestone-${milestone}-${tier}.png`, { have: milestone === "people" || milestone === "reach" || milestone === "thoughtful" ? 1 : expect.any(Number), need: at }),
        ),
        ...levels.map((level) => locked(`level:${level}`, "level", `level-${level}`, `/emoji/level-${level}.png`, { have: expect.any(Number), need: xpToReach(level) })),
        earned(`hype:${await memberOf(otters[0]!)}`, "hype", "otter-quillfeather1-hype", otterFace),
      ]),
    );
  });

  test("unlocking a team sticker earns its team emoji under the sticker's name, and renaming the team or its leaving posthog.com never takes it back", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await aliceCollects(...otters);
    const asAlice = await signedIn(alice);
    expect(await emojiWithId(asAlice, "team:otters")).toMatchObject({ earned: false, progress: { have: 3, need: 3 } });

    const unlocked = await asAlice.mutation(api.website.album.unlockTeamSticker, { team: "otters" });

    expect(unlocked).toMatchObject({ kind: "unlocked", sticker: { emoji: "team-otters" } });
    const teamEmoji = earned("team:otters", "team", "team-otters", ottersCrestPicture);
    expect(await emojiWithId(asAlice, "team:otters")).toEqual(teamEmoji);
    await theCompanyCopyHolds({ slug: "otters", name: "Sea Otters", crest: aCutout("otters-crest-redrawn"), profiles: profilesOf(...otters, bruno) });
    expect(await emojiWithId(asAlice, "team:otters"), "renamed with a new crest and a newcomer").toEqual(teamEmoji);
    await theCompanyCopyHolds({ slug: "lanterns", name: "Lanterns", profiles: profilesOf(...lanterns) });
    expect(await emojiWithId(asAlice, "team:otters"), "the team left posthog.com").toEqual(teamEmoji);
  });

  test("each tier a milestone reaches earns its own milestone emoji, named after that tier, and the next tier shows the count still to reach", async () => {
    await aliceCollects(...crowd);

    const people = (await emojisOf(await signedIn(alice))).filter(({ id }) => id.startsWith("milestone:people:"));

    expect(people).toEqual(
      byId([
        earned("milestone:people:bronze", "milestone", "first-face", "/emoji/milestone-people-bronze.png"),
        earned("milestone:people:silver", "milestone", "familiar-faces", "/emoji/milestone-people-silver.png"),
        earned("milestone:people:gold", "milestone", "full-of-friends", "/emoji/milestone-people-gold.png"),
        locked("milestone:people:diamond", "milestone", "everyone-s-album", "/emoji/milestone-people-diamond.png", { have: 25, need: 50 }),
      ]),
    );
  });

  test("a registry opened when only gold had an emoji keeps each gold name, and its next reservation names the other tiers, so a member who already holds a tier reads its emoji", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await aliceCollects(otters[0]!);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("emojiNames").collect()) if (row.emoji.startsWith("milestone:") && !milestoneTiers.some(([milestone, tier]) => tier === "gold" && row.emoji === `milestone:${milestone}`)) await ctx.db.delete(row._id);
    });
    const asAlice = await signedIn(alice);
    expect(await emojiWithId(asAlice, "milestone:people:bronze"), "before the tier names are reserved").toBeUndefined();
    expect(await emojiWithId(asAlice, "milestone:people:gold"), "gold, under its first name").toMatchObject({ name: "full-of-friends", earned: false });

    await theCompanyCopyHolds(...threeTeams());

    expect(await emojiWithId(asAlice, "milestone:people:bronze")).toEqual(earned("milestone:people:bronze", "milestone", "first-face", "/emoji/milestone-people-bronze.png"));
    expect((await emojisOf(asAlice)).filter(({ kind }) => kind === "milestone").map(({ name }) => name)).toEqual(byId(milestoneTiers.map(([milestone, tier, name]) => ({ id: `milestone:${milestone}:${tier}`, name }))).map(({ name }) => name));
  });

  test("a jump past two levels earns each level emoji it passed, and the next one shows the XP still to reach", async () => {
    await thanks(bruno, why, lanterns[0]!);
    await reachesXp(alice, xpToReach(10) + 5);
    const asAlice = await signedIn(alice);

    const levelEmojis = (await emojisOf(asAlice)).filter(({ kind }) => kind === "level");

    expect(levelEmojis).toEqual(
      byId([
        earned("level:5", "level", "level-5", "/emoji/level-5.png"),
        earned("level:10", "level", "level-10", "/emoji/level-10.png"),
        ...[15, 20, 25].map((level) => locked(`level:${level}`, "level", `level-${level}`, `/emoji/level-${level}.png`, { have: xpToReach(10) + 5, need: xpToReach(level) })),
      ]),
    );
  });

  test("LP71: while onboarding is on, a member at level 2 holds :raised_hands:, in Slack and pictured as Slack pictures it, and a member at level 1 reads it locked with the XP still to reach", async () => {
    await thanks(bruno, why, lanterns[0]!);
    await switchWebsite(t, postHog, true, ...onboardingOn);
    await reachesXp(alice, xpToReach(2));

    expect(await emojiWithId(await signedIn(alice), "level:2")).toEqual({ ...earned("level:2", "level", "raised_hands", raisedHandsPicture), from: "Level 2", inSlack: true });
    expect(await emojiWithId(await signedIn(bruno), "level:2")).toEqual({ ...locked("level:2", "level", "raised_hands", raisedHandsPicture, { have: 10, need: xpToReach(2) }), from: "Level 2", inSlack: true });
  });

  test.each([
    ["onboarding is off", [...albumOpen, "hidden-items"]],
    ["hidden-items is off", [...albumOpen, "onboarding"]],
  ])("LP77: while %s, nobody holds level 2's emoji and marking it seen records nothing, and it comes back with the flag", async (_, flags) => {
    await thanks(bruno, why, lanterns[0]!);
    await reachesXp(alice, xpToReach(2));
    await switchWebsite(t, postHog, true, ...flags);
    const asAlice = await signedIn(alice);

    expect(await emojiWithId(asAlice, "level:2")).toBeUndefined();
    expect(await asAlice.mutation(api.website.album.markEmojisSeen, { ids: ["level:2"] })).toEqual({ kind: "seen", ids: [] });

    await switchWebsite(t, postHog, true, ...onboardingOn);
    expect(await emojiWithId(asAlice, "level:2")).toMatchObject({ name: "raised_hands", earned: true, seen: false });
  });

  test("the first thoughtful pack for a person earns their hype emoji, pictured by their posthog.com face, else their Slack picture, else the hype emblem; a second pack earns no second one", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await thanks(alice, why, otters[0]!, pictured, faceless);
    vi.setSystemTime(Date.now() + weekMs);
    await thanks(alice, why, otters[0]!);

    const hype = (await emojisOf(await signedIn(alice))).filter(({ kind }) => kind === "hype");

    expect(hype).toEqual(
      byId([
        earned(`hype:${await memberOf(otters[0]!)}`, "hype", "otter-quillfeather1-hype", otterFace),
        earned(`hype:${await memberOf(pictured)}`, "hype", "pia-snapshot-hype", pictured.picture),
        earned(`hype:${await memberOf(faceless)}`, "hype", "fen-noface-hype", "/emoji/hype.png"),
      ]),
    );
  });

  test("#664: each emoji says what earns it, and an earned one when: the team and its unlock, the gold tier and its date, the level, and the person thanked with their first pack's date", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await aliceCollects(...otters);
    vi.setSystemTime(Date.now() + weekMs);
    await thanks(alice, why, otters[0]!);
    const asAlice = await signedIn(alice);
    const unlocked = await asAlice.mutation(api.website.album.unlockTeamSticker, { team: "otters" });
    await reachesXp(alice, xpToReach(5));
    const otter = await memberOf(otters[0]!);
    const packsForOtter = await t.run((ctx) => ctx.db.query("thoughtfulPacks").collect());
    const firstPackAt = Math.min(...packsForOtter.filter(({ recipient }) => recipient === otter).map(({ at }) => at));
    const unlockedAt = unlocked.kind === "unlocked" ? unlocked.sticker.at : null;

    const said = (await emojisOf(asAlice)).map(({ id, from, earnedAt }) => ({ id, from, earnedAt }));

    expect(said).toEqual(
      expect.arrayContaining([
        { id: "team:otters", from: "Otters", earnedAt: unlockedAt },
        { id: "team:lanterns", from: "Lanterns", earnedAt: null },
        { id: "milestone:people:gold", from: "Full of friends", earnedAt: null },
        { id: "level:5", from: "Level 5", earnedAt: null },
        { id: "level:10", from: "Level 10", earnedAt: null },
        { id: `hype:${otter}`, from: "Otter Quillfeather1", earnedAt: firstPackAt },
      ]),
    );
  });

  test("#664: the album answers the workspace's custom emoji page once the workspace's Slack address is known, and none before", async () => {
    await reachesXp(alice, xpToReach(5));
    const asAlice = await signedIn(alice);
    expect((await albumOf(asAlice)).emojiPage, "no address yet").toBeNull();

    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("workspaces")
        .withIndex("by_workspace", (q) => q.eq("workspace", "T1"))
        .unique();
      await ctx.db.patch(row!._id, { url: "https://hedgehug-sandbox.slack.com/" });
    });

    expect((await albumOf(asAlice)).emojiPage).toBe("https://hedgehug-sandbox.slack.com/customize/emoji");
  });

  test("a sticker the album's history brought earns no hype emoji, and thanking that person once more does", async () => {
    await thanks(bruno, why, lanterns[1]!);
    await aStickerTheHistoryBrought(alice, lanterns[0]!);
    const asAlice = await signedIn(alice);
    expect((await emojisOf(asAlice)).filter(({ kind }) => kind === "hype"), "a history sticker").toEqual([]);

    await thanks(alice, why, lanterns[0]!);

    expect((await emojisOf(asAlice)).filter(({ kind }) => kind === "hype")).toEqual([earned(`hype:${await memberOf(lanterns[0]!)}`, "hype", "lantern-wickfield1-hype", "/emoji/hype.png")]);
  });
});

describe("AL25: a workspace's shared emoji names, reserved by hand where nothing opened its registry", { timeout: 90_000 }, () => {
  test("before any grant or unlock a member reads no emoji; once the shared names are reserved by hand, a level-5 member reads their level emoji earned and unseen, and an admin the whole shared list", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await reachesXp(alice, xpToReach(5));
    await memberChanged(t, "user_change", { ...slackUser(bruno), is_admin: true });
    await settle(t);
    expect((await albumOf(await signedIn(alice))).emojis, "no registry yet").toEqual([]);

    await t.mutation(internal.album.emojiNames.reserveSharedEmojiNames, { workspace: "T1" });

    expect(await emojiWithId(await signedIn(alice), "level:5")).toEqual(earned("level:5", "level", "level-5", "/emoji/level-5.png"));
    expect((await albumOf(await signedIn(bruno))).sharedEmojis?.map(({ id }) => id)).toEqual(byId([...["otters", "lanterns", "product-analytics"].map((team) => ({ id: `team:${team}` })), ...milestoneTiers.map(([milestone, tier]) => ({ id: `milestone:${milestone}:${tier}` })), ...levels.map((level) => ({ id: `level:${level}` }))]).map(({ id }) => id));
  });
});

describe("AL25: a registry opened before every milestone tier had an emoji", { timeout: 90_000 }, () => {
  test("reserving the shared names by hand names the tiers it lacks and keeps every name it holds", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await aliceCollects(otters[0]!);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("emojiNames").collect()) if (/^milestone:[a-z]+:/.test(row.emoji)) await ctx.db.delete(row._id);
    });
    const namesBefore = await registry();

    await t.mutation(internal.album.emojiNames.reserveSharedEmojiNames, { workspace: "T1" });

    expect(await registry()).toEqual(expect.arrayContaining(namesBefore));
    expect((await emojisOf(await signedIn(alice))).filter(({ kind }) => kind === "milestone")).toHaveLength(milestoneTiers.length);
  });
});

describe("LP71: level 2's emoji takes Slack's standard name raised_hands", { timeout: 90_000 }, () => {
  test("reserving the shared names with no workspace names it raised_hands in every workspace whose registry is in use, keeps every name they hold and opens no registry", async () => {
    await thanks(bruno, why, lanterns[0]!);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("emojiNames").collect()) if (row.emoji === "level:2") await ctx.db.delete(row._id);
      await ctx.db.insert("emojiNames", { workspace: "T2", emoji: "level:5", name: "level-5" });
      await ctx.db.insert("workspaces", { workspace: "T3", kudosEmoji: "taco", baseAllowance: 200 });
    });
    const namesBefore = await registry();

    await t.mutation(internal.album.emojiNames.reserveSharedEmojiNames, {});

    expect(await registry()).toEqual(expect.arrayContaining(namesBefore));
    expect(await levelTwoNamesByWorkspace()).toEqual([
      { workspace: "T1", name: "raised_hands" },
      { workspace: "T2", name: "raised_hands" },
    ]);
    expect(await namesIn("T3")).toEqual([]);
  });

  test.each([
    ["the registry holds raised_hands", { emojiNames: { workspace: "T1", emoji: "team:otters", name: "raised_hands" } }],
    ["an emoji class classes raised_hands", { emojiClasses: { workspace: "T1", name: "raised_hands", class: "unmapped" } }],
  ] as const)("where %s, it is named level-2, not in Slack and pictured as Slack pictures 🙌", async (_, row) => {
    await t.run(async (ctx) => {
      if ("emojiNames" in row) await ctx.db.insert("emojiNames", row.emojiNames);
      else await ctx.db.insert("emojiClasses", row.emojiClasses);
    });
    await t.mutation(internal.album.emojiNames.reserveSharedEmojiNames, { workspace: "T1" });
    await switchWebsite(t, postHog, true, ...onboardingOn);
    await reachesXp(alice, xpToReach(2));

    expect(await emojiWithId(await signedIn(alice), "level:2")).toEqual({ ...earned("level:2", "level", "level-2", raisedHandsPicture), from: "Level 2" });
  });
});

describe("LP72: getAlbum says how to use a level emoji while onboarding is on", { timeout: 90_000 }, () => {
  test("while onboarding is on, the album answers the workspace's kudos emoji and its picture for the how-to line, and none while it is off", async () => {
    await slackHasCustomEmoji("hedgehog");
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("workspaces").collect()) await ctx.db.patch(row._id, { kudosEmoji: "hedgehog" });
    });
    await switchWebsite(t, postHog, true, ...onboardingOn);

    expect((await albumOf(await signedIn(alice))).emojiHowTo).toEqual({ kudosEmoji: "hedgehog", kudosEmojiImage: customEmojiPicture("hedgehog") });

    await switchWebsite(t, postHog, true, ...albumOpen, "hidden-items");
    expect(await albumOf(await signedIn(alice))).not.toHaveProperty("emojiHowTo");
  });
});

describe("AL26: each earned emoji is seen once", { timeout: 90_000 }, () => {
  test("an earned emoji reads unseen until markEmojisSeen names it, then seen for good; a locked, unknown or repeated ID records nothing", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await aliceCollects(otters[0]!);
    const asAlice = await signedIn(alice);
    const hype = `hype:${await memberOf(otters[0]!)}`;
    expect(await emojiWithId(asAlice, hype)).toMatchObject({ earned: true, seen: false });

    const marked = await asAlice.mutation(api.website.album.markEmojisSeen, { ids: [hype, "milestone:people:bronze", "milestone:people:silver", "milestone:people", "milestone:nowhere:bronze", "milestone:people:platinum", "team:otters", "level:5", "level:7", "hype:nobody", "nonsense", hype] });

    expect(marked).toEqual({ kind: "seen", ids: [hype, "milestone:people:bronze"] });
    expect(await emojiWithId(asAlice, hype)).toMatchObject({ earned: true, seen: true });
    expect((await emojisOf(asAlice)).filter(({ seen }) => seen).map(({ id }) => id)).toEqual(byId([{ id: hype }, { id: "milestone:people:bronze" }]).map(({ id }) => id));
    const before = await everyTable();
    expect(await asAlice.mutation(api.website.album.markEmojisSeen, { ids: [hype] }), "seen twice").toEqual({ kind: "seen", ids: [hype] });
    expect(await everyTable()).toEqual(before);
  });

  test("past the 200 hype emojis one read answers, the unseen ones come first, so a new hype emoji is never left out", async () => {
    await thanks(bruno, why, lanterns[0]!);
    const aliceId = await memberOf(alice);
    const people = await t.run(async (ctx) => {
      const ids: MemberId[] = [];
      for (let index = 0; index <= mostHypeEmojisShown; index += 1) ids.push(await ctx.db.insert("members", { workspace: "T1", user: `U_PACKED_${index}`, kind: "member", asOf: 0 }));
      return ids.toSorted();
    });
    const newest = people.at(-1)!;
    await t.run(async (ctx) => {
      for (const [index, person] of people.entries()) {
        await ctx.db.insert("thoughtfulPacks", { workspace: "T1", giver: aliceId, recipient: person, week: "2026-10-12", message: { workspace: "T1", conversation: "C1", message: `m${index}` }, holdsSticker: false, at: index });
        await ctx.db.insert("emojiNames", { workspace: "T1", emoji: "hype", person, name: `packed-${index}-hype` });
        if (person !== newest) await ctx.db.insert("seenEmojis", { member: aliceId, emoji: `hype:${person}`, at: 0 });
      }
    });

    const album = await albumOf(await signedIn(alice));

    const hype = album.emojis.filter(({ kind }) => kind === "hype");
    expect(hype).toHaveLength(mostHypeEmojisShown);
    expect(album.moreEmojis).toBe(true);
    expect(hype.filter(({ seen }) => !seen).map(({ id }) => id)).toEqual([`hype:${newest}`]);
  });

  test("a member who earned emojis before the album sees each as new on their first visit", async () => {
    await reachesXp(alice, xpToReach(5));
    await thanks(bruno, why, lanterns[0]!);

    expect(await emojiWithId(await signedIn(alice), "level:5")).toMatchObject({ earned: true, seen: false });
  });

  test("more IDs than a member could see at once are refused whole", async () => {
    await aliceCollects(otters[0]!);
    const asAlice = await signedIn(alice);
    const before = await everyTable();

    const earnedHype = `hype:${await memberOf(otters[0]!)}`;

    expect(await asAlice.mutation(api.website.album.markEmojisSeen, { ids: Array.from({ length: 501 }, () => earnedHype) })).toEqual({ kind: "refused" });
    expect(await everyTable()).toEqual(before);
  });
});

describe("AL30: an earned emoji is in Slack while the workspace's custom emoji copy holds its name", { timeout: 90_000 }, () => {
  test("a team whose name Slack already has reads in Slack once the custom emoji sync runs, and another reads not in Slack", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await aliceCollects(otters[0]!);
    const asAlice = await signedIn(alice);
    slack.withCustomEmoji("team-otters", "https://emoji.slack-edge.com/T1/team-otters/abc.png").withCustomEmoji("lanterns-old", "alias:team-otters");
    expect(await emojiWithId(asAlice, "team:otters"), "before the sync").toMatchObject({ inSlack: false });

    await t.action(internal.slack.customEmoji.syncCustomEmoji, {});
    await settle(t);

    expect(await emojiWithId(asAlice, "team:otters")).toMatchObject({ name: "team-otters", inSlack: true });
    expect(await emojiWithId(asAlice, "team:lanterns")).toMatchObject({ name: "team-lanterns", inSlack: false });
  });
});

describe("AL32: workspace admins and owners get the shared list", { timeout: 90_000 }, () => {
  test("an admin and an owner read every team, milestone and level emoji with its name, picture and whether Slack has it, and no hype emoji; another member reads none", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await aliceCollects(otters[0]!);
    await memberChanged(t, "user_change", { ...slackUser(bruno), is_admin: true });
    await memberChanged(t, "user_change", { ...slackUser(lanterns[0]!), is_owner: true });
    await settle(t);

    const shared = (await albumOf(await signedIn(bruno))).sharedEmojis;

    expect(shared).toEqual(
      byId([
        { id: "team:otters", kind: "team", name: "team-otters", from: "Otters", picture: ottersCrestPicture, inSlack: false },
        { id: "team:lanterns", kind: "team", name: "team-lanterns", from: "Lanterns", picture: "/emoji/team.png", inSlack: false },
        { id: "team:product-analytics", kind: "team", name: "team-product-analytics", from: "Product Analytics", picture: "/emoji/team-product-analytics.png", inSlack: false },
        ...milestoneTiers.map(([milestone, tier, name]) => ({ id: `milestone:${milestone}:${tier}`, kind: "milestone", name, from: expect.any(String), picture: `/emoji/milestone-${milestone}-${tier}.png`, inSlack: false })),
        ...levels.map((level) => ({ id: `level:${level}`, kind: "level", name: `level-${level}`, from: `Level ${level}`, picture: `/emoji/level-${level}.png`, inSlack: false })),
      ]),
    );
    expect((await albumOf(await signedIn(lanterns[0]!))).sharedEmojis, "an owner").toEqual(shared);
    expect((await albumOf(await signedIn(alice))).sharedEmojis, "a member who is neither").toBeNull();
  });

  test("a team that left posthog.com is off every admin's shared list, whether or not that admin unlocked its sticker", async () => {
    await theCompanyCopyHolds(...threeTeams());
    await memberChanged(t, "user_change", { ...slackUser(alice), is_admin: true });
    await memberChanged(t, "user_change", { ...slackUser(bruno), is_admin: true });
    await settle(t);
    await aliceCollects(...otters);
    await (await signedIn(alice)).mutation(api.website.album.unlockTeamSticker, { team: "otters" });

    await theCompanyCopyHolds(...threeTeams().filter(({ slug }) => slug !== "otters"));

    const teamsShared = async (someone: Person) => (await albumOf(await signedIn(someone))).sharedEmojis?.filter(({ kind }) => kind === "team").map(({ id }) => id);
    expect(await teamsShared(alice), "the admin who unlocked it").toEqual(["team:lanterns", "team:product-analytics"]);
    expect(await teamsShared(bruno), "the admin who didn't").toEqual(["team:lanterns", "team:product-analytics"]);
  });
});

describe("the album is private", { timeout: 90_000 }, () => {
  test("getAlbum answers only the signed-in member's own earned emojis, and markEmojisSeen marks only their own, whoever else earned the same emoji", async () => {
    await thanks(alice, why, otters[0]!);
    await thanks(bruno, why, otters[0]!, otters[1]!);
    const asAlice = await signedIn(alice);
    const asBruno = await signedIn(bruno);
    const otter = `hype:${await memberOf(otters[0]!)}`;
    const other = `hype:${await memberOf(otters[1]!)}`;

    expect(await asBruno.mutation(api.website.album.markEmojisSeen, { ids: [otter] })).toEqual({ kind: "seen", ids: [otter] });
    expect(await asAlice.mutation(api.website.album.markEmojisSeen, { ids: [other] }), "a hype emoji only Bruno earned").toEqual({ kind: "seen", ids: [] });

    expect((await emojisOf(asAlice)).filter(({ kind }) => kind === "hype").map(({ id, seen }) => [id, seen]), "Alice's own, unseen whatever Bruno saw").toEqual([[otter, false]]);
    expect((await emojisOf(asBruno)).filter(({ kind }) => kind === "hype").map(({ id, seen }) => [id, seen]), "Bruno's own").toEqual(byId([[otter, true], [other, false]], ([id]) => String(id)));
  });
});

describe("AL39: the album is dark where album is off, shows only to the members it is on for, and nothing exposes it", { timeout: 90_000 }, () => {
  test("turned off once an emoji is earned, markEmojisSeen answers the fixed refusal and changes no table", async () => {
    await aliceCollects(otters[0]!);
    const asAlice = await signedIn(alice);
    await switchWebsite(t, postHog, true, "collection", "packs");
    await settle(t);
    const before = await everyTable();

    expect(await asAlice.mutation(api.website.album.markEmojisSeen, { ids: [`hype:${await memberOf(otters[0]!)}`] })).toEqual({ kind: "refused" });
    await settle(t);

    expect(await everyTable()).toEqual(before);
  });
});

describe("website commands pass one guard", { timeout: 90_000 }, () => {
  test("WS61: with the website flag off markEmojisSeen answers closed, without a session signed-out, and for a member who left not-a-member, writing nothing at all", async () => {
    await aliceCollects(otters[0]!);
    const asAlice = await signedIn(alice);
    const ids = [`hype:${await memberOf(otters[0]!)}`];
    await switchWebsite(t, postHog, false, ...albumOpen);
    const closed = await everyTable();
    expect(await asAlice.mutation(api.website.album.markEmojisSeen, { ids })).toEqual({ kind: "closed" });
    expect(await everyTable()).toEqual(closed);
    await switchWebsite(t, postHog, true, ...albumOpen);
    const open = await everyTable();

    expect(await t.mutation(api.website.album.markEmojisSeen, { ids })).toEqual({ kind: "signed-out" });
    expect(await everyTable()).toEqual(open);
    await memberChanged(t, "user_change", { id: alice.user, team_id: "T1", deleted: true });
    await settle(t);
    const left = await everyTable();
    expect(await asAlice.mutation(api.website.album.markEmojisSeen, { ids })).toEqual({ kind: "not-a-member" });
    expect(await everyTable()).toEqual(left);
  });

  test("WS61: the emoji IDs are markEmojisSeen's only argument, so no call names a member", async () => {
    await aliceCollects(otters[0]!);
    const asAlice = await signedIn(alice);
    const before = await everyTable();

    await expect(asAlice.mutation(api.website.album.markEmojisSeen, { ids: [], member: await memberOf(alice) } as never)).rejects.toThrow(/member/);
    expect(await everyTable()).toEqual(before);
  });
});

function levelTwoNamesByWorkspace() {
  return t.run(async (ctx) => (await ctx.db.query("emojiNames").collect()).filter(({ emoji }) => emoji === "level:2").map(({ workspace, name }) => ({ workspace, name })).toSorted((one, other) => one.workspace.localeCompare(other.workspace)));
}

function namesIn(workspace: string) {
  return t.run((ctx) => ctx.db.query("emojiNames").withIndex("by_workspace_name", (q) => q.eq("workspace", workspace)).collect());
}

async function slackHasCustomEmoji(name: string) {
  slack.withCustomEmoji(name, customEmojiPicture(name));
  await t.action(internal.slack.customEmoji.syncCustomEmoji, {});
  await settle(t);
}

function customEmojiPicture(name: string) {
  return `https://emoji.slack-edge.com/T1/${name}/a1b2c3.png`;
}

function registry() {
  return t.run(async (ctx) => (await ctx.db.query("emojiNames").collect()).map(({ emoji, person, name }) => ({ emoji, person, name })));
}

function threeTeams(): TeamPage[] {
  return [
    { slug: "otters", name: "Otters", crest: ottersCrest, profiles: profilesOf(...otters).map((profile) => (profile.lastName === "Quillfeather1" ? { ...profile, cutout: otterCutout } : profile)) },
    { slug: "lanterns", name: "Lanterns", profiles: profilesOf(...lanterns) },
    { slug: "product-analytics", name: "Product Analytics", profiles: profilesOf(...analysts) },
  ];
}

function locked(id: Emoji["id"], kind: Emoji["kind"], name: string, picture: string, progress: Emoji["progress"]): Emoji {
  return { id, kind, name, from: expect.any(String) as string, picture, earned: false, earnedAt: null, seen: false, inSlack: false, progress };
}

function earned(id: Emoji["id"], kind: Emoji["kind"], name: string, picture: string): Emoji {
  return { id, kind, name, from: expect.any(String) as string, picture, earned: true, earnedAt: kind === "level" ? null : (expect.any(Number) as number), seen: false, inSlack: false, progress: null };
}

function byId<T>(entries: T[], idOf: (entry: T) => string = (entry) => (entry as { id: string }).id): T[] {
  return entries.toSorted((one, other) => idOf(one).localeCompare(idOf(other)));
}

async function emojisOf(reader: Reader): Promise<Emoji[]> {
  return byId((await albumOf(reader)).emojis);
}

async function emojiWithId(reader: Reader, id: string): Promise<Emoji | undefined> {
  return (await emojisOf(reader)).find((entry) => entry.id === id);
}

async function albumOf(reader: Reader): Promise<AlbumAnswer> {
  const album: AlbumRead | { kind: string } = await reader.query(api.website.album.getAlbum, {});
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  const answer = album as AlbumAnswer;
  return { ...answer, sharedEmojis: answer.sharedEmojis === null ? null : byId(answer.sharedEmojis) };
}

async function theCompanyCopyHolds(...teams: TeamPage[]) {
  postHogCom.withTeams(...teams);
  await t.action(internal.companyProfiles.sync.syncCompanyProfiles, {});
  await settle(t);
}

async function aliceCollects(...people: Person[]) {
  await thanks(alice, why, ...people);
  const asAlice = await signedIn(alice);
  const album = await asAlice.query(api.website.album.getAlbum, {});
  for (const { pack } of album.kind === "album" ? album.packs : []) await asAlice.mutation(api.website.album.openThoughtfulPack, { pack });
  for (let placed = await asAlice.mutation(api.website.album.putAllIn, {}); placed.kind === "placed" && placed.more; ) placed = await asAlice.mutation(api.website.album.putAllIn, {});
  await settle(t);
}

async function thanks(giver: Person, words: string, ...recipients: Person[]) {
  messages += 1;
  vi.setSystemTime(Date.now() + minuteMs);
  await post(t, [section(text(`${words} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts: `${Date.now() / 1000}.${String(messages).padStart(6, "0")}` });
  await settle(t);
}

async function reachesXp(someone: Person, xp: number) {
  const member = await memberOf(someone);
  await t.run(async (ctx) => {
    const progress = await ctx.db
      .query("memberProgress")
      .withIndex("by_member", (q) => q.eq("member", member))
      .unique();
    if (progress === null) await ctx.db.insert("memberProgress", { member, xp, pointsSpent: 0 });
    else await ctx.db.patch(progress._id, { xp });
  });
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

function person(first: string, last: string): Person {
  return { user: `U_${first}_${last}`.toUpperCase(), name: `${first} ${last}` };
}

function slackUser({ user, name, picture }: Person) {
  return { id: user, team_id: "T1", name, real_name: name, profile: { real_name: name, display_name: name, ...(picture && { image_192: picture }) } };
}

function profilesOf(...people: Person[]): TeamPage["profiles"] {
  return people.map(({ name }) => {
    const [firstName, lastName] = name.split(" ") as [string, string];
    return { id: everyone.findIndex((someone) => someone.name === name) + 1, firstName, lastName, colour: "teal" };
  });
}

function everyTable() {
  return t.run(async (ctx) => {
    const rows: Record<string, unknown[]> = {};
    for (const table of Object.keys(schema.tables) as Array<keyof typeof schema.tables>) rows[table] = await ctx.db.query(table).collect();
    return rows;
  });
}

async function aStickerTheHistoryBrought(member: Person, person: Person) {
  const [memberId, personId] = [await memberOf(member), await memberOf(person)];
  await t.run((ctx) => ctx.db.insert("albumStickers", { member: memberId, person: personId, from: "history", at: Date.now() }));
}
