import { describe, expect, test } from "vitest";
import type { Id } from "../db/columns.ts";
import { questOf, type QuestId } from "./pool.ts";
import { counts, questProgress, type QuestAward } from "./progress.ts";

const at = Date.parse("2026-10-13T10:00:00Z");
const dayMs = 24 * 60 * 60 * 1000;
const bob = "bob" as Id<"members">;
const carol = "carol" as Id<"members">;

let awards = 0;

function award(facts: Partial<QuestAward> = {}): QuestAward {
  awards += 1;
  return { award: `award-${awards}` as Id<"awards">, recipient: bob, day: "2026-10-13", at, saysWhy: true, lastThankedBefore: null, ...facts };
}

describe("P84: what a quest counts of a given award", () => {
  test.each<[QuestId, string, Partial<QuestAward>, boolean]>([
    ["someone-new", "a kudos to someone never thanked, without saying why", { saysWhy: false }, true],
    ["someone-new", "a kudos to someone thanked before", { lastThankedBefore: at - 60 * dayMs }, false],
    ["two-new", "a kudos to someone never thanked", {}, true],
    ["not-in-30-days", "a kudos to someone never thanked", {}, true],
    ["not-in-30-days", "a kudos to someone last thanked 30 days before", { lastThankedBefore: at - 30 * dayMs }, true],
    ["not-in-30-days", "a kudos to someone thanked 29 days before", { lastThankedBefore: at - 29 * dayMs }, false],
  ])("%s counts %s: %s", (quest, _, facts, counted) => {
    expect(counts(questOf(quest), award(facts))).toBe(counted);
  });
});

describe("P84: a quest's progress over the awards it counted", () => {
  test.each<[QuestId, string, number, QuestAward[]]>([
    ["two-new", "two recognitions to the same person", 1, [award(), award()]],
    ["two-new", "recognitions to two people", 2, [award(), award({ recipient: carol })]],
  ])("%s after %s is %d", (quest, _, progress, counted) => {
    expect(questProgress(questOf(quest), counted)).toBe(progress);
  });
});

describe("HH13: the kudos pool counts any kudos", () => {
  const dave = "dave" as Id<"members">;

  test.each<[QuestId, string, Partial<QuestAward>, boolean]>([
    ["kudos-once", "a kudos that doesn't say why", { saysWhy: false }, true],
    ["kudos-two-days", "a kudos that doesn't say why to someone thanked before", { saysWhy: false, lastThankedBefore: at - dayMs }, true],
    ["three-in-a-day", "a kudos that doesn't say why to someone thanked before", { saysWhy: false, lastThankedBefore: at - dayMs }, true],
  ])("%s counts %s: %s", (quest, _, facts, counted) => {
    expect(counts(questOf(quest), award(facts))).toBe(counted);
  });

  test.each<[QuestId, string, number, QuestAward[]]>([
    ["kudos-once", "one kudos", 1, [award()]],
    ["kudos-two-days", "kudos on one day", 1, [award(), award({ recipient: carol })]],
    ["kudos-two-days", "kudos on two different days", 2, [award(), award({ day: "2026-10-14" })]],
    ["three-in-a-day", "two people thanked on one day and a third the next", 2, [award(), award({ recipient: carol }), award({ recipient: dave, day: "2026-10-14" })]],
    ["three-in-a-day", "the same person thanked three times on one day", 1, [award(), award(), award()]],
    ["three-in-a-day", "three people thanked on one day", 3, [award(), award({ recipient: carol }), award({ recipient: dave })]],
  ])("%s after %s is %d", (quest, _, progress, counted) => {
    expect(questProgress(questOf(quest), counted)).toBe(progress);
  });
});
