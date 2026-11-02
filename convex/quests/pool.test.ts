import { describe, expect, test } from "vitest";
import { feasibility, hugFeasibility, hugQuestPool, mondayQuestPool, questIdValidator, questOf, type DrawFacts, type HugDrawFacts, type PoolQuest } from "./pool";

const lastDayWithOneTeammateAlreadyThanked: DrawFacts = { daysLeft: 1, kudosLeftToday: 3, dailyAllowance: 3, peopleLeft: { anyone: 1, "someone-new": 0, "someone-not-thanked-in-30-days": 0 } };

describe("P83: every quest in the pool keeps the guardrails", () => {
  test("each quest has its own stable ID", () => {
    expect(new Set(mondayQuestPool.quests.map(({ quest }) => quest)).size).toBe(mondayQuestPool.quests.length);
  });

  describe("HH13: the Monday path draws from the kudos pool", () => {
    test("its quests are the kudos pool's, and none asks to say why", () => {
      expect(mondayQuestPool.quests.map(({ quest, goal }) => [quest, goal])).toEqual([
        ["kudos-once", "Give a kudos to someone."],
        ["kudos-two-days", "Thank someone on two different days."],
        ["three-in-a-day", "Thank 3 people in one day."],
        ["someone-new", "Thank someone you haven't thanked before."],
        ["two-new", "Thank 2 people you haven't thanked before."],
        ["not-in-30-days", "Thank someone you haven't thanked in the last 30 days."],
      ]);
      expect(mondayQuestPool.quests.filter(({ progress }) => progress.given.saysWhy).map(({ quest }) => quest), "the quests that ask to say why").toEqual([]);
    });

    test.each(mondayQuestPool.quests.map((quest) => [quest.quest, quest] as const))("%s keeps the guardrails", (_, quest) => {
      expect(breachesOf(quest)).toEqual([]);
    });

    test("kudos-once needs nothing but the member and stays feasible on the last day of the week with one teammate", () => {
      const fallbacks = mondayQuestPool.quests.filter((quest) => quest.progress.given.to === "anyone" && feasibility(quest, lastDayWithOneTeammateAlreadyThanked) !== null);

      expect(fallbacks.map(({ quest }) => quest)).toEqual(["kudos-once"]);
    });
  });
});

describe("HH49: the hug pool", () => {
  test("holds hug-once, hug-two-days and hug-ten with their goals, each paying 20 XP", () => {
    expect(hugQuestPool.quests.map(({ quest, goal, progress: { counts, target }, reward }) => [quest, goal, counts, target, reward.xp])).toEqual([
      ["hug-once", "Hug a teammate's message.", "recognitions", 1, 20],
      ["hug-two-days", "Hug messages on 2 different days.", "days", 2, 20],
      ["hug-ten", "React to 10 messages this week.", "recognitions", 10, 20],
    ]);
  });

  const midweek: HugDrawFacts = { daysLeft: 3, hugsLeftToday: 4, hugBudget: 10 };

  test("a quest is feasible when the hugs left today plus the budget of the week's remaining days reach its target", () => {
    expect(hugFeasibility(questOf("hug-ten"), midweek)).toEqual({ hugsLeft: 24 });
    expect(hugFeasibility(questOf("hug-ten"), { daysLeft: 1, hugsLeftToday: 9, hugBudget: 10 })).toBeNull();
    expect(hugFeasibility(questOf("hug-ten"), { daysLeft: 2, hugsLeftToday: 0, hugBudget: 10 })).toEqual({ hugsLeft: 10 });
    expect(hugFeasibility(questOf("hug-once"), { daysLeft: 1, hugsLeftToday: 0, hugBudget: 10 })).toBeNull();
  });

  test("hug-two-days also needs two days with a hug left, today counting only while a hug is left", () => {
    expect(hugFeasibility(questOf("hug-two-days"), midweek)).toEqual({ hugsLeft: 24, daysLeft: 3 });
    expect(hugFeasibility(questOf("hug-two-days"), { daysLeft: 2, hugsLeftToday: 0, hugBudget: 10 })).toBeNull();
    expect(hugFeasibility(questOf("hug-two-days"), { daysLeft: 1, hugsLeftToday: 10, hugBudget: 10 })).toBeNull();
  });
});

describe("HH51: the hug pool keeps the guardrails", () => {
  test.each(hugQuestPool.quests.map((quest) => [quest.quest, quest] as const))("%s counts at most 10 hugs or 2 days of what the member gives, names no one and needs nothing unshipped", (_, { kind, goal, progress, needs }) => {
    expect(kind).toBe("participation");
    expect(progress.counts === "days" ? progress.target <= 2 : progress.counts === "recognitions" && progress.target <= 10).toBe(true);
    expect(progress.given).toEqual({ saysWhy: false, to: "anyone" });
    expect(goal).toMatch(/^(Hug|React to) \S*\s*(a teammate's message|messages)\b/);
    expect(goal).not.toMatch(/receiv|thanks you|thanked by|thoughtful|again/i);
    expect(needs).toEqual([]);
  });

  test("hug-once stays feasible on the last day of the week with one hug left", () => {
    const lastDayOneHugLeft: HugDrawFacts = { daysLeft: 1, hugsLeftToday: 1, hugBudget: 10 };

    expect(hugQuestPool.quests.filter((quest) => hugFeasibility(quest, lastDayOneHugLeft) !== null).map(({ quest }) => quest)).toEqual(["hug-once"]);
  });
});

describe("every quest a stored draw can hold resolves to its definition", () => {
  test.each(questIdValidator.members.map(({ value }) => value))("%s", (quest) => {
    expect(questOf(quest)).toMatchObject({ quest, goal: expect.any(String), progress: { target: expect.any(Number) } });
  });
});

describe("P83: the guardrails catch a quest that breaks them", () => {
  test.each([
    ["counts 4 of something", { progress: { counts: "recognitions", target: 4, given: { saysWhy: true, to: "anyone" } } }],
    ["names a person", { goal: "Thank Bob and say why." }],
    ["depends on receiving", { goal: "Get thanked by someone and say why." }],
    ["calls a kudos thoughtful", { goal: "Thank someone with a thoughtful kudos and say why." }],
    ["asks to resend", { goal: "Thank someone and say why, then send it again." }],
  ] as const)("a quest that %s breaks them", (_, change) => {
    const sayWhy = questWith({ given: { saysWhy: true, to: "anyone" }, counts: "recognitions", target: 1 });
    expect(breachesOf(sayWhy), "the quest before the change").toEqual([]);
    expect(breachesOf({ ...sayWhy, ...change } as PoolQuest)).not.toEqual([]);
  });
});

describe("HH13: three-in-a-day is feasible while the daily allowance holds 3 and a day with 3 kudos remains", () => {
  const threeInADay = questOf("three-in-a-day");
  const plenty: DrawFacts = { daysLeft: 7, kudosLeftToday: 3, dailyAllowance: 3, peopleLeft: { anyone: 5, "someone-new": 5, "someone-not-thanked-in-30-days": 5 } };

  test("it needs a daily allowance of at least 3", () => {
    expect(feasibility(threeInADay, plenty)).toEqual({ peopleLeft: 5, recognitionsLeft: 21 });
    expect(feasibility(threeInADay, { ...plenty, kudosLeftToday: 2, dailyAllowance: 2 })).toBeNull();
  });

  test("with fewer than 3 kudos left today it needs another day", () => {
    expect(feasibility(threeInADay, { ...plenty, daysLeft: 2, kudosLeftToday: 2 })).toEqual({ peopleLeft: 5, recognitionsLeft: 5 });
    expect(feasibility(threeInADay, { ...plenty, daysLeft: 1, kudosLeftToday: 2 })).toBeNull();
  });

  test("it needs 3 people to thank", () => {
    expect(feasibility(threeInADay, { ...plenty, peopleLeft: { ...plenty.peopleLeft, anyone: 2 } })).toBeNull();
  });
});

describe("P80: a quest is feasible only when the member can finish it alone that week", () => {
  const plenty: DrawFacts = { daysLeft: 7, kudosLeftToday: 3, dailyAllowance: 3, peopleLeft: { anyone: 5, "someone-new": 5, "someone-not-thanked-in-30-days": 5 } };
  const thanking = (to: PoolQuest["progress"]["given"]["to"], counts: PoolQuest["progress"]["counts"], target: number) => questWith({ given: { saysWhy: false, to }, counts, target });

  test("a goal over different days needs that many days left in the week, counting today", () => {
    const threeDays = questWith({ given: { saysWhy: true, to: "anyone" }, counts: "days", target: 3 });

    expect(feasibility(threeDays, { ...plenty, daysLeft: 3 })).toEqual({ peopleLeft: 5, recognitionsLeft: 9, daysLeft: 3 });
    expect(feasibility(threeDays, { ...plenty, daysLeft: 2 })).toBeNull();
  });

  test("a goal over different days can't count today once today's kudos are spent", () => {
    const twoDays = questWith({ given: { saysWhy: true, to: "anyone" }, counts: "days", target: 2 });

    expect(feasibility(twoDays, { ...plenty, daysLeft: 2, kudosLeftToday: 1 })).toEqual({ peopleLeft: 5, recognitionsLeft: 4, daysLeft: 2 });
    expect(feasibility(twoDays, { ...plenty, daysLeft: 2, kudosLeftToday: 0 })).toBeNull();
  });

  test("a goal needs at least as many kudos left this week as it counts, one per recognition", () => {
    const threeTimes = questWith({ given: { saysWhy: true, to: "anyone" }, counts: "recognitions", target: 3 });

    expect(feasibility(threeTimes, { ...plenty, daysLeft: 1, kudosLeftToday: 3 })).toEqual({ peopleLeft: 5, recognitionsLeft: 3 });
    expect(feasibility(threeTimes, { ...plenty, daysLeft: 1, kudosLeftToday: 2 })).toBeNull();
  });

  test("a recognition goal counts one recognition per person and day, so it needs that many across the people and days left", () => {
    const twice = questWith({ given: { saysWhy: true, to: "anyone" }, counts: "recognitions", target: 2 });
    const oneTeammate = { ...plenty, peopleLeft: { ...plenty.peopleLeft, anyone: 1 } };

    expect(feasibility(twice, { ...oneTeammate, daysLeft: 2 })).toEqual({ peopleLeft: 1, recognitionsLeft: 2 });
    expect(feasibility(twice, { ...oneTeammate, daysLeft: 1 })).toBeNull();
  });

  test("a breadth goal needs at least as many people left to meet it as it counts", () => {
    expect(feasibility(thanking("someone-new", "people", 2), { ...plenty, peopleLeft: { ...plenty.peopleLeft, "someone-new": 2 } })).toEqual({ peopleLeft: 2, recognitionsLeft: 14 });
    expect(feasibility(thanking("someone-new", "people", 2), { ...plenty, peopleLeft: { ...plenty.peopleLeft, "someone-new": 1 } })).toBeNull();
    expect(feasibility(thanking("someone-not-thanked-in-30-days", "people", 1), { ...plenty, peopleLeft: { ...plenty.peopleLeft, "someone-not-thanked-in-30-days": 0 } })).toBeNull();
  });

  test("any goal needs someone to thank", () => {
    expect(feasibility(thanking("anyone", "recognitions", 1), { ...plenty, peopleLeft: { ...plenty.peopleLeft, anyone: 0 } })).toBeNull();
  });
});

const kinds = ["breadth", "thoughtfulness", "participation"];
const countable = ["recognitions", "people", "days", "people-in-a-day"];
const unshippedNeeds = ["groups", "chime-ins", "recent-joiners"];

function breachesOf({ kind, goal, progress, needs }: PoolQuest): string[] {
  const breaches: string[] = [];
  if (!kinds.includes(kind)) breaches.push(`rewards ${kind}, not breadth, thoughtfulness or participation`);
  if (kind === "breadth" && progress.given.to === "anyone") breaches.push("is breadth but counts anyone");
  if (kind === "thoughtfulness" && !progress.given.saysWhy) breaches.push("is thoughtfulness but doesn't ask to say why");
  if (progress.target > 3) breaches.push(`counts ${progress.target} of something in a week`);
  if (!countable.includes(progress.counts)) breaches.push(`counts ${progress.counts}, not recognitions, people or days`);
  if (Object.keys(progress).some((key) => key !== "given" && key !== "counts" && key !== "target")) breaches.push("depends on more than what the member gives");
  if (Object.keys(progress.given).some((key) => key !== "saysWhy" && key !== "to")) breaches.push("names or picks a person to thank");
  if (!/^(Thank (someone|\d people)|Give a kudos to someone)\b/.test(goal)) breaches.push("names or picks whom to thank instead of someone or a number of people");
  if (/receiv|thanks you|thanked by/i.test(goal)) breaches.push("depends on receiving");
  if (/thoughtful|resend|again|pad|longer/i.test(goal)) breaches.push("breaks P95's honest copy");
  if (progress.given.saysWhy && !goal.includes("say why")) breaches.push("asks to say why without saying so");
  if (needs.some((need) => unshippedNeeds.includes(need))) breaches.push(`needs ${needs.join(", ")}, which haven't shipped`);
  return breaches;
}

function questWith(progress: PoolQuest["progress"]): PoolQuest {
  return { quest: "say-why", kind: "thoughtfulness", goal: "Thank someone and say why.", progress, needs: [], reward: { xp: 20, coins: 0, item: null } };
}
