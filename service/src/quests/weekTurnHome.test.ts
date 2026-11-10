// A new week of quests reaches the member: the hourly sweep draws it and their App Home shows it. The draw reads S4's
// awards and S13's hugs, the home is S5's and reads S6's XP levels, all still stubs on main, so the test waits on them
// and runs every module as it is, with Slack and PostHog faked at their boundaries.
import { afterEach, describe, expect, vi } from "vitest";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { useTestBackend } from "../../testing/backend.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { MemberId } from "../workspace/directory.ts";
import { onboardingSteps } from "./onboarding.ts";

/** Tuesday 13 October 2026, 10:00 UTC, in the week of Monday 12 October. */
const tuesday = Date.UTC(2026, 9, 13, 10);
const backend = useTestBackend({ now: tuesday });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the week turn reaches the member", () => {
  waitsOn(["S4", "S5", "S6", "S13"], "the hourly sweep draws an onboarded member's week and their App Home shows it", async () => {
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

    await t.time.runCron("quests.newWeek.sweep");
    await t.settle();

    expect((await t.published()).filter(({ type }) => type === "questsDrawn").map(({ member: drawn }) => drawn), "Bob's week was drawn").toEqual([bob]);
    expect(t.slack.homeShownTo("U_BOB"), "Bob's App Home was published").toBeDefined();
  });
});
