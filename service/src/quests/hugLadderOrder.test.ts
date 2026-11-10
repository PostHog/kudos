// The hug ladder counts every hug a member gives under two-quests, whatever order the hugs arrive in. Today's app lost a
// hug that arrived after a later one had started the ladder, so its quests panel could show 2 of 3 after three hugs.
// These tests drive the ladder as followHugGiven does once a hug is recorded under two-quests: recognize the hug, start
// or move the ladder, then advance it. followHugGiven itself waits on S6's flag body and this stack's side quests.
import { describe, expect, test } from "vitest";
import { createClock } from "../clock.ts";
import type { HugGivenEvent } from "../bus/events.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { rewardKeyOf } from "./crates.ts";
import { advanceHugLadder, hugLadderSteps, hugsOnTheLadderOf, startTheHugLadder, type HugLadderStep } from "./hugLadder.ts";
import { factOfHugGiven, recognize } from "./recognitions.ts";
import { startQuests } from "./start.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const tuesday = Date.UTC(2026, 9, 13, 10);
const minuteMs = 60_000;
const bob = "member-bob" as MemberId;
const carol = "member-carol" as MemberId;

function setUp() {
  const clock = createClock({ real: () => tuesday + 60 * minuteMs });
  const operations = createOperations({ pool: database.pool, clock, log: quiet });
  const seed = seeder(operations);

  /** The member's quests started at the moment given, as their first kudos on the Monday path starts them. */
  const questsStartedAt = (member: MemberId, at: number) => operations.mutation("test.startQuests", (ctx) => startQuests(ctx, member, at));

  /** A hug delivered to Quests under two-quests: recorded once, then the ladder started or moved, then advanced. */
  const hugUnderTwoQuests = (event: HugGivenEvent) =>
    operations.mutation("test.hugUnderTwoQuests", async (ctx) => {
      if (await recognize(ctx, factOfHugGiven(event))) await startTheHugLadder(ctx, event.giver, event.at);
      await advanceHugLadder(ctx, event.workspace, event.giver);
    });

  /** A hug delivered while two-quests was off for the member: recorded, and no ladder moves. */
  const hugWithoutTwoQuests = (event: HugGivenEvent) => operations.mutation("test.hugWithoutTwoQuests", (ctx) => recognize(ctx, factOfHugGiven(event)));

  const finishedSteps = async (member: MemberId): Promise<HugLadderStep[]> => {
    const keys = new Set((await seed.all("questFinishes")).filter((finish) => finish.member === member).map(({ key }) => key));
    return hugLadderSteps.filter((step) => keys.has(rewardKeyOf({ kind: "journey", step })));
  };

  const hugsCounted = (member: MemberId) => operations.query("test.hugsOnTheLadderOf", (ctx) => hugsOnTheLadderOf(ctx, member));

  return { seed, questsStartedAt, hugUnderTwoQuests, hugWithoutTwoQuests, finishedSteps, hugsCounted };
}

/** Bob's hug on Carol's message, given `minutes` after Tuesday 10:00. */
function hugAt(minutes: number): HugGivenEvent {
  const at = tuesday + minutes * minuteMs;
  return { type: "hugGiven", workspace: "T1", giver: bob, author: carol, message: { workspace: "T1", conversation: "C1", message: `${at / 1000}.000100` }, onKudos: false, day: "2026-10-13", at };
}

describe("the hug ladder counts every hug under two-quests, whatever order the hugs arrive in", () => {
  test("the second hug, then the first, then the third finish Give 3 hugs, and the ladder shows 3", async () => {
    const { questsStartedAt, hugUnderTwoQuests, finishedSteps, hugsCounted } = setUp();
    await questsStartedAt(bob, tuesday);
    const [first, second, third] = [hugAt(1), hugAt(2), hugAt(3)];

    for (const hug of [second, first]) await hugUnderTwoQuests(hug);
    expect(await finishedSteps(bob), "after the second and the first hug").toEqual([]);
    await hugUnderTwoQuests(third);

    expect(await finishedSteps(bob), "after the third hug").toEqual(["hugs-3"]);
    expect(await hugsCounted(bob), "the hugs the quests panel counts").toBe(3);
  });

  test("ten hugs in reverse order finish Give 3, 5 and 10 hugs, and the ladder counts all ten", async () => {
    const { questsStartedAt, hugUnderTwoQuests, finishedSteps, hugsCounted } = setUp();
    await questsStartedAt(bob, tuesday);

    const finishedAfter: HugLadderStep[][] = [];
    for (let minutes = 10; minutes >= 1; minutes -= 1) {
      await hugUnderTwoQuests(hugAt(minutes));
      finishedAfter.push(await finishedSteps(bob));
    }

    expect(finishedAfter[1], "after 2 hugs").toEqual([]);
    expect(finishedAfter[2], "after 3 hugs").toEqual(["hugs-3"]);
    expect(finishedAfter[4], "after 5 hugs").toEqual(["hugs-3", "hugs-5"]);
    expect(finishedAfter[8], "after 9 hugs").toEqual(["hugs-3", "hugs-5"]);
    expect(finishedAfter[9], "after 10 hugs").toEqual(["hugs-3", "hugs-5", "hugs-10"]);
    expect(await hugsCounted(bob)).toBe(10);
  });

  test("each step finishes at the hug that reaches it in the order the hugs were given", async () => {
    const { questsStartedAt, hugUnderTwoQuests, seed } = setUp();
    await questsStartedAt(bob, tuesday);

    for (const minutes of [3, 1, 2]) await hugUnderTwoQuests(hugAt(minutes));

    const [finish] = await seed.all("questFinishes");
    expect(finish?.at, "Give 3 hugs finished at the third hug given").toBe(hugAt(3).at);
  });

  test("a hug delivered again counts once", async () => {
    const { questsStartedAt, hugUnderTwoQuests, finishedSteps, hugsCounted } = setUp();
    await questsStartedAt(bob, tuesday);

    for (const minutes of [2, 1, 2, 1]) await hugUnderTwoQuests(hugAt(minutes));

    expect(await hugsCounted(bob)).toBe(2);
    expect(await finishedSteps(bob)).toEqual([]);
  });

  test("a late hug never reaches back over a hug given while two-quests was off", async () => {
    const { questsStartedAt, hugUnderTwoQuests, hugWithoutTwoQuests, finishedSteps, hugsCounted } = setUp();
    await questsStartedAt(bob, tuesday);
    await hugWithoutTwoQuests(hugAt(2));

    for (const minutes of [3, 4]) await hugUnderTwoQuests(hugAt(minutes));
    await hugUnderTwoQuests(hugAt(1));

    expect(await hugsCounted(bob), "the hugs from the ladder's start, the one before two-quests left out").toBe(2);
    expect(await finishedSteps(bob)).toEqual([]);
    await hugUnderTwoQuests(hugAt(5));
    expect(await finishedSteps(bob), "after the third hug under two-quests since the start").toEqual(["hugs-3"]);
  });

  test("hugs given before two-quests start no ladder, and the ladder starts at the first hug under it", async () => {
    const { questsStartedAt, hugUnderTwoQuests, hugWithoutTwoQuests, finishedSteps, hugsCounted } = setUp();
    await questsStartedAt(bob, tuesday);
    for (const minutes of [1, 2, 3, 4]) await hugWithoutTwoQuests(hugAt(minutes));

    for (const minutes of [5, 6]) await hugUnderTwoQuests(hugAt(minutes));
    expect(await hugsCounted(bob)).toBe(2);
    expect(await finishedSteps(bob), "after 2 hugs under two-quests").toEqual([]);
    await hugUnderTwoQuests(hugAt(7));

    expect(await finishedSteps(bob), "after 3 hugs under two-quests").toEqual(["hugs-3"]);
  });

  test("a hug given before the member's quests started counts for nothing", async () => {
    const { questsStartedAt, hugUnderTwoQuests, hugsCounted } = setUp();
    await questsStartedAt(bob, hugAt(2).at);

    for (const minutes of [3, 1, 4]) await hugUnderTwoQuests(hugAt(minutes));

    expect(await hugsCounted(bob)).toBe(2);
  });
});
