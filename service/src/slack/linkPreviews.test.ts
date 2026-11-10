// Today's convex/slack/linkPreviews.test.ts on the service: a `link_shared` event through the signed front door, Slack
// and PostHog faked behind `fetch`. Every test's setup ships the Book and records its people through the directory, and
// a card's facts come from the website's previews, so each waits on the stacks a link card reaches. Today's
// transaction-limit runs keep their names and assertions; Postgres has no such limit to switch on.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import type { FlagDefinition } from "../../testing/fakePostHog.ts";
import { rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import { flagsFromPostHog, offForEveryone, onForEveryone, onInTheSandboxOnly } from "../../testing/flags.ts";
import { linkSharedEvent, type LinkSharedOptions } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import type { LadderId, TierId } from "../achievements/ladders.ts";
import { catalogue } from "../album/hoggies/catalogue.ts";
import type { KudosGivenEvent } from "../bus/events.ts";
import { allowanceDay } from "../engine/allowance.ts";
import { countKudosGiven } from "../leaderboard/totals.ts";
import { xpToReach } from "../progression/levels.ts";
import type { MemberId } from "../workspace/directory.ts";
import { pictureAt } from "./cardPictures.ts";
import { bookShippedBeforeAnyoneJoined, memberChanged, memberOf as memberOrNull, settle, useHugsBackend } from "./hugsTesting.ts";

/**
 * A link card reaches S3's directory, S6's Book and progression, S10's card pictures, S11's leaderboard counts and
 * S17's previews and card stats.
 */
const reachedByALink: [Stack, ...Stack[]] = ["S3", "S6", "S10", "S11", "S17"];

const now = new Date("2026-10-21T10:00:00Z");
const monthsAgo = "2026-08-04";
const site = "https://hedgehug.example";
const previewsFlag = "link-previews";
const everyFlag = ["xp-levels", "unlocks", "achievements", previewsFlag];
const levelThreeXp = 150;
const junoFace = "https://res.cloudinary.com/posthog/juno.png";
const bramPicture = "https://avatars.slack-edge.com/bram.png";
const kettleCrest = "https://res.cloudinary.com/posthog/kettle-works.png";
const timeout = 60_000;

const people = {
  U_JUNO: { profile: { display_name: "Juno Park" } },
  U_BRAM: { profile: { display_name: "Bram Ode", image_192: bramPicture } },
  U_BOT: { is_bot: true },
};

const backend = useHugsBackend(now);

beforeEach(() => {
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("SITE_URL", `${site}/`);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LP78 LP79: a person or team link pasted into Slack unfolds into its card", () => {
  waitsOn(reachedByALink, "a person link unfolds into their face, name, teams, level and best medals, linked to the page", async () => {
    const t = await workspace();
    const juno = await memberOf(t, "U_JUNO");
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url], { user: "U_BRAM" });

    expect(t.slack.callsTo("chat.unfurl")).toEqual([
      {
        channel: "C_GENERAL",
        ts: "1760349800.000100",
        unfurls: {
          [url]: {
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: `*<${fromALinkCard(url)}|Juno Park>*\nLevel 3 · Kettle Works, Lanterns\n🥇 Pillar · 🥉 First Thanks`, verbatim: true },
                accessory: { type: "image", image_url: junoFace, alt_text: "Juno Park" },
              },
              { type: "context", elements: [{ type: "mrkdwn", text: "HedgeHug album · person page" }] },
            ],
          },
        },
      },
    ]);
  }, timeout);

  waitsOn(reachedByALink, "anyone's link unfolds, the sharer's own included, and a person without a company face shows their Slack picture", async () => {
    const t = await workspace();
    const bram = await memberOf(t, "U_BRAM");
    const url = `${site}/book#people/${bram}`;

    await shared(t, [url], { user: "U_BRAM" });

    expect(cardOf(t, url)).toEqual({
      type: "section",
      text: { type: "mrkdwn", text: `*<${fromALinkCard(url)}|Bram Ode>*\nLevel 1`, verbatim: true },
      accessory: { type: "image", image_url: bramPicture, alt_text: "Bram Ode" },
    });
  }, timeout);

  waitsOn(reachedByALink, "HH93: a link copied from another Slack message unfolds under the address it was shared with, and its card names the link card as the source", async () => {
    const t = await workspace();
    const bram = await memberOf(t, "U_BRAM");
    const copied = `${site}/book?src=monday-post#people/${bram}`;

    await shared(t, [copied], { user: "U_BRAM" });

    expect(cardOf(t, copied)).toMatchObject({ text: { text: `*<${site}/book?src=link-card#people/${bram}|Bram Ode>*\nLevel 1` } });
  }, timeout);

  waitsOn(reachedByALink, "a team link unfolds into its crest, name and size", async () => {
    const t = await workspace();
    const url = `${site}/book#teams/kettle-works`;

    await shared(t, [url]);

    expect(t.slack.callsTo("chat.unfurl")[0]!.unfurls).toEqual({
      [url]: {
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*<${fromALinkCard(url)}|Kettle Works>*\n3 people`, verbatim: true },
            accessory: { type: "image", image_url: kettleCrest, alt_text: "Kettle Works" },
          },
          { type: "context", elements: [{ type: "mrkdwn", text: "HedgeHug album · team page" }] },
        ],
      },
    });
  }, timeout);

  waitsOn(reachedByALink, "a team without a crest picture unfolds without one, and a name with a mention or Slack's brackets is escaped and read verbatim, so it neither links nor notifies", async () => {
    const t = await workspace();
    await t.seed.insert("companyTeams", { team: "angle-brackets", name: "<!here> Ops & @channel", leads: [], people: [9], asOf: 0 });
    const url = `${site}/book#teams/angle-brackets`;

    await shared(t, [url]);

    expect(cardOf(t, url)).toEqual({ type: "section", text: { type: "mrkdwn", text: `*<${fromALinkCard(url)}|&lt;!here&gt; Ops &amp; @channel>*\n1 person`, verbatim: true } });
  }, timeout);

  waitsOn(reachedByALink, "a team with the catalogue's own crest still shows its posthog.com crest picture", async () => {
    const t = await workspace();
    await t.seed.insert("companyTeams", { team: "people-ops", name: "People & Ops", crestImage: "https://res.cloudinary.com/posthog/people-ops.png", leads: [], people: [4, 5], asOf: 0 });
    const url = `${site}/book#teams/people-ops`;

    await shared(t, [url]);

    expect(cardOf(t, url)).toMatchObject({ accessory: { type: "image", image_url: "https://res.cloudinary.com/posthog/people-ops.png", alt_text: "People & Ops" } });
  }, timeout);

  waitsOn(reachedByALink, "several links in one message unfold together in one call", async () => {
    const t = await workspace();
    const juno = `${site}/book#people/${await memberOf(t, "U_JUNO")}`;
    const team = `${site}/book#teams/lanterns`;

    await shared(t, [juno, team]);

    expect(t.slack.callsTo("chat.unfurl")).toEqual([{ channel: "C_GENERAL", ts: "1760349800.000100", unfurls: { [juno]: expect.anything(), [team]: expect.anything() } }]);
  }, timeout);

  waitsOn(reachedByALink, "Slack holding the unfold back for a while gets it again once the wait is over", async () => {
    const t = await workspace();
    t.slack.answering("chat.unfurl", rateLimitedFor(20));

    await shared(t, [`${site}/book#teams/lanterns`]);

    expect(t.slack.callsTo("chat.unfurl")).toHaveLength(2);
  }, timeout);

  waitsOn(reachedByALink, "Slack refusing the unfold is logged by its code and not retried", async () => {
    const t = await workspace();
    t.slack.answering("chat.unfurl", slackError("missing_scope"));

    await shared(t, [`${site}/book#teams/lanterns`]);

    expect(t.slack.callsTo("chat.unfurl")).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith("link previews: chat.unfurl failed: missing_scope");
  }, timeout);

  waitsOn(reachedByALink, "Slack delivering the same event twice unfolds it once", async () => {
    const t = await workspace();
    const url = `${site}/book#teams/lanterns`;

    await shared(t, [url], { eventId: "Ev_SAME" });
    await shared(t, [url], { eventId: "Ev_SAME" });

    expect(t.slack.callsTo("chat.unfurl")).toHaveLength(1);
  }, timeout);
});

describe("LP80: only a HedgeHug person or team page unfolds", () => {
  for (const [what, url] of [
    ["another site", "https://elsewhere.example/book#teams/lanterns"],
    ["a page that isn't a person or a team", `${site}/book#hoggies`],
    ["the leaderboard", `${site}/leaderboard`],
    ["a team nobody has", `${site}/book#teams/nobody`],
    ["a person ID that isn't one", `${site}/book#people/not-an-id`],
  ] as const) {
    waitsOn(reachedByALink, `${what} gets no card`, async () => {
      const t = await workspace();

      await shared(t, [url]);

      expect(t.slack.callsTo("chat.unfurl")).toEqual([]);
    }, timeout);
  }

  waitsOn(reachedByALink, "a bot's page and a person of another workspace get no card, and a message mixing them with a team link unfolds only the team", async () => {
    const t = await workspace();
    await memberChanged(t, "team_join", { id: "U_BOT", is_bot: true });
    await t.settle();
    const bot = `${site}/book#people/${await memberOf(t, "U_BOT")}`;
    const outsider = `${site}/book#people/${await outsiderOf(t)}`;
    const team = `${site}/book#teams/lanterns`;

    await shared(t, [bot, outsider, team]);

    expect(Object.keys(t.slack.callsTo("chat.unfurl")[0]!.unfurls as object)).toEqual([team]);
  }, timeout);

  waitsOn(reachedByALink, "a link still in the composer gets no card, since Slack doesn't say yet where it will be posted", async () => {
    const t = await workspace();

    await shared(t, [`${site}/book#teams/lanterns`], { source: "composer", unfurlId: "C123456.7890.U_BRAM" });

    expect(t.slack.callsTo("chat.unfurl")).toEqual([]);
  }, timeout);

  waitsOn(reachedByALink, "a link posted in a channel shared with another organization gets no card", async () => {
    const t = await workspace();

    await shared(t, [`${site}/book#people/${await memberOf(t, "U_JUNO")}`, `${site}/book#teams/lanterns`], { externallyShared: true });

    expect(t.slack.callsTo("chat.unfurl")).toEqual([]);
  }, timeout);

  for (const [what, channel, unfolds] of [
    ["an unshared channel", { name: "general" }, 1],
    ["a channel shared with another organization", { name: "general", kind: "shared" as const }, 0],
    ["a channel whose sharing is pending", { name: "general", kind: "pending-shared" as const }, 0],
  ] as const) {
    waitsOn(reachedByALink, `where Slack doesn't say whether the channel is shared, the app asks, and a link in ${what} unfolds only if it isn't`, async () => {
      const t = await workspace();
      t.slack.withChannel("C_GENERAL", channel);

      await shared(t, [`${site}/book#teams/lanterns`], { externallyShared: "unsaid" });

      expect(t.slack.callsTo("chat.unfurl")).toHaveLength(unfolds);
    }, timeout);
  }

  waitsOn(reachedByALink, "where Slack doesn't say whether the channel is shared and won't answer, the link gets no card", async () => {
    const t = await workspace();

    await shared(t, [`${site}/book#teams/lanterns`], { externallyShared: "unsaid" });

    expect(t.slack.callsTo("conversations.info")).toEqual([{ channel: "C_GENERAL" }]);
    expect(t.slack.callsTo("chat.unfurl")).toEqual([]);
  }, timeout);

  waitsOn(reachedByALink, "a link shared in another workspace gets no card", async () => {
    const t = await workspace();

    await shared(t, [`${site}/book#teams/lanterns`], { team: "T_OTHER" });

    expect(t.slack.callsTo("chat.unfurl")).toEqual([]);
  }, timeout);
});

describe("LP81: a card shows only what the page shows every member", () => {
  waitsOn(reachedByALink, "a card names no counts between the sharer and the person, no XP and no kudos totals, whoever shares it", async () => {
    const t = await workspace();
    const url = `${site}/book#people/${await memberOf(t, "U_JUNO")}`;

    await shared(t, [url], { user: "U_JUNO" });
    const ownShare = JSON.stringify(t.slack.callsTo("chat.unfurl")[0]!.unfurls);
    t.slack.calls.length = 0;
    await shared(t, [url], { user: "U_BRAM" });

    expect(JSON.stringify(t.slack.callsTo("chat.unfurl")[0]!.unfurls)).toBe(ownShare);
    expect(ownShare).not.toMatch(/\b(XP|kudos|hugs?)\b/i);
  }, timeout);
});

describe("LP82: link previews are behind link-previews", () => {
  waitsOn(reachedByALink, "while the flag is off for the sharer, a person or team link gets no card and the app makes no Slack call", async () => {
    const t = await workspace({ flags: withPreviews(offForEveryone(previewsFlag)) });
    const callsBefore = t.slack.calls.length;

    await shared(t, [`${site}/book#people/${await memberOf(t, "U_JUNO")}`, `${site}/book#teams/lanterns`]);
    await shared(t, [`${site}/book#teams/lanterns`], { externallyShared: "unsaid" });

    expect(t.slack.calls.slice(callsBefore)).toEqual([]);
  }, timeout);

  waitsOn(reachedByALink, "the sandbox-only flag unfolds in the sandbox", async () => {
    const t = await workspace({ flags: withPreviews(onInTheSandboxOnly(previewsFlag)) });

    await shared(t, [`${site}/book#teams/lanterns`]);

    expect(t.slack.callsTo("chat.unfurl")).toHaveLength(1);
  }, timeout);

  waitsOn(reachedByALink, "the sandbox-only flag unfolds nothing in production", async () => {
    vi.stubEnv("KUDOS_ENVIRONMENT", "production");
    const t = await workspace({ flags: withPreviews(onInTheSandboxOnly(previewsFlag)) });

    await shared(t, [`${site}/book#teams/lanterns`]);

    expect(t.slack.callsTo("chat.unfurl")).toEqual([]);
  }, timeout);

  waitsOn(reachedByALink, "a sharer the directory doesn't know yet follows the workspace decision", async () => {
    const t = await workspace();

    await shared(t, [`${site}/book#teams/lanterns`], { user: "U_STRANGER" });

    expect(t.slack.callsTo("chat.unfurl")).toHaveLength(1);
  }, timeout);
});

const richFlag = "rich-link-cards";
const richFlags = [...everyFlag, "collection", richFlag];
const madeAt = `<!date^${now.getTime() / 1000}^{date_short}|2026-10-21>`;
const asOf = `HedgeHug album · person page · as of ${madeAt}`;
const teamAsOf = `HedgeHug album · team page · as of ${madeAt}`;

describe("LP84: while rich-link-cards is on, a person card shows the level bar, the stats and the rarest hoggies", () => {
  waitsOn(reachedByALink, "a person link unfolds into the level bar, their four strongest stats and their rarest hoggies' pictures, dated", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const [juno, bram] = [await memberOf(t, "U_JUNO"), await memberOf(t, "U_BRAM")];
    await thanked(t, { [juno]: 12, [bram]: 5 });
    await found(t, juno, "asleep", "wizard", "angel");
    await collected(t, juno, bram);
    await teamEmojiInSlack(t, "kettle-works");
    await unlockedTeamSticker(t, juno, "kettle-works");
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url]);

    expect(blocksOf(t, url)).toEqual([
      {
        type: "section",
        text: { type: "mrkdwn", text: `*<${fromALinkCard(url)}|Juno Park>*\n:team-kettle-works: Kettle Works · Lanterns\n*Level 3 → 4*\n▰▰▱▱▱▱▱▱▱▱\n🥇 Pillar · 🥉 First Thanks`, verbatim: true },
        accessory: { type: "image", image_url: junoFace, alt_text: "Juno Park" },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: "🏆 *No. 1* on the all-time leaderboard" },
          { type: "mrkdwn", text: "💛 *12* kudos given" },
          { type: "mrkdwn", text: "🦔 *3* of 151 hoggies found" },
          { type: "mrkdwn", text: "📒 *1* person in their album" },
          { type: "mrkdwn", text: "🔓 *1* emoji unlocked" },
        ],
      },
      {
        type: "context",
        elements: [hoggiePicture("wizard", "Wizard"), hoggiePicture("angel", "Angel"), hoggiePicture("asleep", "Asleep"), { type: "mrkdwn", text: "Rarest find: *Wizard* · Legendary" }],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: asOf }] },
    ]);
  }, timeout);

  waitsOn(reachedByALink, "the rarest hoggies stop at nine pictures, rarest first", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await found(t, juno, "asleep", "ball", "banana", "beaker", "burger", "card", "cereal", "angel", "evel", "wizard", "rocket");
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url]);

    const pictures = blocksOf(t, url)[2] as { elements: Array<{ type: string; alt_text?: string }> };
    expect(pictures.elements.filter(({ type }) => type === "image").map(({ alt_text }) => alt_text)).toEqual(["Wizard", "Rocket", "Angel", "Evel", "Asleep", "Ball", "Banana", "Beaker", "Burger"]);
  }, timeout);

  waitsOn(reachedByALink, "a stat at zero is left out, and a tied place says so", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const [juno, bram] = [await memberOf(t, "U_JUNO"), await memberOf(t, "U_BRAM")];
    await thanked(t, { [juno]: 4, [bram]: 4 });
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url]);

    expect(blocksOf(t, url)[1]).toEqual({
      type: "section",
      fields: [
        { type: "mrkdwn", text: "🏆 *No. 1, tied* on the all-time leaderboard" },
        { type: "mrkdwn", text: "💛 *4* kudos given" },
      ],
    });
  }, timeout);

  waitsOn(reachedByALink, "the level sits on its own line, above a slim bar that fits beside the picture", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const url = `${site}/book#people/${await memberOf(t, "U_JUNO")}`;

    await shared(t, [url]);

    expect(textLinesOf(t, url)).toEqual(expect.arrayContaining(["*Level 3 → 4*", "▰▰▱▱▱▱▱▱▱▱"]));
  }, timeout);

  waitsOn(reachedByALink, "the rarest find names its rarity in a word, without a coloured square", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await found(t, juno, "angel");
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url]);

    expect(blocksOf(t, url)[2]).toEqual({ type: "context", elements: [hoggiePicture("angel", "Angel"), { type: "mrkdwn", text: "Rarest find: *Angel* · Epic" }] });
  }, timeout);

  waitsOn(reachedByALink, "their teams show right under their name, each with its team emoji where Slack has it, else the name alone", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    await teamEmojiInSlack(t, "lanterns");
    await teamEmojiNamed(t, "kettle-works");
    const url = `${site}/book#people/${await memberOf(t, "U_JUNO")}`;

    await shared(t, [url]);

    expect(textLinesOf(t, url).slice(0, 2)).toEqual([`*<${fromALinkCard(url)}|Juno Park>*`, "Kettle Works · :team-lanterns: Lanterns"]);
  }, timeout);

  waitsOn(reachedByALink, "a person on no team shows no team line", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const url = `${site}/book#people/${await memberOf(t, "U_BRAM")}`;

    await shared(t, [url]);

    expect(textLinesOf(t, url).slice(0, 2)).toEqual([`*<${fromALinkCard(url)}|Bram Ode>*`, "*Level 1 → 2*"]);
  }, timeout);

  waitsOn(reachedByALink, "the emojis they unlocked count as their album counts them: team stickers, hype, milestone and level emojis", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const [juno, bram] = [await memberOf(t, "U_JUNO"), await memberOf(t, "U_BRAM")];
    await teamEmojiNamed(t, "kettle-works");
    await unlockedTeamSticker(t, juno, "kettle-works");
    await gaveFirstPack(t, juno, bram);
    await reachedMilestoneTier(t, juno, "people", "bronze");
    await t.seed.insert("emojiNames", { workspace: "T1", emoji: "milestone:people:bronze", name: "people-bronze" });
    await t.seed.insert("emojiNames", { workspace: "T1", emoji: "level:5", name: "level-5" });
    await t.seed.insert("emojiNames", { workspace: "T1", emoji: "level:10", name: "level-10" });
    const progress = (await t.seed.all("memberProgress")).find((row) => row.member === juno);
    await t.seed.patch("memberProgress", progress!._id, { xp: xpToReach(5) });
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url]);

    expect(blocksOf(t, url)[1]).toEqual({ type: "section", fields: [{ type: "mrkdwn", text: "🔓 *4* emojis unlocked" }] });
  }, timeout);

  waitsOn(reachedByALink, "a random drop counts while its Slack emoji is there, as in the album, and not once Slack has removed it", async () => {
    const t = await workspace({ flags: [...richFlags, "random-emojis"].map(onForEveryone) });
    const [juno, bram] = [await memberOf(t, "U_JUNO"), await memberOf(t, "U_BRAM")];
    const pack = await t.seed.insert("thoughtfulPacks", { workspace: "T1", giver: juno, recipient: bram, week: "2026-10-19", message: { workspace: "T1", conversation: "C1", message: "1760000000.000100" }, holdsSticker: false, at: Date.now() });
    await t.seed.insert("customEmoji", { workspace: "T1", name: "party-parrot", image: "https://emoji.slack-edge.com/T1/party-parrot/1.png", listing: 1 });
    for (const name of ["party-parrot", "removed-from-slack"]) await t.seed.insert("randomEmojiDrops", { member: juno, name, pack, at: Date.now() });
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url]);

    expect(blocksOf(t, url)[1]).toEqual({ type: "section", fields: [{ type: "mrkdwn", text: "🔓 *1* emoji unlocked" }] });
  }, timeout);

  waitsOn(reachedByALink, "an emoji the album can't name yet isn't counted", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await reachedMilestoneTier(t, juno, "people", "bronze");
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url]);

    expect(JSON.stringify(blocksOf(t, url))).not.toMatch(/unlocked/);
  }, timeout);

  waitsOn(reachedByALink, "a member with nothing to brag about yet gets a friendly line, not a row of zeros", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const url = `${site}/book#people/${await memberOf(t, "U_BRAM")}`;

    await shared(t, [url]);

    expect(blocksOf(t, url)).toEqual([
      { type: "section", text: { type: "mrkdwn", text: `*<${fromALinkCard(url)}|Bram Ode>*\n*Level 1 → 2*\n▱▱▱▱▱▱▱▱▱▱\n🌱 Just getting started. Their first thanks and finds show up here.`, verbatim: true }, accessory: { type: "image", image_url: bramPicture, alt_text: "Bram Ode" } },
      { type: "context", elements: [{ type: "mrkdwn", text: asOf }] },
    ]);
  }, timeout);
});

describe("LP85: while rich-link-cards is on, a team card shows who said thanks, its place and its rarest hoggies", () => {
  waitsOn(reachedByALink, "a team link unfolds into the share of its people who said thanks, its all-time place, its kudos given and its people's rarest hoggies", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const [juno, bram] = [await memberOf(t, "U_JUNO"), await memberOf(t, "U_BRAM")];
    await matched(t, bram, 2);
    await thanked(t, { [juno]: 12, [bram]: 3 });
    await found(t, juno, "asleep", "angel");
    const url = `${site}/book#teams/kettle-works`;

    await shared(t, [url]);

    expect(blocksOf(t, url)).toEqual([
      {
        type: "section",
        text: { type: "mrkdwn", text: `*<${fromALinkCard(url)}|Kettle Works>*\n3 people\n▰▰▰▰▰▰▱▱▱▱  *2 of 3* have said thanks`, verbatim: true },
        accessory: { type: "image", image_url: kettleCrest, alt_text: "Kettle Works" },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: "🏆 *No. 1* on the all-time team leaderboard" },
          { type: "mrkdwn", text: "💛 *15* kudos given" },
        ],
      },
      { type: "context", elements: [hoggiePicture("angel", "Angel"), hoggiePicture("asleep", "Asleep"), { type: "mrkdwn", text: "Rarest find: *Angel* · Epic" }] },
      { type: "context", elements: [{ type: "mrkdwn", text: teamAsOf }] },
    ]);
  }, timeout);

  waitsOn(reachedByALink, "a team nobody on it has thanked yet gets a friendly line", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const url = `${site}/book#teams/kettle-works`;

    await shared(t, [url]);

    expect(blocksOf(t, url)).toEqual([
      {
        type: "section",
        text: { type: "mrkdwn", text: `*<${fromALinkCard(url)}|Kettle Works>*
3 people
🌱 No kudos yet. The first one puts Kettle Works on the board.`, verbatim: true },
        accessory: { type: "image", image_url: kettleCrest, alt_text: "Kettle Works" },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: teamAsOf }] },
    ]);
  }, timeout);
});

describe("HH29: a rich card's place is the all-time Leaderboard's by kudos given", () => {
  waitsOn(reachedByALink, "an award worth 2 kudos counts 2, sharing its place with two awards of 1, for the person and each of their teams", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const [juno, bram] = [await memberOf(t, "U_JUNO"), await memberOf(t, "U_BRAM")];
    await thanked(t, { [juno]: 2 });
    await thanked(t, { [bram]: 1 });
    await thanked(t, { [bram]: 1 });
    const [person, team] = [`${site}/book#people/${juno}`, `${site}/book#teams/lanterns`];

    await shared(t, [person, team]);

    expect(blocksOf(t, person)[1]).toEqual({
      type: "section",
      fields: [
        { type: "mrkdwn", text: "🏆 *No. 1, tied* on the all-time leaderboard" },
        { type: "mrkdwn", text: "💛 *2* kudos given" },
      ],
    });
    expect(textLinesOf(t, team)).toContain("▰▰▰▰▰▰▰▰▰▰  *1 of 1* have said thanks");
    expect(blocksOf(t, team)[1]).toEqual({
      type: "section",
      fields: [
        { type: "mrkdwn", text: "🏆 *No. 1, tied* on the all-time team leaderboard" },
        { type: "mrkdwn", text: "💛 *2* kudos given" },
      ],
    });
  }, timeout);
});

describe("LP84 LP85: a rich card stays within Convex's limits", () => {
  waitsOn(reachedByALink, "a message linking a big team, its people and their full collections unfolds every card under Convex's transaction limits", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const people = await teamWithEveryHoggie(t, "big-team", 220);
    const links = [`${site}/book#teams/big-team`, ...people.slice(0, 3).map((person) => `${site}/book#people/${person}`)];

    await shared(t, links);

    expect(Object.keys(t.slack.callsTo("chat.unfurl")[0]!.unfurls as object)).toEqual(links);
  }, timeout);

  waitsOn(reachedByALink, "a message linking ten different teams, every teammate holding every hoggie, unfolds every card under Convex's transaction limits", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const teams = Array.from({ length: 10 }, (_, index) => `team-${index}`);
    for (const [index, team] of teams.entries()) await teamWithEveryHoggie(t, team, 22, 1000 + index * 22);
    const links = teams.map((team) => `${site}/book#teams/${team}`);

    await shared(t, links);

    expect(Object.keys(t.slack.callsTo("chat.unfurl")[0]!.unfurls as object)).toEqual(links);
  }, timeout);
});

describe("LP84: a person card's emoji count stays within Convex's limits", () => {
  waitsOn(reachedByALink, "a message linking three people who each unlocked hundreds of emojis, beside a leaderboard of 900 givers, counts every one and unfolds every card under Convex's transaction limits", async () => {
    const t = await workspace({ flags: [...richFlags, "hidden-items", "random-emojis"].map(onForEveryone) });
    await boardOf(t, 900);
    const givers = await peopleWhoUnlockedEveryHype(t, 3, 500, 200);
    const links = givers.map((giver) => `${site}/book#people/${giver}`);

    await shared(t, links);

    expect(links.map((link) => JSON.stringify(blocksOf(t, link)).match(/\*(\d+)\* emojis unlocked/)?.[1] ?? null)).toEqual(["400", "400", "400"]);
  }, timeout);
});

describe("LP86: a rich card shows only the leaderboard's facts and the person's own page, the same whoever shares it", () => {
  waitsOn(reachedByALink, "a member off the boards shows no place and no kudos given, and their team doesn't count them", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await thanked(t, { [juno]: 12 });
    await t.seed.insert("leaderboardSettings", { member: juno, visible: false });
    const [person, team] = [`${site}/book#people/${juno}`, `${site}/book#teams/kettle-works`];

    await shared(t, [person, team]);

    expect(JSON.stringify(blocksOf(t, person))).not.toMatch(/leaderboard|kudos given/);
    expect(JSON.stringify(blocksOf(t, person))).toMatch(/Level 3 → 4/);
    expect(JSON.stringify(blocksOf(t, team))).not.toMatch(/leaderboard|said thanks/);
    expect(JSON.stringify(blocksOf(t, team))).toMatch(/No kudos yet/);
  }, timeout);

  waitsOn(reachedByALink, "the card is the same whoever shares it, and names no XP, no kudos received and no hugs", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await thanked(t, { [juno]: 12 });
    await found(t, juno, "wizard");
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url], { user: "U_JUNO" });
    const ownShare = JSON.stringify(blocksOf(t, url));
    t.slack.calls.length = 0;
    await shared(t, [url], { user: "U_BRAM" });

    expect(JSON.stringify(blocksOf(t, url))).toBe(ownShare);
    expect(ownShare).not.toMatch(/\bXP\b|received|\bhugs?\b/i);
  }, timeout);

  waitsOn(reachedByALink, "hoggies stay off a card while collection is off for the person", async () => {
    const t = await workspace({ flags: richFlags.filter((flag) => flag !== "collection").map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await found(t, juno, "wizard");
    const url = `${site}/book#people/${juno}`;

    await shared(t, [url]);

    expect(JSON.stringify(blocksOf(t, url))).not.toMatch(/hoggie|Wizard/i);
    expect(JSON.stringify(blocksOf(t, url))).toMatch(/Level 3 → 4/);
  }, timeout);
});

describe("LP88: rich link cards are behind rich-link-cards", () => {
  waitsOn(reachedByALink, "while the flag is off, a person and a team with everything to brag about unfold into today's card, byte for byte", async () => {
    const t = await workspace({ flags: richFlags.filter((flag) => flag !== richFlag).map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await thanked(t, { [juno]: 12 });
    await found(t, juno, "wizard");
    const [person, team] = [`${site}/book#people/${juno}`, `${site}/book#teams/kettle-works`];

    await shared(t, [person, team]);

    expect(t.slack.callsTo("chat.unfurl")[0]!.unfurls).toEqual({
      [person]: {
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*<${fromALinkCard(person)}|Juno Park>*\nLevel 3 · Kettle Works, Lanterns\n🥇 Pillar · 🥉 First Thanks`, verbatim: true }, accessory: { type: "image", image_url: junoFace, alt_text: "Juno Park" } },
          { type: "context", elements: [{ type: "mrkdwn", text: "HedgeHug album · person page" }] },
        ],
      },
      [team]: {
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*<${fromALinkCard(team)}|Kettle Works>*\n3 people`, verbatim: true }, accessory: { type: "image", image_url: kettleCrest, alt_text: "Kettle Works" } },
          { type: "context", elements: [{ type: "mrkdwn", text: "HedgeHug album · team page" }] },
        ],
      },
    });
  }, timeout);

  waitsOn(reachedByALink, "the sandbox-only flag gives production today's card", async () => {
    vi.stubEnv("KUDOS_ENVIRONMENT", "production");
    const t = await workspace({ flags: [...richFlags.filter((flag) => flag !== richFlag).map(onForEveryone), onInTheSandboxOnly(richFlag)] });
    const url = `${site}/book#teams/kettle-works`;

    await shared(t, [url]);

    expect(blocksOf(t, url)).toHaveLength(2);
    expect(JSON.stringify(blocksOf(t, url))).not.toMatch(/as of/);
  }, timeout);

  waitsOn(reachedByALink, "the sandbox-only flag gives the sandbox the rich card", async () => {
    const t = await workspace({ flags: [...richFlags.filter((flag) => flag !== richFlag).map(onForEveryone), onInTheSandboxOnly(richFlag)] });
    const url = `${site}/book#teams/kettle-works`;

    await shared(t, [url]);

    expect(JSON.stringify(blocksOf(t, url))).toMatch(/as of/);
  }, timeout);
});

const cardImageFlag = "card-image";
const cardImageFlags = [...richFlags, cardImageFlag];

describe("LP99 LP100: while card-image is on, a person link unfolds into a picture of their player card", () => {
  waitsOn(reachedByALink, "the unfold is the stored picture, its facts in the alt text, and one line with the page link and the day", async () => {
    const t = await workspace({ flags: cardImageFlags.map(onForEveryone) });
    const [juno, bram] = [await memberOf(t, "U_JUNO"), await memberOf(t, "U_BRAM")];
    await thanked(t, { [juno]: 12, [bram]: 5 });
    await thankedThisWeek(t, { [juno]: 4, [bram]: 2 });
    await found(t, juno, "asleep", "wizard", "angel");
    await collected(t, juno, bram);
    await teamEmojiInSlack(t, "kettle-works");
    await unlockedTeamSticker(t, juno, "kettle-works");
    const url = `${site}/book#people/${juno}`;

    await sharedWhileDrawing(t, [url]);

    const [picture] = await storedPicturesOf(t);
    expect(blocksOf(t, url)).toEqual([
      {
        type: "image",
        image_url: picture!.url,
        alt_text: "Juno Park's player card. Level 3, 150 XP. Kettle Works. No. 1 this week, 4 kudos. 3 of 151 hoggies found. 1 person in their album. 1 emoji unlocked. 0 medals. Rarest find: Wizard, Legendary, found 21 Oct 2026.",
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `*<${fromALinkCard(url)}|Juno Park>* · HedgeHug album · as of ${madeAt}` }] },
    ]);
  }, timeout);

  waitsOn(reachedByALink, "a quiet member's picture welcomes them in words, never a row of zeros", async () => {
    const t = await workspace({ flags: cardImageFlags.map(onForEveryone) });
    const bram = await memberOf(t, "U_BRAM");
    const url = `${site}/book#people/${bram}`;

    await sharedWhileDrawing(t, [url]);

    expect((blocksOf(t, url)[0] as { alt_text: string }).alt_text).toBe("Bram Ode's player card. Level 1, 0 XP. No team yet. Not on this week's board yet. Bram's album is just getting started. No hoggie found yet.");
  }, timeout);

  waitsOn(reachedByALink, "a team link keeps its card while card-image is on", async () => {
    const t = await workspace({ flags: cardImageFlags.map(onForEveryone) });
    const url = `${site}/book#teams/kettle-works`;

    await sharedWhileDrawing(t, [url]);

    expect(JSON.stringify(blocksOf(t, url))).toMatch(/team page · as of/);
    expect(await storedPicturesOf(t)).toEqual([]);
  }, timeout);
});

describe("LP101: a picture is drawn once per card", () => {
  waitsOn(reachedByALink, "the same card shared again shows the picture drawn the first time, without drawing it again", async () => {
    const t = await workspace({ flags: cardImageFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await thanked(t, { [juno]: 12 });
    const url = `${site}/book#people/${juno}`;
    await sharedWhileDrawing(t, [url]);
    await drawingRefused();

    await sharedWhileDrawing(t, [url], { messageTs: "1760349900.000200" });

    const [first, again] = sentPicturesOf(t, url);
    expect(first).toMatch(/^https:/);
    expect(again).toBe(first);
  }, timeout);

  waitsOn(reachedByALink, "a changed fact unfolds into a new picture that shows it", async () => {
    const t = await workspace({ flags: cardImageFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    const url = `${site}/book#people/${juno}`;
    await sharedWhileDrawing(t, [url]);

    await found(t, juno, "wizard");
    await sharedWhileDrawing(t, [url], { messageTs: "1760349900.000200" });

    const [first, again] = sentPicturesOf(t, url);
    expect(first).toMatch(/^https:/);
    expect(again).not.toBe(first);
    expect(altTextsOf(t, url)[1]).toContain("Rarest find: Wizard, Legendary");
  }, timeout);
});

describe("LP102: a picture that can't be drawn gives way to the card", () => {
  waitsOn(reachedByALink, "when drawing fails, the link unfolds into the rich card and nothing is stored", async () => {
    await drawingRefused();
    const t = await workspace({ flags: cardImageFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    const url = `${site}/book#people/${juno}`;

    await sharedWhileDrawing(t, [url]);

    expect(blocksOf(t, url)[0]).toMatchObject({ type: "section", accessory: { type: "image", image_url: junoFace } });
    expect(JSON.stringify(blocksOf(t, url))).toMatch(/person page · as of/);
    expect(await storedPicturesOf(t)).toEqual([]);
  }, timeout);

  waitsOn(reachedByALink, "when the picture can't even be looked up, the person and the team beside them still unfold into their cards", async () => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
      if (algorithm === "SHA-256" && new TextDecoder().decode(data as Uint8Array).includes('"card"')) throw new Error("no hash today");
      return digest(algorithm, data);
    });
    const t = await workspace({ flags: cardImageFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    const [person, team] = [`${site}/book#people/${juno}`, `${site}/book#teams/kettle-works`];

    await sharedWhileDrawing(t, [person, team]);

    expect(blocksOf(t, person)[0]).toMatchObject({ type: "section", accessory: { type: "image", image_url: junoFace } });
    expect(JSON.stringify(blocksOf(t, team))).toMatch(/team page · as of/);
  }, timeout);

  waitsOn(reachedByALink, "a drawing slower than 5 seconds gives way to the rich card, and the next share shows the picture it kept", async () => {
    const t = await workspace({ flags: cardImageFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    const url = `${site}/book#people/${juno}`;
    answeringLate(junoFace, 6_000);

    await sharedWhileDrawing(t, [url]);
    await sharedWhileDrawing(t, [url], { messageTs: "1760349900.000200" });

    const [late, again] = t.slack.callsTo("chat.unfurl").map(({ unfurls }) => (unfurls as Record<string, { blocks: unknown[] }>)[url]!.blocks);
    const pictures = await storedPicturesOf(t);
    expect(late![0]).toMatchObject({ type: "section", accessory: { type: "image", image_url: junoFace } });
    expect(pictures).toHaveLength(1);
    expect(again![0]).toMatchObject({ type: "image", image_url: pictures[0]!.url });
  }, timeout);
});

describe("LP103: the card picture is behind card-image", () => {
  waitsOn(reachedByALink, "while the flag is off, a person with everything to brag about unfolds into today's rich card and nothing is drawn", async () => {
    const t = await workspace({ flags: richFlags.map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    await thanked(t, { [juno]: 12 });
    const url = `${site}/book#people/${juno}`;

    await sharedWhileDrawing(t, [url]);

    expect(blocksOf(t, url)[0]).toMatchObject({ type: "section", accessory: { type: "image", image_url: junoFace } });
    expect(await storedPicturesOf(t)).toEqual([]);
  }, timeout);

  waitsOn(reachedByALink, "the sandbox-only flag gives production today's rich card", async () => {
    vi.stubEnv("KUDOS_ENVIRONMENT", "production");
    const t = await workspace({ flags: [...richFlags.map(onForEveryone), onInTheSandboxOnly(cardImageFlag)] });
    const juno = await memberOf(t, "U_JUNO");
    const url = `${site}/book#people/${juno}`;

    await sharedWhileDrawing(t, [url]);

    expect(blocksOf(t, url)[0]).toMatchObject({ type: "section" });
    expect(await storedPicturesOf(t)).toEqual([]);
  }, timeout);

  waitsOn(reachedByALink, "without rich-link-cards, the flag leaves the plain card", async () => {
    const t = await workspace({ flags: [...everyFlag, "collection", cardImageFlag].map(onForEveryone) });
    const juno = await memberOf(t, "U_JUNO");
    const url = `${site}/book#people/${juno}`;

    await sharedWhileDrawing(t, [url]);

    expect(JSON.stringify(blocksOf(t, url))).not.toMatch(/as of/);
    expect(await storedPicturesOf(t)).toEqual([]);
  }, timeout);
});

async function storedPicturesOf(t: TestBackend) {
  const rows = await t.seed.all("cardPictures");
  return Promise.all(rows.map(async ({ key }) => ({ key, url: await t.query((ctx) => pictureAt(ctx, { key })) })));
}

function withPreviews(previews: FlagDefinition) {
  return [...everyFlag.filter((flag) => flag !== previewsFlag).map(onForEveryone), previews];
}

type WorkspaceSetup = { flags?: FlagDefinition[] };

async function workspace({ flags = everyFlag.map(onForEveryone) }: WorkspaceSetup = {}) {
  const t = backend();
  for (const [user, options] of Object.entries(people)) t.slack.withMember(user, options);
  await flagsFromPostHog(t.operations, t.postHog, ...flags);
  await bookShippedBeforeAnyoneJoined(t);
  for (const user of ["U_JUNO", "U_BRAM"] as const) {
    await memberChanged(t, "team_join", { id: user, ...people[user] });
    await t.settle();
  }
  const [juno, bram] = [await memberOf(t, "U_JUNO"), await memberOf(t, "U_BRAM")];
  await t.seed.insert("companyTeams", { team: "kettle-works", name: "Kettle Works", crestImage: kettleCrest, leads: [], people: [1, 2, 3], asOf: 0 });
  await t.seed.insert("companyTeams", { team: "lanterns", name: "Lanterns", crestImage: "https://res.cloudinary.com/posthog/lanterns.png", leads: [], people: [1], asOf: 0 });
  for (const row of (await t.seed.all("companyFaces")).filter((face) => face.workspace === "T1" && (face.member === juno || face.member === bram))) await t.seed.delete("companyFaces", row._id);
  await t.seed.insert("companyFaces", { workspace: "T1", member: juno, face: { image: junoFace, colour: "#f4c430" }, profile: 1 });
  await t.seed.insert("companyFaces", { workspace: "T1", member: bram, face: null });
  await t.seed.insert("memberProgress", { member: juno, xp: levelThreeXp, pointsSpent: 0 });
  await earned(t, juno, "generosity", "bronze");
  await earned(t, juno, "dependability", "bronze", "silver", "gold");
  t.slack.calls.length = 0;
  return t;
}

async function shared(t: TestBackend, urls: string[], options: LinkSharedOptions = {}) {
  const response = await t.send("/events", linkSharedEvent(urls, { user: "U_BRAM", ...options }));
  expect(response.status).toBe(200);
  await t.settle();
}

// Today's settle in time order, with a drawing that may outlast the unfold's deadline.
async function sharedWhileDrawing(t: TestBackend, urls: string[], options: LinkSharedOptions = {}) {
  const response = await t.send("/events", linkSharedEvent(urls, { user: "U_BRAM", ...options }));
  expect(response.status).toBe(200);
  await settle(t);
}

async function drawingRefused() {
  const { Resvg } = await import("@resvg/resvg-js");
  vi.spyOn(Resvg.prototype, "render").mockImplementation(() => {
    throw new Error("drawing refused");
  });
}

type Unfurls = Record<string, { blocks: Array<{ image_url?: string; alt_text?: string }> }>;

function sentPicturesOf(t: TestBackend, url: string) {
  return t.slack.callsTo("chat.unfurl").map(({ unfurls }) => (unfurls as Unfurls)[url]!.blocks[0]!.image_url);
}

function altTextsOf(t: TestBackend, url: string) {
  return t.slack.callsTo("chat.unfurl").map(({ unfurls }) => (unfurls as Unfurls)[url]!.blocks[0]!.alt_text);
}

function answeringLate(url: string, delayMs: number) {
  const answer = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input instanceof Request ? input.url : input) === url) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return answer(input, init);
  });
}

function blocksOf(t: TestBackend, url: string): unknown[] {
  const unfurls = t.slack.callsTo("chat.unfurl")[0]!.unfurls as Record<string, { blocks: unknown[] }>;
  return unfurls[url]!.blocks;
}

function hoggiePicture(hoggie: string, name: string) {
  return { type: "image", image_url: `${site}/share/${hoggie}.png`, alt_text: name };
}

async function thanked(t: TestBackend, givers: Record<string, number>, day = monthsAgo) {
  const recipient = await thankedPersonOf(t);
  for (const [giver, kudos] of Object.entries(givers)) await kudosCounted(t, giver as MemberId, recipient, { kudos, day });
}

async function thankedThisWeek(t: TestBackend, givers: Record<string, number>) {
  await thanked(t, givers, allowanceDay(Date.now(), undefined));
}

async function thankedPersonOf(t: TestBackend): Promise<MemberId> {
  const thanked = await memberOrNull(t, "U_THANKED");
  return thanked ?? ((await t.seed.insert("members", { workspace: "T1", user: "U_THANKED", kind: "member", name: "Thanked" })) as MemberId);
}

let messagesCounted = 0;

/** Today's testing/leaderboard.ts `kudosCounted`: an award, counted on the leaderboard as its kudosGiven event counts it. */
async function kudosCounted(t: TestBackend, giver: MemberId, recipient: MemberId, { kudos = 1, day }: { kudos?: number; day: string }) {
  messagesCounted += 1;
  const message = { workspace: "T1", conversation: "C1", message: `counted-${messagesCounted}` };
  const at = Date.parse(`${day}T12:00:00Z`);
  const award = await t.seed.insert("awards", { workspace: "T1", conversation: message.conversation, message: message.message, giver, recipient, kudos, day, at });
  const event: KudosGivenEvent = {
    type: "kudosGiven",
    workspace: "T1",
    message,
    giver,
    awards: [{ award, giver, recipient, kudos }],
    via: "message",
    kudosEmoji: "taco",
    annotations: {},
    allowance: { dailyOpening: 3, dailyLeft: 2 },
    skippedMentions: 0,
    retry: false,
    inThread: false,
    day,
    at,
  };
  await t.run((ctx) => countKudosGiven(ctx, { event }));
}

async function found(t: TestBackend, member: MemberId, ...hoggies: string[]) {
  for (const [index, hoggie] of hoggies.entries()) await t.seed.insert("hoggieTallies", { member, hoggie, count: 1, firstAt: Date.now() - index, firstN: index + 1 });
}

async function matched(t: TestBackend, member: MemberId, profile: number) {
  const row = (await t.seed.all("companyFaces")).find((face) => face.workspace === "T1" && face.member === member);
  await t.seed.patch("companyFaces", row!._id, { profile });
}

async function teamWithEveryHoggie(t: TestBackend, team: string, size: number, firstProfile = 1000): Promise<MemberId[]> {
  const profiles = Array.from({ length: size }, (_, index) => firstProfile + index);
  const people: MemberId[] = [];
  for (const profile of profiles) {
    const member = (await t.seed.insert("members", { workspace: "T1", user: `U_TEAM${profile}`, kind: "member", name: `Teammate ${profile}` })) as MemberId;
    await t.seed.insert("companyFaces", { workspace: "T1", member, face: null, profile });
    for (const [index, { hoggie }] of catalogue.hoggies.entries()) await t.seed.insert("hoggieTallies", { member, hoggie, count: 1, firstAt: index, firstN: index + 1 });
    people.push(member);
  }
  await thanked(t, Object.fromEntries(people.map((member) => [member, 1])));
  await t.seed.insert("companyTeams", { team, name: team, leads: [], people: profiles, asOf: 0 });
  return people;
}

async function collected(t: TestBackend, member: MemberId, ...people: MemberId[]) {
  for (const person of people) await t.seed.insert("albumStickers", { member, person, from: "history", at: Date.now() });
}

async function boardOf(t: TestBackend, givers: number) {
  const kudosByGiver: Record<string, number> = {};
  for (let index = 0; index < givers; index += 1) {
    const member = await t.seed.insert("members", { workspace: "T1", user: `U_BOARD${index}`, kind: "member", name: `Giver on the board ${index}` });
    await t.seed.insert("companyFaces", { workspace: "T1", member: member as MemberId, face: null, profile: 5000 + index });
    kudosByGiver[member] = 1 + (index % 7);
  }
  await thanked(t, kudosByGiver);
}

async function peopleWhoUnlockedEveryHype(t: TestBackend, givers: number, people: number, drops: number): Promise<MemberId[]> {
  const recipients: MemberId[] = [];
  for (let index = 0; index < people; index += 1) {
    const recipient = (await t.seed.insert("members", { workspace: "T1", user: `U_THANKED${index}`, kind: "member", name: `Thanked ${index}` })) as MemberId;
    await t.seed.insert("emojiNames", { workspace: "T1", emoji: "hype", person: recipient, name: `thanked-${index}-hype` });
    recipients.push(recipient);
  }
  for (let drop = 0; drop < drops; drop += 1) await t.seed.insert("customEmoji", { workspace: "T1", name: `drop-${drop}`, image: `https://emoji.slack-edge.com/T1/drop-${drop}/1.png`, listing: 1 });
  const message = { workspace: "T1", conversation: "C1", message: "1760000000.000100" };
  const unlocked: MemberId[] = [];
  for (let index = 0; index < givers; index += 1) {
    const giver = (await t.seed.insert("members", { workspace: "T1", user: `U_GIVER${index}`, kind: "member", name: `Giver ${index}` })) as MemberId;
    for (const [drop, recipient] of recipients.entries()) {
      const pack = await t.seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-19", message, holdsSticker: false, at: Date.now() });
      if (drop < drops) await t.seed.insert("randomEmojiDrops", { member: giver, name: `drop-${drop}`, pack, at: Date.now() });
    }
    unlocked.push(giver);
  }
  return unlocked;
}

function textLinesOf(t: TestBackend, url: string): string[] {
  return (blocksOf(t, url)[0] as { text: { text: string } }).text.text.split("\n");
}

async function teamEmojiNamed(t: TestBackend, team: string) {
  await t.seed.insert("emojiNames", { workspace: "T1", emoji: `team:${team}`, name: `team-${team}` });
}

async function teamEmojiInSlack(t: TestBackend, team: string) {
  await teamEmojiNamed(t, team);
  await t.seed.insert("customEmoji", { workspace: "T1", name: `team-${team}`, image: `https://emoji.slack-edge.com/T1/team-${team}/1.png`, listing: 1 });
}

async function unlockedTeamSticker(t: TestBackend, member: MemberId, team: string) {
  await t.seed.insert("teamStickers", { member, workspace: "T1", team, at: Date.now(), name: team, art: null, emoji: `team-${team}` });
}

async function gaveFirstPack(t: TestBackend, giver: MemberId, recipient: MemberId) {
  await t.seed.insert("thoughtfulPacks", { workspace: "T1", giver, recipient, week: "2026-10-19", message: { workspace: "T1", conversation: "C1", message: "1760000000.000100" }, holdsSticker: false, at: Date.now() });
  await t.seed.insert("emojiNames", { workspace: "T1", emoji: "hype", person: recipient, name: "bram-hype" });
}

async function reachedMilestoneTier(t: TestBackend, member: MemberId, milestone: "people", tier: "bronze") {
  await t.seed.insert("milestoneTiers", { member, milestone, tier, at: Date.now(), catalogue: 1 });
}

function cardOf(t: TestBackend, url: string) {
  return blocksOf(t, url)[0];
}

async function memberOf(t: TestBackend, user: string): Promise<MemberId> {
  return (await memberOrNull(t, user))!;
}

async function outsiderOf(t: TestBackend): Promise<MemberId> {
  return (await t.seed.insert("members", { workspace: "T_OTHER", user: "U_OUT", kind: "member", name: "Outsider" })) as MemberId;
}

async function earned(t: TestBackend, member: MemberId, ladder: LadderId, ...tiers: TierId[]) {
  for (const tier of tiers) {
    const award = await t.seed.insert("awards", { workspace: "T1", conversation: "C0", message: `${ladder}-${tier}`, giver: member, recipient: member, kudos: 1, day: "2026-10-20", at: Date.now() });
    await t.seed.insert("earnedTiers", { member, ladder, tier, earnedAt: Date.now(), award, catalogueVersion: "1", rewards: [] });
  }
}

function fromALinkCard(url: string) {
  const link = new URL(url);
  link.searchParams.set("src", "link-card");
  return link.toString();
}
