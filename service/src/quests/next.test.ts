// Quests' one next quest and the week's two quests, ported from convex/quests/next.test.ts over the service's operations.
// Kudos and hugs reach Quests as today's kudosGiven and hugGiven events, which the worker hands to the quests
// registration's subscribers, and the hourly sweep draws the week's side quests. The reads are today's nextQuestOf and
// twoQuestsOf, at the operation's clock. Today's file reads the two quests through the website's quests read, which is
// S17's: its rows are asserted here on twoQuestsOf, and the website's own fields (hint, item, drawn) wait on S17.
// The one body still stubbed on main the tests reach, welcome's isWelcomed, is stood in over the rows the tests write,
// as today's code reads it; S6's xp-levels decision and S5's republish run as main has them.
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import type { HugGivenEvent, KudosGivenEvent } from "../bus/events.ts";
import { createClock } from "../clock.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { welcomes } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { AwardId } from "../engine/awards.ts";
import { createWorker } from "../jobs/worker.ts";
import type { Log } from "../log.ts";
import { createOperations, type QueryContext } from "../operations.ts";
import { createRegistry } from "../registration.ts";
import { mondayQuestsOf } from "../website/mondayQuests.ts";
import type { MemberId } from "../workspace/directory.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { definitionsStored, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { stillWaiting } from "../../testing/waiting.ts";
import { nextQuestOf } from "./next.ts";
import { hugQuestPool, mondayQuestPool } from "./pool.ts";
import { registration } from "./registration.ts";
import { hugLadderRowOf, twoQuestsOf } from "./twoQuests.ts";

// Welcome's isWelcomed: whether the member has a welcome (by_member, unique).
vi.mock("../welcome/welcome.ts", async (original) => ({
  ...(await original<object>()),
  isWelcomed: async (ctx: QueryContext, member: MemberId): Promise<boolean> =>
    unique("welcomes", await ctx.tx.select({ _id: welcomes._id }).from(welcomes).where(eq(welcomes.member, member)).orderBy(...indexOrder(welcomes, ["member"]).orderBy()).limit(2)) !== null,
}));

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const budgetMs = 60_000;
/** Tuesday 13 October 2026, 10:00 UTC, in the week of Monday 12 October. */
const tuesday = Date.UTC(2026, 9, 13, 10);
const mondayPath = ["monday-quest", "xp-levels"];
const twoQuests = [...mondayPath, "two-quests"];
const journey = (step: string) => ({ kind: "journey", step });
const weekly = (slot: number) => ({ kind: "weekly", week: "2026-10-12", slot });
const goalsOf = (pool: { quests: Array<{ goal: string }> }) => pool.quests.map(({ goal }) => goal.replace(/\.$/, ""));

async function setUp(on: string[]) {
  postHogDeciding("sandbox");
  let now = tuesday;
  const clock = createClock({ real: () => now });
  const registry = createRegistry({ quests: registration });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1, subscribers: registry.subscribers });
  const worker = createWorker({ operations, log: quiet, registry: registry.jobs, pollMs: 60 * minuteMs, concurrency: 1 });
  const seed = seeder(operations);
  await definitionsStored(operations, ...on.map(onForEveryone), ...twoQuests.filter((key) => !on.includes(key)).map(offForEveryone));
  await seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
  const people: Record<string, MemberId> = {};
  for (const name of ["alice", "bob", "carol", "dave", "erin", "frank", "gina"]) people[name] = (await seed.insert("members", { workspace: "T1", user: `U_${name.toUpperCase()}`, kind: "member" })) as MemberId;

  let messages = 0;
  const ts = () => `${Math.floor(now / 1000)}.${String((messages += 1)).padStart(6, "0")}`;
  /** Delivers the event to Quests at the clock, as the bus does, and runs every job it scheduled. */
  const deliver = async (event: KudosGivenEvent | HugGivenEvent) => {
    await operations.mutation("test.publish", (ctx) => ctx.publish(event));
    expect(await worker.settle(budgetMs), `${event.type} settled`).toMatchObject({ done: true });
  };
  /** A minute on, the giver thanks the recipients in one message: its awards recorded, then kudosGiven. */
  const thanks = async (giver: string, ...recipients: string[]) => {
    now += minuteMs;
    const message = { workspace: "T1", conversation: "C1", message: ts() };
    const day = new Date(now).toISOString().slice(0, 10);
    const awards: Array<{ award: AwardId; giver: MemberId; recipient: MemberId; kudos: number }> = [];
    for (const name of recipients) {
      const award = await seed.insert("awards", { workspace: "T1", conversation: "C1", message: message.message, giver: people[giver]!, recipient: people[name]!, kudos: 1, day, at: now });
      awards.push({ award: award as AwardId, giver: people[giver]!, recipient: people[name]!, kudos: 1 });
    }
    const allowance = { dailyOpening: 5, dailyLeft: 5 - awards.length };
    await deliver({ type: "kudosGiven", workspace: "T1", giver: people[giver]!, message, awards, via: "message", kudosEmoji: "taco", annotations: {}, allowance, skippedMentions: 0, retry: false, inThread: false, day, at: now });
  };
  /** A minute on, the giver hugs the author's message. */
  const hugs = async (giver: string, author: string) => {
    now += minuteMs;
    const day = new Date(now).toISOString().slice(0, 10);
    await deliver({ type: "hugGiven", workspace: "T1", giver: people[giver]!, author: people[author]!, message: { workspace: "T1", conversation: "C1", message: ts() }, onKudos: false, day, at: now });
  };
  const hugsTimes = async (count: number, giver: string, author: string) => {
    for (let hug = 1; hug <= count; hug += 1) await hugs(giver, author);
  };
  const laterBy = (ms: number) => {
    now += ms;
  };
  /** A minute on, the hourly sweep runs and every draw it scheduled. */
  const sweep = async () => {
    now += minuteMs;
    expect(await worker.runCron("quests.newWeek.sweep", budgetMs), "the sweep and the draws it scheduled ran").toMatchObject({ done: true });
  };
  const read = <T>(handler: (ctx: QueryContext) => Promise<T>) => operations.query("test.read", handler);
  const nextOf = (name: string) => read((ctx) => nextQuestOf(ctx, people[name]!, ctx.now));
  const rowsOf = (name: string) => read((ctx) => twoQuestsOf(ctx, people[name]!, ctx.now));

  /** Thanks Alice, then Carol, then Alice again the next day: the kudos side's onboarding finished. */
  const finishKudosOnboarding = async (name: string) => {
    await thanks(name, "alice");
    await thanks(name, "carol");
    laterBy(dayMs);
    await thanks(name, "alice");
  };
  /** Every kudos quest of the pool finishes from these: three people never thanked, in one kudos on one day, then one more the next day. */
  const doesEveryKudosQuest = async (name: string) => {
    await thanks(name, "dave", "erin", "frank");
    laterBy(dayMs);
    await thanks(name, "gina");
  };
  /** Every hug quest of the pool finishes from these: ten hugs the next day, and one more the day after. */
  const doesEveryHugQuest = async (name: string) => {
    laterBy(dayMs);
    await hugsTimes(10, name, "carol");
    laterBy(dayMs);
    await hugs(name, "carol");
  };
  return { people, thanks, hugs, hugsTimes, laterBy, sweep, read, nextOf, rowsOf, finishKudosOnboarding, doesEveryKudosQuest, doesEveryHugQuest };
}

describe("HH55: Quests answers one next quest, the hug quest while it is unfinished, else the kudos quest, else nothing", { timeout: budgetMs * 2 }, () => {
  test("a newcomer's next quest is the hug ladder's next step, from before their first hug to its last step", async () => {
    const t = await setUp(twoQuests);
    await t.thanks("bob", "alice");
    expect(await t.nextOf("bob"), "before any hug").toEqual({ side: "hug", quest: journey("hugs-3") });

    await t.hugsTimes(3, "bob", "alice");
    expect(await t.nextOf("bob"), "after 3 hugs").toEqual({ side: "hug", quest: journey("hugs-5") });

    await t.hugsTimes(2, "bob", "alice");
    expect(await t.nextOf("bob"), "after 5 hugs").toEqual({ side: "hug", quest: journey("hugs-10") });
  });

  test("once the ladder is finished and no hug quest is drawn yet, the next quest is the kudos side's: the next onboarding quest", async () => {
    const t = await setUp(twoQuests);
    await t.thanks("bob", "alice");
    await t.hugsTimes(10, "bob", "alice");

    expect(await t.nextOf("bob")).toEqual({ side: "kudos", quest: journey("someone-new") });
  });

  test("the week's drawn hug quest is next while it is unfinished, then the week's kudos quest, then nothing", async () => {
    const t = await setUp(twoQuests);
    await t.finishKudosOnboarding("bob");
    await t.hugsTimes(10, "bob", "alice");
    await t.sweep();
    expect(await t.nextOf("bob"), "both sides drawn").toEqual({ side: "hug", quest: weekly(3) });

    await t.doesEveryHugQuest("bob");
    expect(await t.nextOf("bob"), "the hug quest finished").toEqual({ side: "kudos", quest: weekly(4) });

    await t.doesEveryKudosQuest("bob");
    expect(await t.nextOf("bob"), "both finished").toBeNull();
  });

  test("a member off the Monday path has no next quest", async () => {
    const t = await setUp(["xp-levels", "two-quests"]);
    await t.thanks("bob", "alice");

    expect(await t.nextOf("bob")).toBeNull();
  });

  test("HH57: with two-quests off, the next quest is the next onboarding quest as before, and nothing once onboarding is finished", async () => {
    const t = await setUp(mondayPath);
    await t.thanks("bob", "alice");
    await t.hugsTimes(3, "bob", "alice");
    expect(await t.nextOf("bob"), "hugs climb no ladder").toEqual({ side: "kudos", quest: journey("someone-new") });

    t.laterBy(dayMs);
    await t.thanks("bob", "carol");
    expect(await t.nextOf("bob"), "onboarding finished").toBeNull();
  });
});

describe("HH54 HH55: the week's two quests, the hug quest first, the next one marked", { timeout: budgetMs * 2 }, () => {
  test("a newcomer one hug up the ladder reads the ladder's next step, marked next, then the next onboarding quest with its own how-to and 50 XP", async () => {
    const t = await setUp(twoQuests);
    await t.thanks("bob", "alice");
    await t.hugs("bob", "alice");

    expect(await t.rowsOf("bob")).toEqual([
      { side: "hug", quest: journey("hugs-3"), goal: "Give 3 hugs", finished: false, progress: { done: 1, of: 3, unit: "hugs" }, xp: 20, howTo: "hug", next: true },
      { side: "kudos", quest: journey("someone-new"), goal: "Thank someone new", finished: false, progress: { done: 0, of: 1, unit: "kudos" }, xp: 50, howTo: "someone-new", next: false },
    ]);
  });

  test("the ladder's row counts the hugs given on it and is the next quest on its own, until the ladder is finished", async () => {
    const t = await setUp(twoQuests);
    await t.thanks("bob", "alice");
    await t.hugsTimes(4, "bob", "alice");

    expect(await t.read((ctx) => hugLadderRowOf(ctx, t.people.bob!)), "on Give 5 hugs").toEqual({
      side: "hug", quest: journey("hugs-5"), goal: "Give 5 hugs", finished: false, progress: { done: 4, of: 5, unit: "hugs" }, xp: 20, howTo: "hug", next: true,
    });
    await t.hugsTimes(6, "bob", "alice");
    expect(await t.read((ctx) => hugLadderRowOf(ctx, t.people.bob!)), "the ladder finished").toBeNull();
  });

  test("the two-days quest counts its days", async () => {
    const t = await setUp(twoQuests);
    await t.thanks("bob", "alice");
    await t.thanks("bob", "carol");
    await t.hugsTimes(10, "bob", "alice");

    expect(await t.rowsOf("bob")).toEqual([
      { side: "kudos", quest: journey("two-days"), goal: "Thank someone on two different days", finished: false, progress: { done: 1, of: 2, unit: "days" }, xp: 50, howTo: "two-days", next: true },
    ]);
  });

  test("past both onboardings it reads the week's drawn quests; a finished hug quest is done at its target, and the kudos quest is next", async () => {
    const t = await setUp(twoQuests);
    await t.finishKudosOnboarding("bob");
    await t.hugsTimes(10, "bob", "alice");
    await t.sweep();
    await t.doesEveryHugQuest("bob");

    const [hugQuest, kudosQuest, ...more] = await t.rowsOf("bob");
    expect(more).toEqual([]);
    expect(goalsOf(hugQuestPool)).toContain(hugQuest!.goal);
    expect(hugQuest).toMatchObject({ side: "hug", quest: weekly(3), finished: true, xp: 20, howTo: "hug", next: false });
    expect(hugQuest!.progress.done).toBe(hugQuest!.progress.of);
    const pooledHug = hugQuestPool.quests.find(({ goal }) => goal.replace(/\.$/, "") === hugQuest!.goal)!;
    expect(hugQuest!.progress.unit, "a hug quest counts its days or its hugs").toBe(pooledHug.progress.counts === "days" ? "days" : "hugs");
    expect(goalsOf(mondayQuestPool)).toContain(kudosQuest!.goal);
    expect(kudosQuest).toMatchObject({ side: "kudos", quest: weekly(4), finished: false, xp: 20, howTo: null, next: true });
  });

  test("a side with no quest this week, its onboarding just finished and nothing drawn yet, reads no row", async () => {
    const t = await setUp(twoQuests);
    await t.finishKudosOnboarding("bob");

    expect((await t.rowsOf("bob")).map(({ side, goal }) => `${side}: ${goal}`)).toEqual(["hug: Give 3 hugs"]);
  });

  test("a new week past both onboardings, before anything draws it, reads no rows and no next quest", async () => {
    const t = await setUp(twoQuests);
    await t.finishKudosOnboarding("bob");
    await t.hugsTimes(10, "bob", "alice");
    await t.sweep();
    expect(await t.rowsOf("bob"), "this week's two quests").toHaveLength(2);

    t.laterBy(7 * dayMs);

    expect(await t.rowsOf("bob")).toEqual([]);
    expect(await t.nextOf("bob")).toBeNull();
  });

  // The website's quests read is S17's mondayQuestsOf, still a stub on main, so each case below waits on S17 and checks
  // that it ends exactly there; once S17 lands they pass, and stillWaiting fails them so S17 makes them plain tests.
  const websiteRead = "website.mondayQuests.mondayQuestsOf";
  const readOf = (t: Awaited<ReturnType<typeof setUp>>, name: string) => t.read((ctx) => mondayQuestsOf(ctx, { member: t.people[name]!, workspace: "T1", user: `U_${name.toUpperCase()}` }));
  const hugHint = "React with your kudos emoji on any message in Slack.";
  const newHint = "Someone from another team counts, and so does a new joiner.";

  test("the website's quests read shows a newcomer's two rows with their hint, item and drawn (waits on S17)", async () => {
    const t = await setUp(twoQuests);
    await t.thanks("bob", "alice");
    await t.hugs("bob", "alice");

    expect(await stillWaiting(["S17"], async () => {
      expect((await readOf(t, "bob")).quests).toEqual({
        kind: "two-quests",
        quests: [
          { side: "hug", goal: "Give 3 hugs", hint: hugHint, progress: { done: 1, target: 3 }, done: false, reward: { xp: 20 }, item: null, next: true, drawn: false },
          { side: "kudos", goal: "Thank someone new", hint: newHint, progress: { done: 0, target: 1 }, done: false, reward: { xp: 50 }, item: null, next: false, drawn: false },
        ],
        steps: expect.any(Array),
      });
    })).toBe(websiteRead);
  }, budgetMs);

  test("a tab running a website built before the two quests reads the same rows as a journey's steps (waits on S17)", async () => {
    const t = await setUp(twoQuests);
    await t.thanks("bob", "alice");
    await t.hugs("bob", "alice");

    expect(await stillWaiting(["S17"], async () => {
      const list = (await readOf(t, "bob")).quests as { kind: string; quests?: unknown[]; steps?: Array<{ goal: string; hint: string | null; done: boolean; reward: { xp: number } | null }> };
      const steps = (list.kind === "drawn" ? list.quests : list.steps) as typeof list.steps;
      expect(steps).toEqual(list.quests);
      expect(steps!.map(({ goal, hint, done, reward }) => ({ goal, hint, done, reward }))).toEqual([
        { goal: "Give 3 hugs", hint: hugHint, done: false, reward: { xp: 20 } },
        { goal: "Thank someone new", hint: newHint, done: false, reward: { xp: 50 } },
      ]);
    })).toBe(websiteRead);
  }, budgetMs);

  test("past both onboardings a finished hug quest reads done with its hoggie waiting, and the kudos quest next (waits on S17)", async () => {
    const t = await setUp(twoQuests);
    await t.finishKudosOnboarding("bob");
    await t.hugsTimes(10, "bob", "alice");
    await t.sweep();
    await t.doesEveryHugQuest("bob");

    expect(await stillWaiting(["S17"], async () => {
      const { quests } = await readOf(t, "bob");
      if (quests.kind !== "two-quests") throw new Error(`expected the two quests, got ${quests.kind}`);
      const [hugQuest, kudosQuest] = quests.quests;
      expect(goalsOf(hugQuestPool)).toContain(hugQuest!.goal);
      expect(hugQuest).toMatchObject({ side: "hug", hint: hugHint, done: true, reward: { xp: 20 }, item: "waiting", next: false, drawn: true });
      expect(hugQuest!.progress.done).toBe(hugQuest!.progress.target);
      expect(goalsOf(mondayQuestPool)).toContain(kudosQuest!.goal);
      expect(kudosQuest).toMatchObject({ side: "kudos", hint: null, done: false, reward: { xp: 20 }, item: null, next: true });
    })).toBe(websiteRead);
  }, budgetMs);

  test("a new week past both onboardings, before anything draws it, reads two quests with no row, which the website answers not-found (waits on S17)", async () => {
    const t = await setUp(twoQuests);
    await t.finishKudosOnboarding("bob");
    await t.hugsTimes(10, "bob", "alice");
    await t.sweep();
    expect(await t.rowsOf("bob"), "this week's two quests").toHaveLength(2);
    t.laterBy(7 * dayMs);

    expect(await stillWaiting(["S17"], async () => {
      expect((await readOf(t, "bob")).quests).toMatchObject({ kind: "two-quests", quests: [] });
    })).toBe(websiteRead);
  }, budgetMs);

  test("HH57: with two-quests off, the website's read is the Getting started journey as before (waits on S17)", async () => {
    const t = await setUp(mondayPath);
    await t.thanks("bob", "alice");
    await t.hugs("bob", "alice");

    expect(await stillWaiting(["S17"], async () => {
      expect((await readOf(t, "bob")).quests.kind).toBe("journey");
    })).toBe(websiteRead);
  }, budgetMs);
});
