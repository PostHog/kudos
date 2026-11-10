// A new week of quests reaches the member: the hourly sweep draws it and their App Home shows it. The test runs every
// module as it is, with Slack and PostHog faked at their boundaries, except welcome's isWelcomed, still stubbed on main,
// which stands in over the seeded rows as today's code reads it, as in weekTurn.test.ts. S5's home publishing
// (slack.appHome.publishHome) is still a stub that nothing registers on main, so the backend registers its job as the
// service will, and the test waits on S5 and checks that it ends there: once the draw is made, the home is published.
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { indexOrder } from "../db/indexOrder.ts";
import { welcomes } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { serviceRegistry } from "../registry.ts";
import { publishHomeJob } from "../slack/appHome.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { useTestBackend } from "../../testing/backend.ts";
import { stillWaiting } from "../../testing/waiting.ts";
import { onboardingSteps } from "./onboarding.ts";

// Welcome's isWelcomed: whether the member has a welcome (by_member, unique).
vi.mock("../welcome/welcome.ts", async (original) => ({
  ...(await original<object>()),
  isWelcomed: async (ctx: QueryContext, member: MemberId): Promise<boolean> =>
    unique("welcomes", await ctx.tx.select({ _id: welcomes._id }).from(welcomes).where(eq(welcomes.member, member)).orderBy(...indexOrder(welcomes, ["member"]).orderBy()).limit(2)) !== null,
}));

/** Tuesday 13 October 2026, 10:00 UTC, in the week of Monday 12 October. */
const tuesday = Date.UTC(2026, 9, 13, 10);
const backend = useTestBackend({ now: tuesday, registry: { ...serviceRegistry, jobs: new Map([...serviceRegistry.jobs, [publishHomeJob.name, publishHomeJob]]) } });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the week turn reaches the member", () => {
  // Waits on S5: today it ends in S5's publishHome stub, which only the drawn week's republish reaches. Once S5 lands
  // it passes, and stillWaiting fails it so S5 makes it a plain test and drops the registry above.
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

    expect(stoppedAt, "the drawn week publishes the home, S5's stub").toBe("slack.appHome.publishHome");
  });
});
