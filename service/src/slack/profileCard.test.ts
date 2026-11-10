// Today's convex/slack/profileCard.test.ts on the service: `/hedgehug @someone` through the signed front door, Slack and
// PostHog faked behind `fetch`. Every test's setup ships the Book and records its members through the directory, which
// S6 and S3 port, so each waits on the stacks a card reaches.
import { describe, expect } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import type { FlagDefinition } from "../../testing/fakePostHog.ts";
import { httpStatus, rateLimitedFor } from "../../testing/fakeSlack.ts";
import { flagsFromPostHog, offForEveryone, onForEmails, onForEveryone } from "../../testing/flags.ts";
import { slashCommandResponseUrl } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import type { LadderId, TierId } from "../achievements/ladders.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import type { Feature } from "../unlocks/feature.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import type { MemberId } from "../workspace/directory.ts";
import { bookShippedBeforeAnyoneJoined, memberChanged, memberOf as memberOrNull, moveTo, settle, unlocksShippedBeforeAnyoneJoined, useHugsBackend } from "./hugsTesting.ts";

/**
 * A card reaches S3's directory, S4's command replies and exposures, S6's achievements, progression and unlocks, S10's
 * avatar, S11's groups and S14's usage facts.
 */
const reachedByACard: [Stack, ...Stack[]] = ["S3", "S4", "S6", "S10", "S11", "S14"];

const now = new Date("2026-10-14T10:00:00Z");
const cardFlag = "profile-card";
const everyFlag = ["xp-levels", "unlocks", "achievements", cardFlag];
const levelSevenXp = 1500;
const replyWindowMs = 25 * 60_000;
const joinedReply = "I'm in now. Mention teammates with a kudos emoji here and I'll pass the kudos on.";
const usageLine = "Type `/hedgehug @someone` to see their profile card.";
const timeout = 30_000;

const backend = useHugsBackend(now);

describe("PC1 PC5 PC7 PC8: /hedgehug @member answers that member's profile card", () => {
  waitsOn(reachedByACard, "a member with a level and tiers on five ladders shows their name, level and best four medals, catalogue order breaking a tie", async () => {
    const t = await workspace();
    await withXp(t, "U_BEA", levelSevenXp);
    await earned(t, "U_BEA", "dependability", "bronze", "silver", "gold");
    await earned(t, "U_BEA", "applause", "bronze");
    await earned(t, "U_BEA", "connections", "bronze", "silver");
    await earned(t, "U_BEA", "generosity", "bronze", "silver", "gold");
    await earned(t, "U_BEA", "recognition", "bronze", "silver", "gold", "diamond");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 7", "💎 Hall of Fame · 🥇 Heart of the Team · 🥇 Pillar · 🥈 Connector"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "a mention with Slack's label shows the same card, and a teammate who earned nothing shows their name and level", async () => {
    const t = await workspace();

    expect(await card(t, "U_ANN", "<@U_BEA|bea>")).toBe(["*<@U_BEA>*", "Level 1"].join("\n"));
    expect(await card(t, "U_ANN", "  <@U_BEA>  ")).toBe(["*<@U_BEA>*", "Level 1"].join("\n"));
  }, timeout);
});

describe("PC9: a card follows what has shipped, except an own card's medals wait for the Book", () => {
  waitsOn(reachedByACard, "an own card shows no medals before the member opened the Book, and its medals once they have", async () => {
    const t = await workspace();
    await earned(t, "U_ANN", "generosity", "bronze");

    const beforeOpening = await card(t, "U_ANN", "<@U_ANN>");
    await reachesLevel(t, await memberOf(t, "U_ANN"), 4);
    await opens(t, await memberOf(t, "U_ANN"), "book");

    expect(beforeOpening).toBe(["*<@U_ANN>*", "Level 1"].join("\n"));
    expect(await card(t, "U_ANN", "<@U_ANN>")).toBe(["*<@U_ANN>*", "Level 1", "🥉 First Thanks"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "an own card opened while the Book applied keeps its medals when the member's own achievements decision is off", async () => {
    const t = await workspace();
    await earned(t, "U_ANN", "generosity", "bronze");
    await reachesLevel(t, await memberOf(t, "U_ANN"), 4);
    await opens(t, await memberOf(t, "U_ANN"), "book");

    await achievementsOnInTheWorkspaceOnly(t, "U_ANN");

    expect(await card(t, "U_ANN", "<@U_ANN>")).toBe(["*<@U_ANN>*", "Level 1", "🥉 First Thanks"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "a teammate's card shows their medals though neither member opened the Book", async () => {
    const t = await workspace();
    await earned(t, "U_BEA", "generosity", "bronze");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 1", "🥉 First Thanks"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "tiers earned while notices were held back count", async () => {
    const t = await workspace();
    await earnedWhileHeldBack(t, "U_BEA", "seasons", "bronze");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 1", "🥉 First Chapter"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "with achievements off there is no medal line", async () => {
    const t = await workspace({ flags: [onForEveryone("xp-levels"), onForEveryone("unlocks"), offForEveryone("achievements"), onForEveryone(cardFlag)], book: false });
    await earned(t, "U_BEA", "generosity", "bronze");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 1"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "while achievements just turned on and nothing launched the Book yet there is no medal line, and the card launches nothing", async () => {
    const t = await workspace({ flags: [onForEveryone("xp-levels"), onForEveryone("unlocks"), offForEveryone("achievements"), onForEveryone(cardFlag)], book: false });
    await earned(t, "U_BEA", "generosity", "bronze");
    await flagsFromPostHog(t.operations, t.postHog, ...everyFlag.map(onForEveryone));

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 1"].join("\n"));
    expect(await t.seed.all("bookLaunches")).toEqual([]);
  }, timeout);

  waitsOn(reachedByACard, "with xp-levels off there is no level line, and the card is the name alone", async () => {
    const t = await workspace({ flags: [offForEveryone("xp-levels"), onForEveryone(cardFlag)], book: false });
    await withXp(t, "U_BEA", levelSevenXp);

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe("*<@U_BEA>*");
  }, timeout);
});

describe("PC2: text led by a mention that isn't one person answers the usage line", () => {
  for (const text of ["<@U_BEA> <@U_ANN>", "<!subteam^S123|@team>", "<!here>", "<#C1|general>", "<@U_BEA> thanks"]) {
    waitsOn(reachedByACard, text, async () => {
      const t = await workspace();

      expect(await card(t, "U_ANN", text)).toBe(usageLine);
    }, timeout);
  }

  waitsOn(reachedByACard, "/hedgehug and text not led by a mention keep today's behaviour while the flag is on", async () => {
    const t = await workspace();

    expect(await joinReplyTo(t, "U_ANN", "")).toEqual(joinedReplyFor);
    expect(await joinReplyTo(t, "U_ANN", "leaderboard")).toEqual(joinedReplyFor);
    expect(await joinReplyTo(t, "U_ANN", "hello <@U_BEA>")).toEqual(joinedReplyFor);
  }, timeout);

  waitsOn(reachedByACard, "/hedgehug leaderboard shows the board while both flags are on", async () => {
    const t = await workspace({ flags: [...everyFlag, "everyone-board"].map(onForEveryone) });
    await reachesLevel(t, await memberOf(t, "U_ANN"), 3);
    await opens(t, await memberOf(t, "U_ANN"), "leaderboard");

    expect(await card(t, "U_ANN", "leaderboard")).toBe("Give kudos this week to join the board.");
  }, timeout);
});

describe("PC3 PC4: who the card is for", () => {
  for (const user of ["U_BOT", "U_GONE"]) {
    waitsOn(reachedByACard, `${user} answers the not-a-member line`, async () => {
      const t = await workspace();
      await lookedUp(t, user);

      expect(await card(t, "U_ANN", `<@${user}>`)).toBe(`<@${user}> isn't an active member of this workspace.`);
    }, timeout);
  }

  waitsOn(reachedByACard, "a person the directory doesn't know is looked up, then answered through response_url", async () => {
    const t = await workspace();

    const response = await command(t, "U_ANN", "<@U_NEW>");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    await t.settle();
    expect(t.slack.callsTo("users.info")).toEqual([{ user: "U_NEW" }]);
    expect(t.slack.callsTo("abc")).toEqual([{ response_type: "ephemeral", text: ["*<@U_NEW>*", "Level 1"].join("\n") }]);
    expect(t.slack.callsTo("conversations.join")).toEqual([]);
  }, timeout);

  waitsOn(reachedByACard, "an unknown person who turns out to be a bot answers the not-a-member line through response_url", async () => {
    const t = await workspace();

    await command(t, "U_ANN", "<@U_BOT>");
    await t.settle();

    expect(t.slack.callsTo("abc")).toEqual([{ response_type: "ephemeral", text: "<@U_BOT> isn't an active member of this workspace." }]);
  }, timeout);

  waitsOn(reachedByACard, "three failed lookups answer the lookup-failed line", async () => {
    const t = await workspace();
    t.slack.answering("users.info", httpStatus(500), httpStatus(500), httpStatus(500));

    await command(t, "U_ANN", "<@U_NEW>");
    await settle(t);

    expect(t.slack.callsTo("users.info")).toHaveLength(3);
    expect(t.slack.callsTo("abc")).toEqual([{ response_type: "ephemeral", text: "I couldn't look up <@U_NEW> right now. Try again in a minute." }]);
  }, timeout);

  waitsOn(reachedByACard, "a Retry-After that would land after the reply window answers the lookup-failed line without trying again", async () => {
    const t = await workspace();
    t.slack.answering("users.info", rateLimitedFor(replyWindowMs / 1000 + 1));

    await command(t, "U_ANN", "<@U_NEW>");
    await settle(t);

    expect(t.slack.callsTo("users.info")).toHaveLength(1);
    expect(t.slack.callsTo("abc")).toEqual([{ response_type: "ephemeral", text: "I couldn't look up <@U_NEW> right now. Try again in a minute." }]);
  }, timeout);

  waitsOn(reachedByACard, "a retry that runs after the reply window closed answers the lookup-failed line without looking up", async () => {
    const t = await workspace();
    t.slack.answering("users.info", httpStatus(500));
    await command(t, "U_ANN", "<@U_NEW>");
    await t.settle();
    expect(t.slack.callsTo("users.info")).toHaveLength(1);

    moveTo(t, now.getTime() + replyWindowMs + 60_000);
    await settle(t);

    expect(t.slack.callsTo("users.info")).toHaveLength(1);
    expect(t.slack.callsTo("abc")).toEqual([{ response_type: "ephemeral", text: "I couldn't look up <@U_NEW> right now. Try again in a minute." }]);
  }, timeout);

  waitsOn(reachedByACard, "a Retry-After inside the reply window is waited for, and the card follows", async () => {
    const t = await workspace();
    t.slack.answering("users.info", rateLimitedFor(60));

    await command(t, "U_ANN", "<@U_NEW>");
    await settle(t);

    expect(t.slack.timesOf("users.info")).toEqual([now.getTime(), now.getTime() + 60_000]);
    expect(t.slack.callsTo("abc")).toEqual([{ response_type: "ephemeral", text: ["*<@U_NEW>*", "Level 1"].join("\n") }]);
  }, timeout);
});

describe("PC11 PC17: the profile-card flag", () => {
  for (const text of ["<@U_BEA>", "<@U_BEA> <@U_ANN>", "<@U_NEW>", "<@U_BOT>"]) {
    waitsOn(reachedByACard, `while it is off, /hedgehug ${text} is today's join path`, async () => {
      const t = await workspace({ flags: [onForEveryone("xp-levels"), onForEveryone("unlocks"), onForEveryone("achievements"), offForEveryone(cardFlag)] });

      expect(await joinReplyTo(t, "U_ANN", text)).toEqual(joinedReplyFor);
      expect(t.slack.callsTo("users.info").filter(({ user }) => user !== "U_ANN")).toEqual([]);
    }, timeout);
  }

  waitsOn(reachedByACard, "while it is off, the answer is byte for byte the answer to /hedgehug", async () => {
    const t = await workspace({ flags: [offForEveryone(cardFlag)], book: false });
    const plain = await command(t, "U_ANN", "");
    await t.settle();
    const callsToPlain = t.slack.calls.length;

    const mentioned = await command(t, "U_ANN", "<@U_BEA>");
    await t.settle();

    expect([mentioned.status, mentioned.headers.get("content-type"), await mentioned.text()]).toEqual([plain.status, plain.headers.get("content-type"), await plain.text()]);
    expect(t.slack.calls.slice(callsToPlain)).toEqual(t.slack.calls.slice(0, callsToPlain));
  }, timeout);

  waitsOn(reachedByACard, "the exposure is sent once per member and value", async () => {
    const t = await workspace();
    await card(t, "U_ANN", "<@U_BEA>");
    await card(t, "U_ANN", "<@U_BEA> <@U_ANN>");
    await flagsFromPostHog(t.operations, t.postHog, offForEveryone(cardFlag));
    await command(t, "U_ANN", "<@U_BEA>");
    await command(t, "U_ANN", "<@U_BEA>");
    await t.settle();

    const analyticsId = await analyticsIdOf(t, "U_ANN");
    expect(exposures(t)).toEqual([
      { distinct_id: analyticsId, response: true },
      { distinct_id: analyticsId, response: false },
    ]);
  }, timeout);

  waitsOn(reachedByACard, "a viewer the directory doesn't know gets the workspace's decision, and is exposed once they are looked up", async () => {
    const t = await workspace();

    expect(await card(t, "U_NEW", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 1"].join("\n"));
    await t.settle();
    await card(t, "U_NEW", "<@U_BEA>");
    await t.settle();

    expect(t.slack.callsTo("users.info")).toEqual([{ user: "U_NEW" }]);
    expect(exposures(t)).toEqual([{ distinct_id: await analyticsIdOf(t, "U_NEW"), response: true }]);
  }, timeout);
});

describe("WS344 GB32: the card names the member's primary group while groups show to the viewer", () => {
  const groupsOn = [...everyFlag, "groups"].map(onForEveryone);

  waitsOn(reachedByACard, "a teammate whose primary group is Ants shows Ants under their name", async () => {
    const t = await workspace({ flags: groupsOn });
    await primaryGroupOf(t, "Ants", "U_ANN", "U_BEA");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Ants", "Level 1"].join("\n"));
    expect(await card(t, "U_ANN", "<@U_ANN>")).toBe(["*<@U_ANN>*", "Ants", "Level 1"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "a group named with &, < and > reads as written", async () => {
    const t = await workspace({ flags: groupsOn });
    await primaryGroupOf(t, "R&D <core>", "U_BEA");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "R&amp;D &lt;core&gt;", "Level 1"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "a teammate with no primary group shows the card without groups", async () => {
    const t = await workspace({ flags: groupsOn });
    await primaryGroupOf(t, "Ants", "U_ANN");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 1"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "while groups don't show to the viewer, the card is the card without groups, whatever groups show to its member", async () => {
    const t = await workspace({ flags: [...everyFlag.map(onForEveryone), onForEmails("groups", emailOf("U_BEA"))] });
    await primaryGroupOf(t, "Ants", "U_ANN", "U_BEA");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 1"].join("\n"));
    expect(await card(t, "U_BEA", "<@U_ANN>")).toBe(["*<@U_ANN>*", "Ants", "Level 1"].join("\n"));
  }, timeout);

  waitsOn(reachedByACard, "with groups off, the reply and every call are those of the card without groups", async () => {
    const t = await workspace();
    await primaryGroupOf(t, "Ants", "U_ANN", "U_BEA");

    expect(await card(t, "U_ANN", "<@U_BEA>")).toBe(["*<@U_BEA>*", "Level 1"].join("\n"));
    expect(t.slack.calls).toEqual([]);
    expect(t.postHog.events().filter(({ properties }) => properties.$feature_flag === "groups")).toEqual([]);
  }, timeout);
});

describe("PC13: profile card viewed", () => {
  waitsOn(reachedByACard, "a card shown to a member sends profile card viewed, own or a teammate's, at the command", async () => {
    const t = await workspace();
    const typedAt: string[] = [];

    typedAt.push(new Date().toISOString());
    await card(t, "U_ANN", "<@U_BEA>");
    typedAt.push(new Date().toISOString());
    await card(t, "U_ANN", "<@U_ANN>");
    typedAt.push(new Date().toISOString());
    await command(t, "U_ANN", "<@U_NEW>");
    await t.settle();

    const analyticsId = await analyticsIdOf(t, "U_ANN");
    expect(cardViews(t)).toEqual([
      { distinct_id: analyticsId, timestamp: typedAt[0], own: false, surface: "command" },
      { distinct_id: analyticsId, timestamp: typedAt[1], own: true, surface: "command" },
      { distinct_id: analyticsId, timestamp: typedAt[2], own: false, surface: "command" },
    ]);
  }, timeout);

  waitsOn(reachedByACard, "a viewer the directory doesn't know is sent profile card viewed once they are looked up", async () => {
    const t = await workspace();

    await card(t, "U_NEW", "<@U_BEA>");
    await t.settle();

    expect(cardViews(t)).toEqual([{ distinct_id: await analyticsIdOf(t, "U_NEW"), timestamp: now.toISOString(), own: false, surface: "command" }]);
  }, timeout);

  waitsOn(reachedByACard, "usage lines, not-a-member lines and failed lookups send nothing", async () => {
    const t = await workspace();
    await lookedUp(t, "U_BOT");
    t.slack.answering("users.info", httpStatus(500), httpStatus(500), httpStatus(500));

    await card(t, "U_ANN", "<@U_BEA> thanks");
    await card(t, "U_ANN", "<@U_BOT>");
    await command(t, "U_ANN", "<@U_NEW>");
    await settle(t);

    expect(cardViews(t)).toEqual([]);
  }, timeout);
});

const joinedReplyFor = { status: 200, body: "", joined: [{ channel: "C1" }], answered: [{ response_type: "ephemeral", text: joinedReply }] };

type WorkspaceSetup = { flags?: FlagDefinition[]; book?: boolean };

async function workspace({ flags = everyFlag.map(onForEveryone), book = true }: WorkspaceSetup = {}) {
  const t = backend();
  t.slack
    .withMember("U_ANN", { profile: { display_name: "Ann" } })
    .withMember("U_BEA", { profile: { display_name: "Bea" } })
    .withMember("U_NEW", { profile: { display_name: "Newt" } })
    .withMember("U_BOT", { is_bot: true })
    .withMember("U_GONE", { deleted: true });
  await flagsFromPostHog(t.operations, t.postHog, ...flags);
  await (book ? bookShippedBeforeAnyoneJoined(t) : unlocksShippedBeforeAnyoneJoined(t));
  await lookedUp(t, "U_ANN");
  await lookedUp(t, "U_BEA");
  t.slack.calls.length = 0;
  return t;
}

async function lookedUp(t: TestBackend, user: string) {
  await memberChanged(t, "team_join", { id: user, ...memberOptions(user) });
  await t.settle();
}

function memberOptions(user: string) {
  if (user === "U_BOT") return { is_bot: true };
  if (user === "U_GONE") return { deleted: true };
  return { profile: { display_name: user.slice(2), email: emailOf(user) } };
}

function emailOf(user: string) {
  return `${user.slice(2).toLowerCase()}@example.com`;
}

async function primaryGroupOf(t: TestBackend, name: string, ...users: string[]) {
  const members = await Promise.all(users.map((user) => memberOf(t, user)));
  const group = await t.seed.insert("userGroups", { workspace: "T1", group: `S_${users.length}`, handle: "group", name, enabled: true, automatic: false, members: members.length, asOf: 0, membersAsOf: 0 });
  for (const member of members) await t.seed.insert("memberGroups", { workspace: "T1", member, groups: [group], primary: group });
}

async function card(t: TestBackend, viewer: string, text: string) {
  const response = await command(t, viewer, text);
  expect(response.status).toBe(200);
  const reply = (await response.json()) as { response_type: string; text: string };
  expect(reply.response_type).toBe("ephemeral");
  await t.settle();
  return reply.text;
}

async function joinReplyTo(t: TestBackend, viewer: string, text: string) {
  const callsBefore = t.slack.calls.length;
  const response = await command(t, viewer, text);
  const body = await response.text();
  await t.settle();
  const after = t.slack.calls.slice(callsBefore);
  const argsOf = (method: string) => after.filter((call) => call.method === method).map((call) => call.args);
  return { status: response.status, body, joined: argsOf("conversations.join"), answered: argsOf("abc") };
}

// Today's command: Slack's whole form, with its response_url, which the front door's `t.command` leaves out.
function command(t: TestBackend, user: string, text: string) {
  const body = new URLSearchParams({
    team_id: "T1",
    channel_id: "C1",
    channel_name: "general",
    user_id: user,
    command: "/hedgehug",
    text,
    response_url: slashCommandResponseUrl,
    trigger_id: "1.2.3",
  }).toString();
  return t.send("/commands", body, { contentType: "application/x-www-form-urlencoded" });
}

async function memberOf(t: TestBackend, user: string): Promise<MemberId> {
  return (await memberOrNull(t, user))!;
}

async function withXp(t: TestBackend, user: string, xp: number) {
  const member = await memberOf(t, user);
  await t.seed.insert("memberProgress", { member, xp, pointsSpent: 0 });
}

function earned(t: TestBackend, user: string, ladder: LadderId, ...tiers: TierId[]) {
  return earnedTiers(t, user, ladder, tiers, {});
}

function earnedWhileHeldBack(t: TestBackend, user: string, ladder: LadderId, ...tiers: TierId[]) {
  return earnedTiers(t, user, ladder, tiers, { hidden: true });
}

async function earnedTiers(t: TestBackend, user: string, ladder: LadderId, tiers: TierId[], heldBack: { hidden?: true }) {
  const member = await memberOf(t, user);
  for (const tier of tiers) {
    const award = await t.seed.insert("awards", { workspace: "T1", conversation: "C0", message: `${ladder}-${tier}`, giver: member, recipient: member, kudos: 1, day: "2026-10-13", at: Date.now() });
    await t.seed.insert("earnedTiers", { member, ladder, tier, earnedAt: Date.now(), award, catalogueVersion: "1", rewards: [], ...heldBack });
  }
}

/** Today's testing/unlocks.ts `reachesLevel`: the level's unlocks made ready and its level-up hoggies earned. */
async function reachesLevel(t: TestBackend, member: MemberId, level: number, at = Date.now()) {
  const message = { workspace: "T1", conversation: "C1", message: `level-${level}-${member}` };
  const event = { type: "levelReached" as const, workspace: "T1", member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

/** Today's testing/unlocks.ts `opens`. */
async function opens(t: TestBackend, member: MemberId, feature: Feature) {
  expect(await t.run((ctx) => openUnlock(ctx, member, feature, "slack"))).toBe("done");
}

async function achievementsOnInTheWorkspaceOnly(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  const [workspaceKey, analyticsId] = [await anIdInHalfOf("achievements", true), await anIdInHalfOf("achievements", false)];
  const key = (await t.seed.all("workspaceKeys")).find((row) => row.workspace === "T1");
  await t.seed.patch("workspaceKeys", key!._id, { workspaceKey });
  const id = (await t.seed.all("analyticsIds")).find((row) => row.member === member);
  await t.seed.patch("analyticsIds", id!._id, { analyticsId });
  await flagsFromPostHog(t.operations, t.postHog, ...everyFlag.filter((flag) => flag !== "achievements").map(onForEveryone), onForHalf("achievements"));
}

/** Today's testing/flags.ts `onForHalf`. */
function onForHalf(key: string): FlagDefinition {
  return { key, filters: { groups: [{ properties: [], rollout_percentage: 50 }] } };
}

/** Today's testing/flags.ts `anIdInHalfOf`: an ID PostHog's rollout hash puts inside, or outside, a 50% rollout. */
async function anIdInHalfOf(flag: string, inside: boolean) {
  for (let attempt = 0; ; attempt++) {
    const id = `id-${inside ? "in" : "out"}-${attempt}`;
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${flag}.${id}`));
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (parseInt(hex.slice(0, 15), 16) / 0xfffffffffffffff <= 0.5 === inside) return id;
  }
}

async function analyticsIdOf(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  return (await t.seed.all("analyticsIds")).find((row) => row.member === member)?.analyticsId;
}

function exposures(t: TestBackend) {
  return t.postHog
    .events()
    .filter(({ event, properties }) => event === "$feature_flag_called" && properties.$feature_flag === cardFlag)
    .map(({ distinct_id, properties }) => ({ distinct_id, response: properties.$feature_flag_response }));
}

function cardViews(t: TestBackend) {
  return t.postHog
    .productEvents()
    .filter(({ event }) => event === "profile card viewed")
    .map(({ distinct_id, timestamp, properties }) => ({ distinct_id, timestamp, own: properties.own, surface: properties.surface }));
}

