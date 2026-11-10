// What Quests records over the service's transaction: each member's quest start, each recognition once from that start,
// each finish once, and the judged marker of each award. Today's convex/quests start, recognitions, finishes, finish and
// judged modules; their harness tests reach S4's giving and wait for it (the test-port ledger).
import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { subscribersOf, type Subscription } from "../bus/publish.ts";
import { createClock } from "../clock.ts";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/index.ts";
import { mutationJob } from "../jobs/define.ts";
import type { HugGivenEvent, KudosGivenEvent } from "../bus/events.ts";
import type { AwardId } from "../engine/awards.ts";
import type { Log } from "../log.ts";
import { createOperations } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { seeder } from "../../testing/seed.ts";
import { finishMondayQuest } from "./finish.ts";
import { questFinishOf } from "./finishes.ts";
import { judgeQuestsOf, questsJudgedFor } from "./judged.ts";
import { factOfHugGiven, factOfKudosGiven, recognitionsOf, recognize } from "./recognitions.ts";
import { questStartOf, startQuests } from "./start.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const tuesday = Date.UTC(2026, 9, 13, 10);
const minuteMs = 60_000;
const alice = "member-alice" as MemberId;
const bob = "member-bob" as MemberId;
const carol = "member-carol" as MemberId;

// Every questFinished published, read back from the jobs a recording subscriber got. S4's test backend replaces it.
const recorder = mutationJob("test.questFinished", z.object({ event: z.looseObject({ type: z.string() }) }), async () => {});

function setUp() {
  const clock = createClock({ real: () => tuesday + 60 * minuteMs });
  const subscribers = subscribersOf([{ event: "questFinished", job: recorder }] as Subscription<any>[]);
  const operations = createOperations({ pool: database.pool, clock, log: quiet, subscribers });
  const published = () =>
    operations.query("test.published", async ({ tx }) => {
      const rows = await tx.select().from(jobs).where(eq(jobs.name, recorder.name)).orderBy(asc(jobs._creationTime), asc(jobs._id));
      return rows.map((row) => {
        const { fact, ...event } = toDocument<{ args: { event: Record<string, unknown> } }>(jobs, row).args.event;
        return event;
      });
    });
  return { operations, seed: seeder(operations), published };
}

function kudosAt(minutes: number, day = "2026-10-13", recipients: MemberId[] = [alice, carol]): KudosGivenEvent {
  const at = tuesday + minutes * minuteMs;
  return {
    type: "kudosGiven",
    workspace: "T1",
    giver: bob,
    message: { workspace: "T1", conversation: "C1", message: `${minutes}.000100` },
    awards: recipients.map((recipient, i) => ({ award: `award-${minutes}-${i}` as AwardId, giver: bob, recipient, kudos: 1 })),
    day,
    at,
  } as KudosGivenEvent;
}

function hugAt(minutes: number): HugGivenEvent {
  return { type: "hugGiven", workspace: "T1", giver: bob, author: carol, message: { workspace: "T1", conversation: "C1", message: `${minutes}.000200` }, onKudos: false, day: "2026-10-13", at: tuesday + minutes * minuteMs };
}

describe("the quest start", () => {
  test("is the first start recorded, and a later one changes nothing", async () => {
    const { operations } = setUp();

    expect(await operations.query("test", (ctx) => questStartOf(ctx, bob))).toBeNull();
    await operations.mutation("test", (ctx) => startQuests(ctx, bob, tuesday));
    await operations.mutation("test", (ctx) => startQuests(ctx, bob, tuesday + minuteMs));

    expect(await operations.query("test", (ctx) => questStartOf(ctx, bob))).toBe(tuesday);
  });
});

describe("recognitions", () => {
  test("a giver without a quest start records nothing", async () => {
    const { operations, seed } = setUp();

    expect(await operations.mutation("test", (ctx) => recognize(ctx, factOfKudosGiven(kudosAt(1))))).toBe(false);
    expect(await seed.all("questRecognitions")).toEqual([]);
  });

  test("a kudos or hug given before the quest start records nothing", async () => {
    const { operations } = setUp();
    await operations.mutation("test", (ctx) => startQuests(ctx, bob, tuesday + 2 * minuteMs));

    expect(await operations.mutation("test", (ctx) => recognize(ctx, factOfKudosGiven(kudosAt(1))))).toBe(false);
    expect(await operations.mutation("test", (ctx) => recognize(ctx, factOfHugGiven(hugAt(1))))).toBe(false);
  });

  test("each kudos message and hug is recorded once, with its recipients and the kudos it carried", async () => {
    const { operations } = setUp();
    await operations.mutation("test", (ctx) => startQuests(ctx, bob, tuesday));

    const recorded = [];
    for (const fact of [factOfKudosGiven(kudosAt(1)), factOfHugGiven(hugAt(2)), factOfKudosGiven(kudosAt(1)), factOfHugGiven(hugAt(2))]) recorded.push(await operations.mutation("test", (ctx) => recognize(ctx, fact)));

    expect(recorded).toEqual([true, true, false, false]);
    expect(await operations.query("test", (ctx) => recognitionsOf(ctx, bob, "2026-10-12"))).toEqual([
      { source: "kudos", workspace: "T1", giver: bob, people: [alice, carol], kudos: 2, message: kudosAt(1).message, day: "2026-10-13", at: tuesday + minuteMs },
      { source: "hug", workspace: "T1", giver: bob, people: [carol], kudos: 0, message: hugAt(2).message, day: "2026-10-13", at: tuesday + 2 * minuteMs },
    ]);
  });

  test("the same kudos message to other recipients, as an edit adds them, is a recognition of its own", async () => {
    const { operations } = setUp();
    await operations.mutation("test", (ctx) => startQuests(ctx, bob, tuesday));

    expect(await operations.mutation("test", (ctx) => recognize(ctx, factOfKudosGiven(kudosAt(1, "2026-10-13", [alice]))))).toBe(true);
    expect(await operations.mutation("test", (ctx) => recognize(ctx, factOfKudosGiven(kudosAt(1, "2026-10-13", [alice, carol]))))).toBe(true);
  });

  test("a week's recognitions are those given Monday to Sunday", async () => {
    const { operations } = setUp();
    await operations.mutation("test", (ctx) => startQuests(ctx, bob, tuesday - 7 * 24 * 60 * minuteMs));

    for (const day of ["2026-10-11", "2026-10-12", "2026-10-18", "2026-10-19"]) await operations.mutation("test", (ctx) => recognize(ctx, factOfKudosGiven({ ...kudosAt(1, day), message: { workspace: "T1", conversation: "C1", message: day } })));

    expect((await operations.query("test", (ctx) => recognitionsOf(ctx, bob, "2026-10-12"))).map(({ day }) => day)).toEqual(["2026-10-12", "2026-10-18"]);
  });
});

describe("quest finishes", () => {
  test("finishing a quest records it once, with what it pays, and a second finish records nothing", async () => {
    const { operations, seed } = setUp();
    const cause = { workspace: "T1", conversation: "C1", message: "1.000100" };
    const finish = () => operations.mutation("test", (ctx) => finishMondayQuest(ctx, "T1", bob, { kind: "journey", step: "hugs-3" }, { reward: { xp: 20, coins: 0, item: null }, catalogueVersion: "2" }, tuesday, cause));

    expect(await finish()).toBe(true);
    expect(await finish()).toBe(false);

    expect(await seed.all("questFinishes")).toEqual([expect.objectContaining({ member: bob, key: "journey:hugs-3", xp: 20, catalogueVersion: "2", at: tuesday, cause })]);
    expect(await operations.query("test", (ctx) => questFinishOf(ctx, bob, "journey:hugs-3"))).toEqual(expect.objectContaining({ member: bob, key: "journey:hugs-3" }));
    expect(await operations.query("test", (ctx) => questFinishOf(ctx, carol, "journey:hugs-3"))).toBeNull();
  });

  test("finishing a quest publishes questFinished once, with its reward, and a second finish publishes nothing", async () => {
    const { operations, published } = setUp();
    const cause = { workspace: "T1", conversation: "C1", message: "1.000100" };
    const finish = () => operations.mutation("test", (ctx) => finishMondayQuest(ctx, "T1", bob, { kind: "weekly", week: "2026-10-12", slot: 1 }, { reward: { xp: 15, coins: 0, item: null }, catalogueVersion: "2", poolQuest: "say-why" }, tuesday, cause));

    await finish();
    await finish();

    expect(await published()).toEqual([{ type: "questFinished", workspace: "T1", member: bob, quest: { kind: "weekly", week: "2026-10-12", slot: 1 }, poolQuest: "say-why", rewardKey: "weekly:2026-10-12:1", reward: { xp: 15, coins: 0 }, catalogueVersion: "2", at: tuesday, cause }]);
  });

  test("a finish without a cause or pool quest publishes neither", async () => {
    const { operations, published } = setUp();

    await operations.mutation("test", (ctx) => finishMondayQuest(ctx, "T1", bob, { kind: "journey", step: "hugs-3" }, { reward: { xp: 20, coins: 0, item: null }, catalogueVersion: "2" }, tuesday));

    expect(await published()).toEqual([{ type: "questFinished", workspace: "T1", member: bob, quest: { kind: "journey", step: "hugs-3" }, rewardKey: "journey:hugs-3", reward: { xp: 20, coins: 0 }, catalogueVersion: "2", at: tuesday }]);
  });

  test("a finish without a cause keeps no cause", async () => {
    const { operations, seed } = setUp();

    await operations.mutation("test", (ctx) => finishMondayQuest(ctx, "T1", bob, { kind: "journey", step: "hugs-5" }, { reward: { xp: 20, coins: 0, item: null }, catalogueVersion: "2" }, tuesday));

    const [finish] = await seed.all("questFinishes");
    expect(finish).not.toHaveProperty("cause");
  });
});

describe("judged markers", () => {
  test("an award is judged once Quests judged it, and a message is judged once every award of it is", async () => {
    const { operations, seed } = setUp();
    const [first, second] = [{ award: "award-1" as AwardId }, { award: "award-2" as AwardId }];

    expect(await operations.query("test", (ctx) => questsJudgedFor(ctx, [first]))).toBe(false);
    await operations.mutation("test", (ctx) => judgeQuestsOf(ctx, [first]));
    await operations.mutation("test", (ctx) => judgeQuestsOf(ctx, [first]));

    expect(await operations.query("test", (ctx) => questsJudgedFor(ctx, [first]))).toBe(true);
    expect(await operations.query("test", (ctx) => questsJudgedFor(ctx, [first, second]))).toBe(false);
    expect(await seed.all("questsJudged"), "one marker per award").toHaveLength(1);
  });
});
