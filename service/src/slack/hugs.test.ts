import { describe, expect } from "vitest";
import { httpStatus } from "../../testing/fakeSlack.ts";
import type { TestBackend } from "../../testing/backend.ts";
import { onForEmails, onForEveryone } from "../../testing/flags.ts";
import { kudosAppBotUser, type ReactionOptions } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import type { TableName } from "../db/schema/index.ts";
import { recordReward, standingOf } from "../progression/progression.ts";
import type { MemberId } from "../workspace/directory.ts";
import {
  bookShippedBeforeAnyoneJoined,
  everythingStored,
  flagsLoaded,
  flagsOn,
  hourMs,
  kudosMessage,
  memberChanged,
  memberOf,
  moveTo,
  reachedByAHug,
  reachedByAReaction,
  react,
  refusalOf,
  setHugBudget,
  atOnce,
  setWorkspaceSettings,
  settle,
  slackTs,
  unlocksShippedBeforeAnyoneJoined,
  useHugsBackend,
  xpOf,
} from "./hugsTesting.ts";

const now = new Date("2026-10-13T10:00:00Z");
const messageTs = slackTs(now.getTime() - hourMs);

// A level reached also reaches S10's level-up hoggies.
const reachedByALevel: [Stack, ...Stack[]] = [...reachedByAHug, "S10"];

const backend = useHugsBackend(now);

describe("SR1 SR8: a kudos emoji reaction on a teammate's message is a hug", () => {
  waitsOn(reachedByAHug, "Bob's :taco: on Alice's message gives Alice 1 XP and Bob 1 XP, and sends nothing to Slack", async () => {
    const t = await workspace();

    const response = await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(response.status).toBe(200);
    expect(await xpOf(t, "U_ALICE")).toBe(1);
    expect(await xpOf(t, "U_BOB")).toBe(1);
    expect(slackWrites(t)).toEqual([]);
  });

  for (const [what, options] of [
    ["a skin-tone suffix", { reaction: "taco::skin-tone-3" }],
    ["a thread reply", { ts: slackTs(now.getTime() - 2 * hourMs + 5_000) }],
  ] satisfies Array<[string, ReactionOptions]>) {
    waitsOn(reachedByAHug, `${what} still counts`, async () => {
      const t = await workspace();

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ...options });

      expect(await xpOf(t, "U_ALICE")).toBe(1);
      expect(await xpOf(t, "U_BOB")).toBe(1);
    });
  }

  waitsOn(reachedByALevel, "P13: the hug's XP takes Alice to level 2, and the level reached follows as for any reward", async () => {
    const t = await workspace();
    await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: slackTs(now.getTime() - 2 * hourMs) });
    await givenXp(t, "U_ALICE", 18);

    await hug(t, { user: "U_CAROL", itemUser: "U_ALICE" });

    expect(await standing(t, "U_ALICE")).toEqual({ xp: 20, level: 2, skillPoints: 0 });
    expect(levelsReached(t)).toEqual([2]);
  });

  waitsOn(reachedByAHug, "SR3: on a Given kudos message the hug is for its recipients still members, not its author", async () => {
    const t = await workspace();
    await kudos(t, "U_ALICE", ["U_CAROL", "U_DANA"]);
    const before = await xpOfEveryone(t);
    await memberLeft(t, "U_DANA");

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(await xpOfEveryone(t)).toEqual({ ...before, U_BOB: before.U_BOB + 1, U_CAROL: before.U_CAROL + 1 });
  });

  waitsOn(reachedByAHug, "SR8: a hug pays its people whatever their own flag says, the giver's flag alone decides", async () => {
    const t = await workspace();
    await withHugsOnOnlyFor(t, "U_BOB");

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });
    await hug(t, { user: "U_ALICE", itemUser: "U_BOB", ts: slackTs(now.getTime() - 2 * hourMs) });

    expect(await xpOf(t, "U_ALICE")).toBe(1);
    expect(await xpOf(t, "U_BOB")).toBe(1);
  });
});

describe("SR1 SR18: every other reaction does nothing", () => {
  for (const [what, options] of [
    ["on one's own message", { user: "U_ALICE", itemUser: "U_ALICE" }],
    ["on a bot's message", { itemUser: "U_BOT" }],
    ["on the app's message", { itemUser: kudosAppBotUser }],
    ["by the app", { user: kudosAppBotUser }],
    ["by a bot", { user: "U_BOT" }],
    ["with another emoji", { reaction: "tada" }],
    ["with another emoji that carries a skin tone", { reaction: "thumbsup::skin-tone-2" }],
    ["more than 24 hours after the message", { ts: slackTs(now.getTime() - 24 * hourMs) }],
    ["on a message posted after the reaction", { ts: slackTs(now.getTime() + 60_000) }],
    ["in a one-to-one DM", { channel: "D1" }],
    ["on a file", { itemType: "file" }],
    ["without the message's author", { itemUser: null }],
    ["removed", { type: "reaction_removed" }],
  ] satisfies Array<[string, ReactionOptions]>) {
    waitsOn(reachedByAReaction, `a reaction ${what} gives no XP and calls Slack for nothing but its people`, async () => {
      const t = await workspace();

      const response = await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ...options });

      expect(response.status).toBe(200);
      expect(await xpOfEveryone(t)).toEqual({ U_ALICE: 0, U_BOB: 0, U_CAROL: 0, U_DANA: 0, U_BOT: 0 });
      expect(slackWrites(t)).toEqual([]);
      expect(hugsGiven(t)).toEqual([]);
    });
  }

  waitsOn(reachedByAHug, "SR4: a hug on a Given kudos message whose author has left gives no XP", async () => {
    const t = await workspace();
    await kudos(t, "U_ALICE", ["U_CAROL", "U_DANA"]);
    await memberChanged(t, "user_change", { id: "U_ALICE", deleted: true });
    const before = await xpOfEveryone(t);

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(await xpOfEveryone(t)).toEqual(before);
    expect(hugsGiven(t)).toEqual([]);
  });

  waitsOn(reachedByAHug, "a reaction by its author on a Given kudos message gives no XP", async () => {
    const t = await workspace();
    await kudos(t, "U_ALICE", ["U_CAROL", "U_DANA"]);
    const before = await xpOfEveryone(t);

    await hug(t, { user: "U_ALICE", itemUser: "U_ALICE" });

    expect(await xpOfEveryone(t)).toEqual(before);
    expect(hugsGiven(t)).toEqual([]);
  });
});

describe("SR4: people the directory doesn't know are looked up first", () => {
  waitsOn(reachedByAHug, "an unknown giver's first hug counts once users.info answers, after a failed try", async () => {
    const t = await workspace();
    t.slack.answering("users.info", httpStatus(500));

    await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

    expect(await xpOf(t, "U_BOB")).toBe(1);
    expect(await xpOf(t, "U_ALICE")).toBe(1);
  });

  waitsOn(reachedByAReaction, "a giver who isn't a member does nothing", async () => {
    const t = await workspace();
    t.slack.withMember("U_GONE", { deleted: true });

    await hug(t, { user: "U_GONE", itemUser: "U_ALICE" });

    expect(await xpOf(t, "U_ALICE")).toBe(0);
    expect(hugsGiven(t)).toEqual([]);
  });

  waitsOn(reachedByAReaction, "an author whose lookup fails 3 times makes the hug do nothing, and Slack is asked no more", async () => {
    const t = await workspace();
    t.slack.answering("users.info", ...Array.from({ length: 3 }, () => httpStatus(500)));
    await hug(t, { user: "U_BOB", itemUser: "U_EVE" });

    expect(t.slack.callsTo("users.info").filter(({ user }) => user === "U_EVE")).toHaveLength(3);
    expect(await xpOf(t, "U_BOB")).toBe(0);
    expect(hugsGiven(t)).toEqual([]);
  });
});

describe("SR16 HH90: a hug reaches PostHog as hug given, with only whether it was on a kudos message and the emoji reacted", () => {
  for (const [what, onKudos] of [
    ["an ordinary message", false],
    ["a Given kudos message", true],
  ] satisfies Array<[string, boolean]>) {
    waitsOn(reachedByAHug, `on ${what}`, async () => {
      const t = await workspace();
      if (onKudos) await kudos(t, "U_ALICE", ["U_CAROL"]);

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE", reaction: "taco::skin-tone-3" });

      const given = hugsGiven(t);
      const shared = { environment: "sandbox", workspace_key: expect.any(String), taxonomy_version: expect.any(Number) };
      expect(given.map(({ properties }) => properties)).toEqual([{ ...shared, on_kudos: onKudos, reaction: "taco" }]);
      expect(JSON.stringify(given)).not.toMatch(new RegExp(`U_ALICE|U_BOB|C1|${secondsOf(messageTs)}`));
    });
  }
});

describe("SR6 SR23: a hug never passes the hug budget", () => {
  waitsOn(
    reachedByAHug,
    "two reactions at once can't both be the 10th hug",
    async () => {
      const t = await workspace();
      for (let index = 0; index < 9; index += 1) await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: slackTs(now.getTime() - (index + 1) * 60_000) });

      for (const user of ["U_CAROL", "U_DANA"]) await memberChanged(t, "team_join", { id: user });
      await settle(t);

      await atOnce([
        react(t, { user: "U_BOB", itemUser: "U_CAROL", ts: slackTs(now.getTime() - 20 * 60_000) }),
        react(t, { user: "U_BOB", itemUser: "U_DANA", ts: slackTs(now.getTime() - 21 * 60_000) }),
      ]);
      await settle(t);

      expect(await xpOf(t, "U_BOB")).toBe(10);
      expect((await xpOf(t, "U_CAROL")) + (await xpOf(t, "U_DANA"))).toBe(1);
    },
    60_000,
  );

  waitsOn(
    reachedByAHug,
    "the 11th hug on the giver's day writes and says nothing, and the next day it counts",
    async () => {
      const t = await workspace();

      for (let index = 0; index < 11; index += 1) await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: slackTs(now.getTime() - (index + 1) * 60_000) });

      expect(await xpOf(t, "U_BOB")).toBe(10);
      expect(await xpOf(t, "U_ALICE")).toBe(10);
      expect(slackWrites(t)).toEqual([]);

      moveTo(t, now.getTime() + 15 * hourMs);
      await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: slackTs(now.getTime() - 11 * 60_000) });

      expect(await xpOf(t, "U_BOB")).toBe(11);
    },
    60_000,
  );

  waitsOn(
    reachedByAHug,
    "a workspace's hugBudget changes the number",
    async () => {
      const t = await workspace();
      await setHugBudget(t, { workspace: "T1", hugBudget: 2 });

      for (let index = 0; index < 3; index += 1) await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: slackTs(now.getTime() - (index + 1) * 60_000) });

      expect(await xpOf(t, "U_BOB")).toBe(2);
    },
    60_000,
  );

  waitsOn(
    reachedByAHug,
    "a hug budget for a workspace Kudos doesn't know is refused, and the known workspace keeps 10",
    async () => {
      const t = await workspace();

      expect(await refusalOf(setHugBudget(t, { workspace: "T_TYPO", hugBudget: 2 }))).toMatchObject({ message: expect.stringContaining("Kudos knows no workspace T_TYPO") });

      for (let index = 0; index < 3; index += 1) await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ts: slackTs(now.getTime() - (index + 1) * 60_000) });
      expect(await xpOf(t, "U_BOB")).toBe(3);
    },
    60_000,
  );
});

describe("SR5 SR23: a member hugs a message at most once", () => {
  for (const [what, reactions] of [
    ["a redelivered event", (eventId) => [{ eventId }, { eventId }]],
    ["a removed and re-added reaction", () => [{}, { type: "reaction_removed" }, {}]],
    ["a second skin tone", () => [{ reaction: "taco::skin-tone-2" }, { reaction: "taco::skin-tone-5" }]],
  ] satisfies Array<[string, (eventId: string) => ReactionOptions[]]>) {
    waitsOn(
      reachedByAHug,
      `${what} pays the author and the giver once`,
      async () => {
        const t = await workspace();

        for (const options of reactions("Ev-once")) await hug(t, { user: "U_BOB", itemUser: "U_ALICE", ...options });

        expect(await xpOf(t, "U_ALICE")).toBe(1);
        expect(await xpOf(t, "U_BOB")).toBe(1);
        expect(hugsGiven(t)).toHaveLength(1);
      },
      60_000,
    );
  }

  waitsOn(
    reachedByAHug,
    "a redelivered hug on a Given kudos message pays each recipient once",
    async () => {
      const t = await workspace();
      await kudos(t, "U_ALICE", ["U_CAROL", "U_DANA"]);
      const before = await xpOfEveryone(t);

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE", eventId: "Ev-once" });
      await hug(t, { user: "U_BOB", itemUser: "U_ALICE", eventId: "Ev-again" });

      expect(await xpOfEveryone(t)).toEqual({ ...before, U_BOB: before.U_BOB + 1, U_CAROL: before.U_CAROL + 1, U_DANA: before.U_DANA + 1 });
    },
    60_000,
  );
});

describe("SR2 SR23: a hug is never an award", () => {
  waitsOn(
    reachedByALevel,
    "with every feature on, hugs change nothing but their own records, XP, Leaderboard's hug counts and the flag's exposure: boards, kudos totals, coins, quests, the Journey and the allowance stay as they were",
    async () => {
      const t = await everyFeatureOn();
      await kudos(t, "U_ALICE", ["U_CAROL"]);
      await kudos(t, "U_BOB", ["U_ALICE"], slackTs(now.getTime() - hourMs + 1_000));
      await kudos(t, "U_CAROL", ["U_DANA"], slackTs(now.getTime() - hourMs + 2_000));
      await kudos(t, "U_DANA", ["U_BOB"], slackTs(now.getTime() - hourMs + 3_000));
      moveTo(t, now.getTime());
      const withoutHugs = withoutTheAlbumsHugCounts(await everythingStored(t, { except: writtenByAHug }));

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });
      await hug(t, { user: "U_DANA", itemUser: "U_BOB", ts: slackTs(now.getTime() - hourMs + 1_000) });
      await hug(t, { user: "U_ALICE", itemUser: "U_DANA", ts: slackTs(now.getTime() - 2 * hourMs) });

      expect(hugsGiven(t)).toHaveLength(3);
      expect(withoutLeaderboardsHugCounts(withoutTheAlbumsHugCounts(await everythingStored(t, { except: writtenByAHug })))).toEqual(withoutHugs);
    },
    120_000,
  );
});

describe("SR9: a hug's people are paid in pages", () => {
  waitsOn(
    reachedByAHug,
    "a hug on a kudos message with 250 recipients pays every recipient once and the giver once",
    async () => {
      const t = await workspace();
      const recipients = await kudosSeededFor(t, "U_ALICE", 250);

      await hug(t, { user: "U_BOB", itemUser: "U_ALICE" });

      expect(await xpOf(t, "U_BOB")).toBe(1);
      expect(await xpOf(t, "U_ALICE")).toBe(0);
      expect(new Set(await Promise.all(recipients.map((member) => t.query(async (ctx) => (await standingOf(ctx, member)).xp))))).toEqual(new Set([1]));
    },
    120_000,
  );
});

async function workspace() {
  const t = backend();
  t.slack.withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL").withMember("U_DANA").withMember("U_BOT", { is_bot: true });
  await setWorkspaceSettings(t, { kudosEmoji: "taco" });
  return flagsOn(t, ["hugs"]);
}

const everyFeature = ["hugs", "xp-levels", "unlocks", "quests", "skill-tree", "achievements", "coins", "website", "groups", "everyone-board", "activity"];

const writtenByAHug: TableName[] = ["hugs", "hugPeople", "hugsReceived", "hugWeeks", "hugWeekMessages", "hugCounts", "talliedHugs", "countedRecognitions", "hugRunningTotals", "weekThankers", "rewardRecords", "memberProgress", "slackReceipts", "analyticsIds", "flagExposures", "analyticsOutbox", "recordedFacts"];

function withoutTheAlbumsHugCounts(rows: Array<Record<string, unknown>>) {
  const thanked = (row: Record<string, unknown>) => row.kudosGiven !== 0 || row.kudosReceived !== 0;
  return rows.flatMap((row) => {
    if ("firstThankedAt" in row) {
      const { hugsGiven: _given, hugsReceived: _received, ...kudos } = row;
      return thanked(row) ? [kudos] : [];
    }
    if ("thankedBy" in row) {
      const { hugsGiven: _given, hugsReceived: _received, hugged: _hugged, huggedBy: _huggedBy, kudosOfWeek: _kudosOfWeek, days: _days, ...kudos } = row;
      return thanked(row) ? [kudos] : [];
    }
    if ("list" in row) return row.list === "hugged" || row.list === "huggedBy" ? [] : [row];
    return [row];
  });
}

function withoutLeaderboardsHugCounts(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => {
    if (!("period" in row || "day" in row) || !("kudos" in row)) return row;
    const { hugsGiven: _given, hugsReceived: _received, ...kudos } = row;
    return kudos;
  });
}

async function everyFeatureOn() {
  const t = await workspace();
  await flagsLoaded(t, ...everyFeature.map(onForEveryone));
  await unlocksShippedBeforeAnyoneJoined(t);
  return bookShippedBeforeAnyoneJoined(t);
}

async function hug(t: TestBackend, options: ReactionOptions) {
  const response = await react(t, { ts: messageTs, ...options });
  await settle(t);
  return response;
}

async function kudos(t: TestBackend, giver: string, recipients: string[], ts = messageTs) {
  await kudosMessage(t, giver, recipients, ts);
}

async function kudosSeededFor(t: TestBackend, giver: string, count: number): Promise<MemberId[]> {
  const author = await t.seed.insert("members", { workspace: "T1", user: giver, kind: "member" });
  const recipients: MemberId[] = [];
  for (let index = 0; index < count; index += 1) {
    const recipient = await t.seed.insert("members", { workspace: "T1", user: `U_R${index}`, kind: "member" });
    await t.seed.insert("awards", { workspace: "T1", conversation: "C1", message: messageTs, giver: author, recipient, kudos: 1, day: "2026-10-13", at: now.getTime() - hourMs });
    recipients.push(recipient);
  }
  return recipients;
}

async function memberLeft(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  await t.seed.patch("members", member!, { kind: "not-a-member" });
}

async function withHugsOnOnlyFor(t: TestBackend, user: string) {
  t.slack.withMember(user, { profile: { email: emailOf(user) } });
  await flagsLoaded(t, onForEmails("hugs", emailOf(user)));
}

function emailOf(user: string) {
  return `${user.toLowerCase()}@example.com`;
}

async function givenXp(t: TestBackend, user: string, xp: number) {
  const member = await memberOf(t, user);
  await t.run((ctx) => recordReward(ctx, "T1", { member: member!, key: `test:${xp}`, xp, coins: 0, item: null, catalogueVersion: "test", at: Date.now() }));
  await settle(t);
}

async function standing(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  return t.query((ctx) => standingOf(ctx, member!));
}

const everyone = ["U_ALICE", "U_BOB", "U_CAROL", "U_DANA", "U_BOT"] as const;

async function xpOfEveryone(t: TestBackend): Promise<Record<(typeof everyone)[number], number>> {
  const [U_ALICE, U_BOB, U_CAROL, U_DANA, U_BOT] = await Promise.all(everyone.map((user) => xpOf(t, user)));
  return { U_ALICE: U_ALICE!, U_BOB: U_BOB!, U_CAROL: U_CAROL!, U_DANA: U_DANA!, U_BOT: U_BOT! };
}

function slackWrites(t: TestBackend) {
  return t.slack.calls.filter(({ method }) => !["users.info", "views.publish", "auth.test"].includes(method)).map(({ method }) => method);
}

function hugsGiven(t: TestBackend) {
  return t.postHog.events().filter(({ event }) => event === "hug given");
}

function levelsReached(t: TestBackend) {
  return t.postHog
    .events()
    .filter(({ event }) => event === "level reached")
    .map(({ properties }) => properties.level);
}

function secondsOf(slackTimestamp: string) {
  return slackTimestamp.split(".")[0];
}
