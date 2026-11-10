// A purchase the catalogue refuses answers progression's reason kind, with a catalogue that moves Circle to a row of its
// own behind Rhythm and retires Spark. Today's convex/website/buyPerkCatalogue.test.ts, on the service's test backend:
// each purchase runs storeCommands.ts's `buyPerk` for a `me` made from the seeded directory row and a `person` the
// directory answers, as S15's member check answers them.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import type { HomeMember } from "../feedback/homes.ts";
import type { PerkId } from "../progression/tree.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { buyPerk } from "./storeCommands.ts";

vi.mock("../progression/tree.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../progression/tree.ts")>();
  const tree = actual.tree.map((perk) => {
    if (perk.perk === "circle") return { ...perk, row: 6, requires: "rhythm" };
    if (perk.perk === "spark") return { ...perk, retired: true };
    return perk;
  });
  return { ...actual, tree, perkOf: (id: PerkId) => tree.find(({ perk }) => perk === id)! };
});

const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const request = "0d6f2c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f";

// Shipping, reaching and opening (S6's unlocks, S10's level-up hoggies), the gate (S16's unlock path, S15's launch
// guard), and the refusal: the command runner (S4) over progression's purchase (S6) and the wallet's coins (S7).
const shippedAndRefused: [Stack, ...Stack[]] = ["S4", "S6", "S7", "S10", "S15", "S16"];

const backend = useTestBackend({ now: now.getTime(), workspace: "T1" });

let t: TestBackend;

beforeEach(() => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  t = backend();
});

afterEach(() => void vi.unstubAllEnvs());

// Today's beforeEach: the website and the tree's flags on, and unlocks shipped before anyone joined. It runs in each
// test, since shipping unlocks reaches S6's stub.
async function treeShipped() {
  await definitionsStored(t.operations, onForEveryone("website"), ...["xp-levels", "unlocks", "skill-tree"].map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));
}

// Today's `aMember` and `aSession`, the progress row, the level reached and the Skill tree opened.
async function aMemberWithTheTreeOpenAt(level: number, xp: number): Promise<VerifiedMember> {
  const member = (await t.seed.insert("members", { workspace: "T1", user: juno.user, kind: "member", asOf: 0 })) as MemberId;
  await t.seed.insert("users", { name: juno.name, chatIdentity: { workspace: "T1", user: juno.user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  await t.seed.insert("memberProgress", { member, xp, pointsSpent: 0 });
  await reachesLevel(member, level);
  expect(await t.run((ctx) => openUnlock(ctx, member, "skillTree", "slack"))).toBe("done");
  return { member, workspace: "T1", user: juno.user, name: juno.name };
}

// Today's `reachesLevel`: the levelReached event through unlocks' `makeReady` and `earnLevelUpHoggies`.
async function reachesLevel(member: MemberId, level: number) {
  const message = { workspace: "T1", conversation: "C1", message: `level-${level}-${member}` };
  const event: LevelReachedEvent = { type: "levelReached", workspace: "T1", member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at: t.clock.now() };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

describe("a website command is a D17 command", () => {
  const refusals = [
    { condition: "a perk in a row above the member's level", level: 5, xp: 600, perk: "circle", reason: "level" },
    { condition: "a perk whose prerequisite the member doesn't own", level: 6, xp: 1000, perk: "circle", reason: "requires" },
    { condition: "a retired perk", level: 5, xp: 600, perk: "spark", reason: null },
  ] as const;

  for (const { condition, level, xp, perk, reason } of refusals) {
    waitsOn(shippedAndRefused, `WS88: ${condition} is refused with progression's reason kind, never words`, async () => {
      await treeShipped();
      const me = await aMemberWithTheTreeOpenAt(level, xp);

      expect(await t.run(async (ctx) => buyPerk(ctx, me, (await lookup(ctx, "T1", me.user)) as HomeMember, { perk, request }))).toEqual({ kind: "refused", reason });
    });
  }
});
