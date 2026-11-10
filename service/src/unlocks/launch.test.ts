// Today's convex/unlocks/launch.test.ts on S4's in-process backend.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsFromPostHog, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { unlockPathShownIn, unlocksLiveIn } from "./launch.ts";

type Switch = "on" | "off";

const backend = useTestBackend();

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  postHogDeciding("sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("unlockPathShownIn: the unlock path shows where xp-levels is on and unlocks apply", () => {
  test.each<[string, boolean, { xpLevels: Switch; unlocks: Switch; launched: boolean }]>([
    ["xp-levels and unlocks on, unlocks launched", true, { xpLevels: "on", unlocks: "on", launched: true }],
    ["xp-levels off", false, { xpLevels: "off", unlocks: "on", launched: true }],
    ["unlocks turned off after its launch", false, { xpLevels: "on", unlocks: "off", launched: true }],
    ["unlocks on but not launched yet", false, { xpLevels: "on", unlocks: "on", launched: false }],
    ["both off and never launched", false, { xpLevels: "off", unlocks: "off", launched: false }],
  ])("with %s, it answers %s", async (_, shown, { xpLevels, unlocks, launched }) => {
    const t = backend();
    await flagsFromPostHog(t.operations, t.postHog, onForEveryone("xp-levels"), onForEveryone("unlocks"));
    if (launched) await unlocksShippedBeforeAnyoneJoined(t);
    await flagsFromPostHog(t.operations, t.postHog, switched("xp-levels", xpLevels), switched("unlocks", unlocks));

    expect(await t.run((ctx) => unlockPathShownIn(ctx, "T1"))).toBe(shown);
  });
});

function switched(key: string, value: Switch) {
  return (value === "on" ? onForEveryone : offForEveryone)(key);
}

async function unlocksShippedBeforeAnyoneJoined(t: TestBackend, workspace = "T1") {
  await t.run((ctx) => unlocksLiveIn(ctx, workspace));
  return t;
}
