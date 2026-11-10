// A new week of quests reaches the member: the hourly sweep draws it and their App Home shows it. The test runs every
// module as it is, with Slack and PostHog faked at their boundaries, except the reads of stacks still stubbed on main
// that the draw passes through (S4's lastThankedSince, S13's hugsLeftOf, welcome's isWelcomed, S6's xp-levels
// decision): those stand in over the seeded rows as today's code reads them, as in weekTurn.test.ts. The home is S5's
// republish, so the test waits on S5 and checks that it ends there: once the draw is made, it refreshes the home.
import { and, eq, gt, lte } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { memberDecision } from "../analytics/flags.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { awards, hugs, welcomes, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { QueryContext } from "../operations.ts";
import { xpLevels } from "../progression/xpLevels.ts";
import { hugBudgetOf } from "../workspace/settings.ts";
import type { MemberId } from "../workspace/directory.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { useTestBackend } from "../../testing/backend.ts";
import { stillWaiting } from "../../testing/waiting.ts";
import { onboardingSteps } from "./onboarding.ts";

// S4's lastThankedSince: everyone the giver thanked at or before `atOrBefore` (by_giver_recipient), at -Infinity, then
// the latest of their awards after `since` (by_giver_at).
vi.mock("../engine/awards.ts", async (original) => ({
  ...(await original<object>()),
  lastThankedSince: async (ctx: QueryContext, giver: MemberId, since: number, atOrBefore: number): Promise<Map<MemberId, number>> => {
    const read = async (where: ReturnType<typeof and>, fields: ["giver", "recipient"] | ["giver", "at"]) =>
      (await ctx.tx.select().from(awards).where(where).orderBy(...indexOrder(awards, fields).orderBy())).map((row) => toDocument<Doc<"awards">>(awards, row));
    const lastThanked = new Map<MemberId, number>();
    for (const { recipient, at } of await read(eq(awards.giver, giver), ["giver", "recipient"])) if (at <= atOrBefore && !lastThanked.has(recipient)) lastThanked.set(recipient, -Infinity);
    for (const { recipient, at } of await read(and(eq(awards.giver, giver), gt(awards.at, since), lte(awards.at, atOrBefore)), ["giver", "at"])) {
      if (at > lastThanked.get(recipient)!) lastThanked.set(recipient, at);
    }
    return lastThanked;
  },
}));
// S13's hugsLeftOf: the workspace's hug budget less the giver's hugs that day (by_giver_day, at most the budget).
vi.mock("../hugs/hugs.ts", async (original) => ({
  ...(await original<object>()),
  hugsLeftOf: async (ctx: QueryContext, giver: MemberId, workspace: string, day: string): Promise<number> => {
    const budget = await hugBudgetOf(ctx, workspace);
    const given = await ctx.tx.select({ _id: hugs._id }).from(hugs).where(and(eq(hugs.giver, giver), eq(hugs.day, day))).orderBy(...indexOrder(hugs, ["giver", "day"]).orderBy()).limit(budget);
    return budget - given.length;
  },
}));
// Welcome's isWelcomed: whether the member has a welcome (by_member, unique).
vi.mock("../welcome/welcome.ts", async (original) => ({
  ...(await original<object>()),
  isWelcomed: async (ctx: QueryContext, member: MemberId): Promise<boolean> =>
    unique("welcomes", await ctx.tx.select({ _id: welcomes._id }).from(welcomes).where(eq(welcomes.member, member)).orderBy(...indexOrder(welcomes, ["member"]).orderBy()).limit(2)) !== null,
}));
// S6's xpLevelsOnFor: the member's xp-levels decision, as convex/progression/xpLevels.ts decides it.
vi.mock("../progression/xpLevels.ts", async (original) => ({ ...(await original<object>()), xpLevelsOnFor: (ctx: QueryContext, member: MemberId) => memberDecision(ctx, xpLevels, member) }));

/** Tuesday 13 October 2026, 10:00 UTC, in the week of Monday 12 October. */
const tuesday = Date.UTC(2026, 9, 13, 10);
const backend = useTestBackend({ now: tuesday });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the week turn reaches the member", () => {
  // Waits on S5: today it ends in S5's republish stub, which only the drawn week reaches. Once S5 lands it passes, and
  // stillWaiting fails it so S5 makes it a plain test.
  test("the hourly sweep draws an onboarded member's week and their App Home shows it (waits on S5)", async () => {
    const t = backend();
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
    vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
    vi.stubEnv("POSTHOG_HOST", postHogHost);
    await definitionsStored(t.operations, onForEveryone("monday-quest"), onForEveryone("xp-levels"));
    const member = (user: string) => t.seed.insert("members", { workspace: "T1", user, kind: "member", email: `${user.toLowerCase()}@example.com`, timeZone: "UTC" }) as Promise<MemberId>;
    const bob = await member("U_BOB");
    const alice = await member("U_ALICE");
    for (const started of [bob, alice]) await t.seed.insert("questStarts", { member: started, at: tuesday - 60_000 });
    for (const step of onboardingSteps) await t.seed.insert("questFinishes", { member: bob, key: `journey:${step}`, xp: 50, catalogueVersion: "monday-1", at: tuesday - 60_000 });

    const stoppedAt = await stillWaiting(["S5"], async () => {
      await t.time.runCron("quests.newWeek.sweep");
      await t.settle();

      expect((await t.published()).filter(({ type }) => type === "questsDrawn").map(({ member: drawn }) => drawn), "Bob's week was drawn").toEqual([bob]);
      expect(t.slack.homeShownTo("U_BOB"), "Bob's App Home was published").toBeDefined();
    });

    expect(stoppedAt, "the drawn week refreshes the home, S5's stub").toBe("feedback.homes.republish");
  });
});
