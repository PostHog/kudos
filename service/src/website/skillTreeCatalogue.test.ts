// The skill tree read shows the catalogue's rows as progression's perks give them, a catalogue with a perk on a row of
// its own and two retired ones. Today's convex/website/skillTreeCatalogue.test.ts, on the service's test backend: the
// read is getSkillTree for a `me` made from the seeded directory row. Shipping unlocks, reaching a level and opening the
// Skill tree run S6's unlocks and S10's level-up hoggies; the read reaches S16's unlock path, S6's perks and S7's wallet.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import type { PerkId } from "../progression/tree.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { getSkillTree } from "./skillTree.ts";

const { ember } = vi.hoisted(() => ({ ember: { perk: "ember", name: "Ember", row: 6, skillPoints: 2, requires: "rhythm", copy: "Ember's copy." } }));

vi.mock("../progression/tree.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../progression/tree.ts")>();
  const tree = [ember, ...actual.tree.map((perk) => (perk.perk === "spark" || perk.perk === "circle" ? { ...perk, retired: true } : perk))];
  return { ...actual, tree, perkOf: (id: PerkId) => tree.find(({ perk }) => perk === id)! };
});

const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
// Shipping, reaching and opening (S6's unlocks, S10's level-up hoggies), and the read (S16's unlock path, S6's perks, S7's wallet).
const shippedAndRead: [Stack, ...Stack[]] = ["S6", "S7", "S10", "S16"];

const backend = useTestBackend({ now: now.getTime(), workspace: "T1" });

let t: TestBackend;

beforeEach(() => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
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

describe("WS83 P5 P78: the skill tree read shows the catalogue's rows as perksOf gives them", () => {
  waitsOn(shippedAndRead, "rows come in level order, a prerequisite carries its perk's name, and a retired perk shows only to its owner", async () => {
    await treeShipped();
    const me = await aSignedInMember(juno);
    await t.seed.insert("memberProgress", { member: me.member, xp: 1000, pointsSpent: 1 });
    await t.seed.insert("perksOwned", { member: me.member, perk: "spark", boughtAt: 0, catalogueVersion: "1" });
    await reachesLevel(me.member, 5);
    await opens(me.member);

    const tree = await t.query((ctx) => getSkillTree(ctx, me));

    expect(tree).toMatchObject({
      skillPoints: 1,
      rows: [
        {
          level: 5,
          perks: [
            { perk: "spark", state: "owned", reason: null, ownedAt: 0 },
            { perk: "rhythm", state: "available", reason: null, ownedAt: null },
          ],
        },
        { level: 6, perks: [{ perk: "ember", name: "Ember", cost: { skillPoints: 2 }, requires: "Rhythm", state: "unavailable", reason: "requires", ownedAt: null }] },
      ],
    });
  });
});

// A member signed in as today's `aMember` and `aSession` left them: the directory row, the analytics ID the flags decide
// them by, and the member check's answer.
async function aSignedInMember({ user, name }: { user: string; name: string }): Promise<VerifiedMember> {
  const member = (await t.seed.insert("members", { workspace: "T1", user, kind: "member", asOf: 0 })) as MemberId;
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: "T1", user, name };
}

// Today's `reachesLevel`: the levelReached event through unlocks' `makeReady` and `earnLevelUpHoggies`.
async function reachesLevel(member: MemberId, level: number) {
  const message = { workspace: "T1", conversation: "C1", message: `level-${level}-${member}` };
  const event: LevelReachedEvent = { type: "levelReached", workspace: "T1", member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at: t.clock.now() };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

async function opens(member: MemberId) {
  expect(await t.run((ctx) => openUnlock(ctx, member, "skillTree", "slack"))).toBe("done");
}
