// The Monday DM's quests section: today's convex/quests/mondaySection.ts over the service's operations. It answers
// nothing off the Monday path, before the member's quests start, or with the quests message turned off; under
// two-quests it draws any side due and answers the week's two quests with the workspace's kudos emoji; otherwise the
// onboarding quests while one is unfinished, then the week's drawn quests, drawing the week when it is due.
// S6's xp-levels decision runs as main has it. The one body still stubbed on main, the message settings' placeOf, is
// stood in over the rows the tests write, as today's code reads it (by_member_kind, then the member's progress settings).
import { and, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { createClock } from "../clock.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { messageSettings, progressSettings } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { Log } from "../log.ts";
import type { MessageKind, MessagePlace } from "../messageSettings/kinds.ts";
import { directMessageKinds, placesChosenFrom } from "../messageSettings/kinds.ts";
import { createOperations, type QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { useTestDatabase } from "../../testing/database.ts";
import { definitionsStored, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { seeder } from "../../testing/seed.ts";
import { rewardKeyOf } from "./crates.ts";
import { hugLadderSteps } from "./hugLadder.ts";
import { questsSectionFor } from "./mondaySection.ts";
import { onboardingSteps } from "./onboarding.ts";
import { questOf, withoutFullStop, type QuestId } from "./pool.ts";
import { progressUnitOf } from "./progress.ts";

// The message settings' placeOf, as convex/messageSettings/messageSettings.ts reads it: the member's row for the kind
// (by_member_kind, unique), else today's default from their progress settings (by_member, unique).
vi.mock("../messageSettings/messageSettings.ts", async (original) => ({
  ...(await original<object>()),
  placeOf: async (ctx: QueryContext, member: MemberId, kind: MessageKind): Promise<MessagePlace> => {
    const row = unique(
      "messageSettings",
      await ctx.tx.select().from(messageSettings).where(and(eq(messageSettings.member, member), eq(messageSettings.kind, kind))).orderBy(...indexOrder(messageSettings, ["member", "kind"]).orderBy()).limit(2),
    );
    const today = unique("progressSettings", await ctx.tx.select().from(progressSettings).where(eq(progressSettings.member, member)).orderBy(...indexOrder(progressSettings, ["member"]).orderBy()).limit(2));
    const byDefault = kind === "celebrations" ? !(today?.muteNotices ?? false) : directMessageKinds.includes(kind) ? (today?.dms ?? true) : true;
    if (!(row?.on ?? byDefault)) return "none";
    return row?.place ?? placesChosenFrom[kind][0]!;
  },
}));

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
/** Tuesday 13 October 2026, 10:00 UTC, in the week of Monday 12 October. */
const tuesday = Date.UTC(2026, 9, 13, 10);
const flags = ["monday-quest", "xp-levels", "two-quests"];

async function setUp(on: string[], { kudosEmoji = "taco", teammates = ["alice", "carol"] }: { kudosEmoji?: string; teammates?: string[] } = {}) {
  postHogDeciding("sandbox");
  let now = tuesday;
  const operations = createOperations({ pool: database.pool, clock: createClock({ real: () => now }), log: quiet, retryDelayMs: () => 1 });
  const seed = seeder(operations);
  await definitionsStored(operations, ...on.map(onForEveryone), ...flags.filter((key) => !on.includes(key)).map(offForEveryone));
  await seed.insert("workspaces", { workspace: "T1", kudosEmoji, baseAllowance: 200 });
  // Fixed IDs: the week's draw ranks the quests by the member's ID.
  const member = (name: string) => seed.insert("members", { _id: `m-${name}`, workspace: "T1", user: `U_${name.toUpperCase()}`, kind: "member" }) as Promise<MemberId>;
  const bob = await member("bob");
  const others: MemberId[] = [];
  for (const name of teammates) others.push(await member(name));

  const started = (at = tuesday) => seed.insert("questStarts", { member: bob, at });
  const finished = (key: string, at = tuesday) => seed.insert("questFinishes", { member: bob, key, xp: 50, catalogueVersion: "monday-1", at });
  const onboarded = async () => {
    await started();
    for (const step of onboardingSteps) await finished(rewardKeyOf({ kind: "journey", step }));
  };
  const climbedTheLadder = async (at = tuesday) => {
    for (const step of hugLadderSteps) await finished(rewardKeyOf({ kind: "journey", step }), at);
  };
  let messages = 0;
  /** Bob's kudos to a teammate at `at`, recorded as its award. */
  const gave = async (at: number, recipient = others[0]!) => {
    messages += 1;
    await seed.insert("awards", { workspace: "T1", conversation: "C1", message: `${messages}.000100`, giver: bob, recipient, kudos: 1, day: new Date(at).toISOString().slice(0, 10), at } as never);
  };
  const section = () => operations.mutation("test.questsSectionFor", (ctx) => questsSectionFor(ctx, bob, ctx.now));
  return {
    seed, bob, others, started, finished, onboarded, climbedTheLadder, gave, section,
    setNow: (at: number) => {
      now = at;
    },
  };
}

describe("the Monday DM's quests section", () => {
  test("is nothing off the Monday path", async () => {
    const t = await setUp(["xp-levels", "two-quests"]);
    await t.onboarded();
    expect(await t.section(), "monday-quest off").toBeNull();
  });

  test("is nothing before the member's quests start", async () => {
    const t = await setUp(["monday-quest", "xp-levels"]);
    expect(await t.section()).toBeNull();
  });

  test("is nothing once the member turned the quests message off, and comes back in the channel when they choose it", async () => {
    const t = await setUp(["monday-quest", "xp-levels"]);
    await t.started();
    const setting = await t.seed.insert("messageSettings", { member: t.bob, kind: "quests" as MessageKind, on: false });
    expect(await t.section(), "turned off").toBeNull();

    await t.seed.patch("messageSettings", setting, { on: true, place: "channel" });
    expect(await t.section(), "back on").toMatchObject({ kind: "onboarding" });
  });

  test("is nothing for a member who turned direct messages off, before choosing quests", async () => {
    const t = await setUp(["monday-quest", "xp-levels"]);
    await t.started();
    await t.seed.insert("progressSettings", { member: t.bob, dms: false });
    expect(await t.section()).toBeNull();
  });

  test("with two-quests off, lists the onboarding quests while one is unfinished, with how many are done and the two-days count", async () => {
    const t = await setUp(["monday-quest", "xp-levels"]);
    await t.started();
    await t.finished(rewardKeyOf({ kind: "journey", step: "first-thanks" }));
    await t.gave(tuesday - minuteMs);
    t.setNow(tuesday + minuteMs);

    expect(await t.section()).toEqual({
      kind: "onboarding",
      done: 1,
      quests: [
        { goal: "Give a kudos to someone", finished: true, progress: null },
        { goal: "Thank someone new", finished: false, progress: null },
        { goal: "Thank someone on two different days", finished: false, progress: { done: 0, of: 2, unit: "days" } },
      ],
    });
  });

  test("with two-quests off and onboarding finished, draws the week when due and lists its quests, counted only past one", async () => {
    const t = await setUp(["monday-quest", "xp-levels"]);
    await t.onboarded();
    t.setNow(tuesday + minuteMs);

    const answered = await t.section();

    const [draw, ...more] = await t.seed.all("questDraws");
    expect(more, "one draw").toEqual([]);
    expect(answered).toEqual({
      kind: "drawn",
      quests: draw!.slots.map(({ quest }) => {
        const pooled = questOf(quest as QuestId);
        return { goal: withoutFullStop(pooled.goal), finished: false, progress: pooled.progress.target > 1 ? { done: 0, of: pooled.progress.target, unit: progressUnitOf(pooled) } : null };
      }),
    });
    expect(draw!.slots.some(({ quest }) => questOf(quest as QuestId).progress.target > 1), "a counted quest among them").toBe(true);
    expect(draw!.slots.some(({ quest }) => questOf(quest as QuestId).progress.target === 1), "an uncounted one too").toBe(true);
  });

  test("with two-quests off, onboarding finished and no week to draw, is nothing", async () => {
    const t = await setUp(["monday-quest", "xp-levels"], { teammates: [] });
    await t.onboarded();
    t.setNow(tuesday + minuteMs);

    expect(await t.section()).toBeNull();
    expect(await t.seed.all("questDraws")).toEqual([]);
  });

  test("under two-quests, answers the two quests with the workspace's kudos emoji", async () => {
    const t = await setUp(flags, { kudosEmoji: "hedgehug" });
    await t.started();

    expect(await t.section()).toEqual({
      kind: "two-quests",
      kudosEmoji: "hedgehug",
      quests: [
        { side: "hug", quest: { kind: "journey", step: "hugs-3" }, goal: "Give 3 hugs", finished: false, progress: { done: 0, of: 3, unit: "hugs" }, xp: 20, howTo: "hug", next: true },
        { side: "kudos", quest: { kind: "journey", step: "first-thanks" }, goal: "Give a kudos to someone", finished: false, progress: { done: 0, of: 1, unit: "kudos" }, xp: 50, howTo: "first-thanks", next: false },
      ],
    });
  });

  test("under two-quests, draws the side quests that are due before it reads them", async () => {
    const t = await setUp(flags);
    await t.onboarded();
    await t.climbedTheLadder();
    t.setNow(tuesday + dayMs);

    const answered = await t.section();

    const draws = (await t.seed.all("questSideDraws")).map(({ side, drawnAt }) => ({ side, drawnAt }));
    expect(draws).toEqual([
      { side: "hug", drawnAt: tuesday + dayMs },
      { side: "kudos", drawnAt: tuesday + dayMs },
    ]);
    expect(answered).toMatchObject({ kind: "two-quests", quests: [{ side: "hug", quest: { kind: "weekly", slot: 3 }, next: true }, { side: "kudos", quest: { kind: "weekly", slot: 4 }, next: false }] });
  });

  test("under two-quests, past both onboardings with no quest to draw yet, is nothing", async () => {
    // Alone in the workspace no kudos quest is feasible, and the hug side opens the moment after the ladder's last step.
    const t = await setUp(flags, { teammates: [] });
    await t.onboarded();
    await t.climbedTheLadder(tuesday + dayMs);
    t.setNow(tuesday + dayMs);

    expect(await t.section(), "at the ladder's last step").toBeNull();
    expect(await t.seed.all("questSideDraws"), "nothing drawn").toEqual([]);

    t.setNow(tuesday + dayMs + 1);
    expect(await t.section(), "the moment after, the hug side draws").toMatchObject({ kind: "two-quests", quests: [{ side: "hug", quest: { kind: "weekly", slot: 3 } }] });
  });
});
