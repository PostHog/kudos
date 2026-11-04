import { describe, expect, test } from "vitest";
import { awardId, kudosGivenEvent } from "../../testing/busEvents";
import type {
  AchievementEarnedEvent,
  AttemptFailedEvent,
  KudosGivenEvent,
  LevelReachedEvent,
  PerkBoughtEvent,
  QuestFinishedEvent,
  QuestsDrawnEvent,
  UnlockOpenedEvent,
  UnlockReadyEvent,
  UnlocksLaunchedEvent,
} from "../bus/events";
import type { Feature } from "../unlocks/feature";
import type { MemberId } from "../workspace/directory";
import {
  projectAchievementEarned,
  projectAttemptFailed,
  projectKudosGiven,
  projectLevelReached,
  projectMemberWelcomed,
  projectPerkBought,
  projectQuestFinished,
  projectQuestsDrawn,
  projectUnlockOpened,
  projectUnlockReady,
  projectUnlocksLaunched,
  projectUsage,
} from "./projections";

const alice = "alice" as MemberId;
const bob = "bob" as MemberId;
const carol = "carol" as MemberId;
const at = Date.parse("2026-10-13T10:00:00Z");

function kudosGiven(overrides: Partial<KudosGivenEvent> = {}): KudosGivenEvent {
  return kudosGivenEvent(alice, bob, { annotations: { note: "thanks for the quokka migration" }, at, ...overrides });
}

const firstThanks = { newRecipients: 1 };

describe("O3: kudos given", () => {
  test.each<[string, Partial<KudosGivenEvent>, Record<string, unknown>]>([
    ["one recipient, one kudos", {}, { recipients: 1, kudos_per_recipient: 1, kudos_total: 1, daily_allowance_left: 2 }],
    [
      "two recipients, two kudos each",
      { awards: [{ award: awardId(bob), giver: alice, recipient: bob, kudos: 2 }, { award: awardId(carol), giver: alice, recipient: carol, kudos: 2 }], allowance: { dailyOpening: 5, dailyLeft: 1 } },
      { recipients: 2, kudos_per_recipient: 2, kudos_total: 4, daily_allowance_opening: 5, daily_allowance_left: 1 },
    ],
    [
      "two recipients, two kudos and one",
      { awards: [{ award: awardId(bob), giver: alice, recipient: bob, kudos: 2 }, { award: awardId(carol), giver: alice, recipient: carol, kudos: 1 }], allowance: { dailyOpening: 5, dailyLeft: 2 } },
      { recipients: 2, kudos_per_recipient: 2, kudos_total: 3, daily_allowance_opening: 5, daily_allowance_left: 2 },
    ],
    ["skipped mentions", { skippedMentions: 3 }, { skipped_mentions: 3 }],
    ["a retry in a thread", { retry: true, inThread: true }, { retry: true, in_thread: true }],
    ["the default kudos emoji", { kudosEmoji: "taco" }, { default_kudos_emoji: true }],
    ["a workspace's own kudos emoji", { kudosEmoji: "pizza" }, { default_kudos_emoji: false }],
    ["E3: a gate decision that says why", { annotations: { gate: { version: 1, thoughtful: true, words: 7 } } }, { thoughtful: true }],
    ["E3: a gate decision that doesn't say why", { annotations: { gate: { version: 1, thoughtful: false, words: 2 } } }, { thoughtful: false }],
    ["E3: no gate decision", { annotations: { note: "thanks for the quokka migration" } }, { thoughtful: false }],
    ["MS7: the gate's word count", { annotations: { gate: { version: 1, thoughtful: true, words: 7 } } }, { word_count: 7 }],
    ["MS9: the recipients the giver had never thanked", {}, { new_recipients: 1 }],
  ])("%s", (_, overrides, expected) => {
    const [given] = projectKudosGiven(kudosGiven(overrides), firstThanks);

    expect(given).toMatchObject({ event: "kudos given", subject: { member: alice }, at, properties: expected });
  });

  test("O11 E3 MS8: kudos given lists exactly O3's properties, thoughtful, word_count and new_recipients, and the word count only as word_count", () => {
    const [given] = projectKudosGiven(kudosGiven({ annotations: { gate: { version: 1, thoughtful: true, words: 7 } } }), firstThanks);

    expect(Object.keys(given!.properties).sort()).toEqual(
      ["daily_allowance_left", "daily_allowance_opening", "default_kudos_emoji", "in_thread", "kudos_per_recipient", "kudos_total", "new_recipients", "recipients", "retry", "skipped_mentions", "thoughtful", "word_count"].sort(),
    );
    expect(Object.entries(given!.properties).filter(([, value]) => value === 7)).toEqual([["word_count", 7]]);
  });
});

describe("O3: kudos received", () => {
  test("one per award, on the recipient, with its kudos and whether the attempt was a retry", () => {
    const event = kudosGiven({ awards: [{ award: awardId(bob), giver: alice, recipient: bob, kudos: 2 }, { award: awardId(carol), giver: alice, recipient: carol, kudos: 2 }], retry: true });

    expect(projectKudosGiven(event, firstThanks).slice(1)).toEqual([
      { event: "kudos received", subject: { member: bob }, at, properties: { kudos: 2, retry: true } },
      { event: "kudos received", subject: { member: carol }, at, properties: { kudos: 2, retry: true } },
    ]);
  });
});

function attemptFailed(overrides: Partial<AttemptFailedEvent> = {}): AttemptFailedEvent {
  return {
    type: "attemptFailed",
    workspace: "T1",
    message: { workspace: "T1", conversation: "C1", message: "1760349600.000100" },
    giver: alice,
    outcome: "over-allowance",
    recipients: 2,
    perRecipient: 2,
    cost: 4,
    skippedMentions: 1,
    retry: true,
    inThread: true,
    allowance: { dailyLeft: 3 },
    day: "2026-10-13",
    at,
    ...overrides,
  };
}

describe("O3: attempt failed", () => {
  test.each<[string, Partial<AttemptFailedEvent>, Record<string, unknown>]>([
    [
      "Over allowance",
      {},
      { outcome: "over allowance", recipients: 2, kudos_per_recipient: 2, kudos_total: 4, skipped_mentions: 1, retry: true, in_thread: true, daily_allowance_left: 3 },
    ],
    [
      "Invalid",
      { outcome: "invalid", recipients: 0, perRecipient: 1, cost: 0, retry: false, inThread: false },
      { outcome: "invalid", recipients: 0, kudos_per_recipient: 1, kudos_total: 0, skipped_mentions: 1, retry: false, in_thread: false, daily_allowance_left: 3 },
    ],
  ])("%s lists exactly O3's properties, on the giver at the spend instant", (_, overrides, properties) => {
    expect(projectAttemptFailed(attemptFailed(overrides))).toEqual({ event: "attempt failed", subject: { member: alice }, at, properties });
  });
});

describe("O3: member welcomed", () => {
  test.each(["giver", "recipient"] as const)("as %s", (as) => {
    expect(projectMemberWelcomed({ type: "memberWelcomed", workspace: "T1", member: bob, as, at })).toEqual({
      event: "member welcomed",
      subject: { member: bob },
      at,
      properties: { as },
    });
  });
});

describe("E1: level reached", () => {
  const levelReached: LevelReachedEvent = {
    type: "levelReached",
    workspace: "T1",
    member: bob,
    level: 6,
    skillPointsGained: 2,
    skillPoints: 2,
    xpToNextLevel: 500,
    at,
  };

  test.each<[string, string, Partial<LevelReachedEvent>]>([
    ["a kudos message", "kudos", { message: { workspace: "T1", conversation: "C1", message: "1760349600.000100" } }],
    ["a reward record, which has no kudos message", "reward", {}],
  ])("crossed by %s, it is via %s and lists exactly E1's properties, on the member at the fact's time", (_, via, overrides) => {
    expect(projectLevelReached({ ...levelReached, ...overrides })).toEqual({
      event: "level reached",
      subject: { member: bob },
      at,
      properties: { level: 6, skill_points_gained: 2, via },
    });
  });
});

describe("E1: unlock made ready and unlock opened", () => {
  const featureNames: Array<[Feature, string]> = [
    ["quests", "quests"],
    ["leaderboard", "leaderboard"],
    ["book", "book"],
    ["skillTree", "skill tree"],
    ["coins", "coins"],
  ];

  test.each(featureNames)("%s made ready is unlock made ready with feature %s, on the member at the fact's time", (feature, name) => {
    const ready: UnlockReadyEvent = { type: "unlockReady", workspace: "T1", member: bob, feature, at };

    expect(projectUnlockReady(ready)).toEqual({ event: "unlock made ready", subject: { member: bob }, at, properties: { feature: name } });
  });

  test.each(featureNames)("%s opened by a member's Open is unlock opened with feature %s, by member", (feature, name) => {
    const opened: UnlockOpenedEvent = { type: "unlockOpened", workspace: "T1", member: bob, feature, at };

    expect(projectUnlockOpened(opened)).toEqual({ event: "unlock opened", subject: { member: bob }, at, properties: { feature: name, by: "member" } });
  });

  test("P77: an opening the launch stored is by launch", () => {
    expect(projectUnlockOpened({ type: "unlockOpened", workspace: "T1", member: bob, feature: "skillTree", at, byLaunch: true }).properties).toEqual({ feature: "skill tree", by: "launch" });
  });

  test("P77: the launch's openings are one unlock opened by launch each, on its member at the launch's moment", () => {
    const launched: UnlocksLaunchedEvent = {
      type: "unlocksLaunched",
      workspace: "T1",
      at,
      openings: [
        { member: alice, feature: "quests" },
        { member: alice, feature: "leaderboard" },
        { member: bob, feature: "quests" },
      ],
    };

    expect(projectUnlocksLaunched(launched)).toEqual([
      { event: "unlock opened", subject: { member: alice }, at, properties: { feature: "quests", by: "launch" } },
      { event: "unlock opened", subject: { member: alice }, at, properties: { feature: "leaderboard", by: "launch" } },
      { event: "unlock opened", subject: { member: bob }, at, properties: { feature: "quests", by: "launch" } },
    ]);
  });
});

describe("E1: quest drawn", () => {
  const drawn: QuestsDrawnEvent = { type: "questsDrawn", workspace: "T1", member: bob, week: "2026-10-12", quests: ["say-why", "say-why-three-times", "say-why-two-days"], at };

  test("a draw projects one quest drawn per quest, naming only its pool ID, on the member at the draw's time", () => {
    expect(projectQuestsDrawn(drawn)).toEqual(
      ["say-why", "say-why-three-times", "say-why-two-days"].map((quest) => ({ event: "quest drawn", subject: { member: bob }, at, properties: { quest } })),
    );
  });

  test("a draw of fewer quests projects fewer", () => {
    expect(projectQuestsDrawn({ ...drawn, quests: ["say-why"] }).map(({ properties }) => properties)).toEqual([{ quest: "say-why" }]);
  });
});

describe("E1 O6: perk bought and achievement earned", () => {
  test.each<PerkBoughtEvent["perk"]>(["spark", "rhythm", "circle"])("buying %s lists only its catalogue ID, on the buyer at the purchase", (perk) => {
    const bought: PerkBoughtEvent = { type: "perkBought", workspace: "T1", member: alice, perk, at };

    expect(projectPerkBought(bought)).toEqual({ event: "perk bought", subject: { member: alice }, at, properties: { perk } });
  });

  test("a tier earned lists only its ladder and tier IDs, on the member at the tier's time, whether a kudos or a replay batch earned it", () => {
    const earned: AchievementEarnedEvent = { type: "achievementEarned", workspace: "T1", member: bob, ladder: "old-friends", tier: "diamond", at };

    expect(projectAchievementEarned(earned)).toEqual({ event: "achievement earned", subject: { member: bob }, at, properties: { ladder: "old-friends", tier: "diamond" } });
    expect(projectAchievementEarned({ ...earned, batch: "batch" as AchievementEarnedEvent["batch"] & string })).toEqual(projectAchievementEarned(earned));
  });
});

describe("E1 E5: quest finished", () => {
  const weekly = { kind: "weekly", week: "2026-10-12", slot: 1 } as const;
  const firstThanks = { kind: "journey", step: "first-thanks" } as const;
  const reward = { xp: 20, coins: 0 };

  test.each<[string, Omit<QuestFinishedEvent, "type" | "workspace" | "member" | "at">, Record<string, string | number>]>([
    ["a weekly quest is named by its pool ID", { quest: weekly, poolQuest: "say-why-two-days", reward }, { kind: "weekly", quest: "say-why-two-days", xp: 20, coins: 0 }],
    ["a Journey step is named by its step", { quest: firstThanks, reward: { xp: 10, coins: 0 } }, { kind: "journey", quest: "first-thanks", xp: 10, coins: 0 }],
    ["a weekly quest queued before the deploy has only its kind", { quest: weekly }, { kind: "weekly" }],
    ["a Journey step queued before the deploy has its kind and step", { quest: firstThanks }, { kind: "journey", quest: "first-thanks" }],
  ])("%s, on the member at the fact's time", (_, fields, properties) => {
    expect(projectQuestFinished({ type: "questFinished", workspace: "T1", member: bob, at, ...fields })).toEqual({ event: "quest finished", subject: { member: bob }, at, properties });
  });
});

describe("O3: usage facts", () => {
  test("app home opened carries no properties of its own", () => {
    expect(projectUsage({ kind: "appHomeOpened", workspace: "T1", member: bob, at })).toEqual({ event: "app home opened", subject: { member: bob }, at, properties: {} });
  });

  test.each([
    ["joined", false, "joined"],
    ["already-in", true, "already in"],
    ["private-channel", false, "private channel"],
    ["direct-message", true, "direct message"],
  ] as const)("command used that ended %s, alias %s", (result, alias, name) => {
    expect(projectUsage({ kind: "commandUsed", workspace: "T1", member: bob, alias, result, at })).toEqual({
      event: "command used",
      subject: { member: bob },
      at,
      properties: { command: "hedgehug", alias, result: name },
    });
  });
});

describe("E2: leaderboard viewed", () => {
  test.each([
    ["week", "app-home", "app home"],
    ["month", "app-home", "app home"],
    ["all", "command", "command"],
  ] as const)("a view of the Everyone board for %s from %s lists exactly its board, period and surface", (period, surface, surfaceName) => {
    expect(projectUsage({ kind: "leaderboardViewed", workspace: "T1", member: bob, board: "everyone", period, surface, at })).toEqual({
      event: "leaderboard viewed",
      subject: { member: bob },
      at,
      properties: { board: "everyone", period, surface: surfaceName },
    });
  });
});

describe("E2: leaderboard left and leaderboard joined", () => {
  test.each([
    [false, "leaderboard left"],
    [true, "leaderboard joined"],
  ] as const)("a setting changed to visible %s is %s, with no properties of its own", (visible, event) => {
    expect(projectUsage({ kind: "leaderboardVisibilityChanged", workspace: "T1", member: bob, visible, at })).toEqual({ event, subject: { member: bob }, at, properties: {} });
  });
});

describe("MQ34: the DM and quests usage facts", () => {
  test("a welcome sent carries its kind and path", () => {
    expect(projectUsage({ kind: "dmSent", workspace: "T1", member: bob, dm: { kind: "welcome", path: "thoughtful-given" }, at })).toEqual({
      event: "dm sent",
      subject: { member: bob },
      at,
      properties: { kind: "welcome", path: "thoughtful-given" },
    });
  });

  test("a Monday DM sent carries its kind and the sections it carried", () => {
    expect(projectUsage({ kind: "dmSent", workspace: "T1", member: bob, dm: { kind: "monday", sections: ["hugs", "quests"] }, at })).toEqual({
      event: "dm sent",
      subject: { member: bob },
      at,
      properties: { kind: "monday", sections: "hugs,quests" },
    });
  });

  test.each(["book", "quests", "quests-how"] as const)("a DM link to %s clicked carries the DM's kind and the destination", (destination) => {
    expect(projectUsage({ kind: "dmLinkClicked", workspace: "T1", member: bob, dm: "monday", destination, at })).toEqual({
      event: "dm link clicked",
      subject: { member: bob },
      at,
      properties: { kind: "monday", destination },
    });
  });

  test("MQ29: a message setting changed by a DM button says so in via", () => {
    expect(projectUsage({ kind: "messageSettingChanged", workspace: "T1", member: bob, setting: "quests", on: false, place: "none", via: "dm-button", at })).toEqual({
      event: "message setting changed",
      subject: { member: bob },
      at,
      properties: { kind: "quests", on: false, place: "none", via: "dm-button" },
    });
  });

  test.each(["panel", "profile"] as const)("quests viewed on the %s carries its surface", (surface) => {
    expect(projectUsage({ kind: "questsViewed", workspace: "T1", member: bob, surface, at })).toEqual({ event: "quests viewed", subject: { member: bob }, at, properties: { surface } });
  });

  test.each(["thanked", "empty", "quiet"] as const)("activity viewed in the %s state carries it (HH91)", (state) => {
    expect(projectUsage({ kind: "activityViewed", workspace: "T1", member: bob, state, at })).toEqual({ event: "activity viewed", subject: { member: bob }, at, properties: { state } });
  });
});
