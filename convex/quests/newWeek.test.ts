import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeSlack } from "../../testing/fakeSlack";
import { flagsLoaded, flagsOnForEveryone } from "../../testing/flags";
import { settle, testBackend, type Backend } from "../../testing/slackBackend";
import type { MutationCtx } from "../_generated/server";
import crons from "../crons";
import type { MemberId } from "../workspace/directory";
import { rewardKeyOf } from "./crates";
import { onboardingSteps } from "./onboarding";

const tuesday = Date.parse("2026-10-13T10:00:00Z");
const mondayInUtc = Date.parse("2026-10-19T00:00:00Z");
const hourMs = 60 * 60 * 1000;
const thisWeek = "2026-10-19";

beforeEach(() => {
  vi.useFakeTimers({ now: tuesday });
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("P80: the hourly sweep stays within Convex's limits and draws a week once", () => {
  beforeEach(() => {
    flagsOnForEveryone(new FakeSlack().fetch, "xp-levels", "monday-quest");
  });

  test("for 105 members on the Monday path who finished onboarding and 5 who didn't, each sweep mutation schedules at most 100 draws within Convex's transaction limits, and a second run draws nothing new", async () => {
    const t = await flagsLoaded(testBackend({ transactionLimits: true }));
    const onboarded = await t.run(async (ctx) => {
      await ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
      const members: MemberId[] = [];
      for (let index = 0; index < 110; index += 1) members.push(await ctx.db.insert("members", { workspace: "T1", user: `U_${index}`, kind: "member" }));
      for (const member of members.slice(0, 105)) await finishOnboarding(ctx, member);
      return members.slice(0, 105);
    });
    vi.setSystemTime(mondayInUtc);

    await t.mutation(sweepJob(), {});
    expect(await scheduled(t)).toEqual({ draws: 100, sweeps: 1 });
    await settle(t);
    expect(await scheduled(t)).toEqual({ draws: 105, sweeps: 1 });
    expect(await drawnMembers(t, thisWeek)).toEqual(new Set(onboarded));

    vi.setSystemTime(mondayInUtc + hourMs);
    await t.mutation(sweepJob(), {});
    await settle(t);

    expect(await scheduled(t)).toEqual({ draws: 105, sweeps: 2 });
    expect(await drawnMembers(t, thisWeek)).toEqual(new Set(onboarded));
    expect(await t.run(async (ctx) => (await ctx.db.query("questDraws").collect()).length)).toBe(105);
  }, 60_000);
});

async function finishOnboarding(ctx: MutationCtx, member: MemberId) {
  await ctx.db.insert("questStarts", { member, at: tuesday });
  for (const step of onboardingSteps) await ctx.db.insert("questFinishes", { member, key: rewardKeyOf({ kind: "journey", step }), xp: 50, catalogueVersion: "1", at: tuesday });
}

function sweepJob() {
  const job = crons.crons["draw each member's new week of quests"];
  if (job === undefined) throw new Error("no cron job draws each member's new week of quests");
  expect(job.schedule).toEqual({ type: "interval", hours: 1 });
  return makeFunctionReference<"mutation">(job.name);
}

async function scheduled(t: Backend) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return { draws: jobs.filter(({ name }) => name.includes("drawNewWeek")).length, sweeps: jobs.filter(({ name }) => name.includes("quests/newWeek")).length };
}

async function drawnMembers(t: Backend, week: string) {
  return new Set(await t.run(async (ctx) => (await ctx.db.query("questDraws").collect()).filter((draw) => draw.week === week).map(({ member }) => member)));
}
