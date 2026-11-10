// The skill tree read: locked, ready, or the tree progression's perks give, with the HUD's skill points beside it.
// Today's convex/website/skillTree.test.ts, on the service's test backend: each read runs getSkillTree, and the HUD's
// points getMyProfile, for a `me` made from the seeded directory row, as S15's member check answers it. The reads whose
// subject is the member check itself (closed, signed out, not a member, an argument naming another member) call
// getSkillTree by its route name through the whole app, signed in through SSO or not at all, so the app's own identity
// mapping and member check (S15) answer them.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { xpToReach } from "../progression/levels.ts";
import { buyPerk, treePerksOf } from "../progression/perks.ts";
import { recordReward } from "../progression/progression.ts";
import type { PerkId } from "../progression/tree.ts";
import { workspaceLink } from "../slack/workspaceLink.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";
import { getMyProfile, type MemberProfile } from "./profile.ts";
import { getSkillTree, type MySkillTree } from "./skillTree.ts";

const now = new Date("2026-10-14T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const treeFlags = ["xp-levels", "unlocks", "skill-tree"];
const levelFive = 600;
const levelSix = 1000;
const levelNine = xpToReach(9);

// Shipping, reaching and opening (S6's unlocks, S10's level-up hoggies), buying and crediting (S6), and the read (S16's
// unlock path, S6's perks, S7's wallet).
const treeStacks: [Stack, ...Stack[]] = ["S6", "S7", "S10", "S16"];
// The tree's read beside the HUD's points: getMyProfile reaches homeFacts (S4), message settings (S5), progression and
// unlocks (S6), the wallet (S7), the album flag (S9), the avatar (S10), groups (S11), the member check's clock (S15) and
// the unlock path (S16).
const withTheHud: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S9", "S10", "S11", "S15", "S16"];
// The read through the whole app, past S15's identity mapping and member check, with the Skill tree open (S6, S7, S10, S16).
const skillTreeStacks: [Stack, ...Stack[]] = ["S6", "S7", "S10", "S15", "S16"];

const spark = { perk: "spark", name: "Spark", copy: "+5 XP the first time each day you give a kudos.", cost: { skillPoints: 1, coins: 0 }, requires: null, upgrades: null } as const;
const rhythm = { perk: "rhythm", name: "Rhythm", copy: "+2 XP for each kudos you give, once per person a day.", cost: { skillPoints: 1, coins: 0 }, requires: null, upgrades: null } as const;
const circle = { perk: "circle", name: "Circle", copy: "+5 XP the first time each week you give a person a kudos.", cost: { skillPoints: 1, coins: 0 }, requires: null, upgrades: null } as const;
const flame = { perk: "flame", name: "Flame", copy: "Spark gives +8 XP instead of +5.", cost: { skillPoints: 1, coins: 150 }, requires: "Spark", upgrades: "spark" } as const;
const cadence = { perk: "cadence", name: "Cadence", copy: "Rhythm gives +3 XP instead of +2.", cost: { skillPoints: 1, coins: 200 }, requires: "Rhythm", upgrades: "rhythm" } as const;
const bridge = {
  perk: "bridge",
  name: "Bridge",
  copy: "Circle gives +8 XP instead of +5 when the person isn't in your primary group. Without a primary group, everyone counts.",
  cost: { skillPoints: 1, coins: 150 },
  requires: "Circle",
  upgrades: "circle",
} as const;
const treasurer = { perk: "treasurer", name: "Treasurer", copy: "+2 🪙 for each kudos you give, once per person a day.", cost: { skillPoints: 1, coins: 0 }, requires: null, upgrades: null } as const;
const banker = { perk: "banker", name: "Banker", copy: "Treasurer gives +4 🪙 instead of +2.", cost: { skillPoints: 2, coins: 250 }, requires: "Treasurer", upgrades: "treasurer" } as const;
const available = { state: "available", reason: null, ownedAt: null } as const;

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

// Today's `switchWebsite(t, postHog, true, ...keys)`: the website open, these flags on for everyone, and the workspace's key made.
async function flagsOn(...keys: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...keys.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

async function unlocksShippedBeforeAnyoneJoined() {
  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));
}

// Today's `describe`-level beforeEach, run in each test, since shipping unlocks reaches S6's stub.
async function treeShipped() {
  await flagsOn(...treeFlags);
  await unlocksShippedBeforeAnyoneJoined();
}

// A member signed in as today's `aMember` and `aSession` left them: the directory row, the analytics ID the flags decide
// them by, and the member check's answer.
async function signedInMember(): Promise<{ member: MemberId; me: VerifiedMember }> {
  const member = (await t.seed.insert("members", { workspace: "T1", user: juno.user, kind: "member", asOf: 0 })) as MemberId;
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, me: { member, workspace: "T1", user: juno.user, name: juno.name } };
}

/** Today's `aSession`: the person signs in, through SSO here, and the website's requests come as them. */
function aSession(person: { user: string }) {
  return signedInThroughSso(t, person);
}

async function withXp(member: MemberId, xp: number) {
  await t.seed.insert("memberProgress", { member, xp, pointsSpent: 0 });
}

async function treeOpenFor(member: MemberId, xp: number) {
  await withXp(member, xp);
  await reachesLevel(member, 5);
  await opens(member, "skillTree");
}

// Today's `reachesLevel`: the levelReached event through unlocks' `makeReady` and `earnLevelUpHoggies`.
async function reachesLevel(member: MemberId, level: number) {
  const message = { workspace: "T1", conversation: "C1", message: `level-${level}-${member}` };
  const event: LevelReachedEvent = { type: "levelReached", workspace: "T1", member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at: t.clock.now() };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

async function opens(member: MemberId, feature: Feature) {
  expect(await t.run((ctx) => openUnlock(ctx, member, feature, "slack"))).toBe("done");
}

async function buys(member: MemberId, perk: PerkId) {
  expect(await t.run((ctx) => buyPerk(ctx, member, perk, `test:${perk}`))).toEqual({ kind: "bought", perk });
}

function skillTreeOf(me: VerifiedMember): Promise<MySkillTree> {
  return t.query((ctx) => getSkillTree(ctx, me));
}

async function skillPointsIn(me: VerifiedMember): Promise<MemberProfile["skillPoints"]> {
  const profile = await t.query((ctx) => getMyProfile(ctx, me));
  if (profile.kind !== "member") throw new Error(`expected a member, got ${profile.kind}`);
  return profile.skillPoints;
}

async function expectProgressionsFacts(member: MemberId, tree: MySkillTree) {
  const perks = await t.query((ctx) => treePerksOf(ctx, member));
  if (tree.kind !== "tree" || perks === null) throw new Error(`expected a tree beside perksOf, got ${tree.kind}`);
  expect(tree.skillPoints).toBe(perks.skillPoints);
  const nodes = tree.rows.flatMap((row) => row.perks.map((node) => ({ ...node, row: row.level })));
  expect(nodes.map(({ perk, name, copy, cost, upgrades, row }) => ({ perk, name, copy, skillPoints: cost.skillPoints, coins: cost.coins, upgrades, row }))).toEqual(
    perks.perks.map(({ perk, name, copy, skillPoints, coins, upgrades, row }) => ({ perk, name, copy, skillPoints, coins, upgrades, row })),
  );
  expect(nodes.map(({ perk, ownedAt }) => ({ perk, ownedAt }))).toEqual(perks.perks.map(({ perk, boughtAt }) => ({ perk, ownedAt: boughtAt })));
}

describe("WS80 WS83: the skill tree read waits for the Skill tree's unlock", () => {
  waitsOn(withTheHud, "a member at level 1 reads it locked at level 5, with no facts, and no skill points", async () => {
    await treeShipped();
    const { me } = await signedInMember();

    expect(await skillTreeOf(me)).toEqual({ kind: "locked", level: 5 });
    expect(await skillPointsIn(me)).toBeNull();
  });

  waitsOn(withTheHud, "a member at level 5 who hasn't opened the Skill tree reads it ready, with no facts, and no skill points", async () => {
    await treeShipped();
    const { member, me } = await signedInMember();
    await withXp(member, levelFive);
    await reachesLevel(member, 5);

    expect(await skillTreeOf(me)).toEqual({ kind: "ready" });
    expect(await skillPointsIn(me)).toBeNull();
  });
});

describe("WS83 WS84: the skill tree read projects progression's perksOf", () => {
  waitsOn(withTheHud, "a member with points and no perks reads every first-row perk available, and the HUD's points equal the tree's", async () => {
    await treeShipped();
    const { member, me } = await signedInMember();
    await treeOpenFor(member, levelSix);

    const tree = await skillTreeOf(me);

    expect(tree).toEqual({
      kind: "tree",
      skillPoints: 2,
      coins: null,
      rows: [{ level: 5, perks: [{ ...spark, ...available }, { ...rhythm, ...available }, { ...circle, ...available }] }],
      chatUrl: workspaceLink("T1"),
    });
    await expectProgressionsFacts(member, tree);
    expect(await skillPointsIn(me)).toBe(2);
  });

  waitsOn(withTheHud, "a member who owns spark reads it owned since they bought it, and the rest still available", async () => {
    await treeShipped();
    const { member, me } = await signedInMember();
    await treeOpenFor(member, levelSix);
    await buys(member, "spark");

    const tree = await skillTreeOf(me);

    expect(tree).toMatchObject({
      skillPoints: 1,
      rows: [{ level: 5, perks: [{ ...spark, state: "owned", reason: null, ownedAt: now.getTime() }, { ...rhythm, ...available }, { ...circle, ...available }] }],
    });
    await expectProgressionsFacts(member, tree);
    expect(await skillPointsIn(me)).toBe(1);
  });

  waitsOn(withTheHud, "a member with no points left reads the perks they don't own unavailable for points, and the HUD shows 0", async () => {
    await treeShipped();
    const { member, me } = await signedInMember();
    await treeOpenFor(member, levelFive);
    await buys(member, "rhythm");

    const tree = await skillTreeOf(me);

    const forPoints = { state: "unavailable", reason: "points", ownedAt: null } as const;
    expect(tree).toMatchObject({
      skillPoints: 0,
      rows: [{ level: 5, perks: [{ ...spark, ...forPoints }, { ...rhythm, state: "owned", reason: null, ownedAt: now.getTime() }, { ...circle, ...forPoints }] }],
    });
    await expectProgressionsFacts(member, tree);
    expect(await skillPointsIn(me)).toBe(0);
  });
});

describe("P77 WS83: the launch opens the Skill tree for a member who was there", () => {
  waitsOn(withTheHud, "a member the launch opened the Skill tree for below level 5 reads every perk unavailable for its level", async () => {
    await flagsOn(...treeFlags);
    const { member, me } = await signedInMember();
    await unlocksShippedBeforeAnyoneJoined();

    const tree = await skillTreeOf(me);

    const forLevel = { state: "unavailable", reason: "level", ownedAt: null } as const;
    expect(tree).toMatchObject({ skillPoints: 0, rows: [{ level: 5, perks: [{ ...spark, ...forLevel }, { ...rhythm, ...forLevel }, { ...circle, ...forLevel }] }] });
    await expectProgressionsFacts(member, tree);
    expect(await skillPointsIn(me)).toBe(0);
  });
});

describe("the website shows only shipped features", () => {
  waitsOn(withTheHud, "WS80 WS84 P78: with skill-tree off, a member who owns spark reads the skill tree not-found and no skill points", async () => {
    await treeShipped();
    const { member, me } = await signedInMember();
    await treeOpenFor(member, levelSix);
    await buys(member, "spark");
    await flagsOn("xp-levels", "unlocks");

    expect(await skillTreeOf(me)).toEqual({ kind: "not-found" });
    expect(await skillPointsIn(me)).toBeNull();
  });

  waitsOn(withTheHud, "WS79 WS80: while unlocks don't apply, the skill tree is not-found though skill-tree is on", async () => {
    await flagsOn(...treeFlags);
    const { me } = await signedInMember();

    expect(await skillTreeOf(me)).toEqual({ kind: "not-found" });
    expect(await skillPointsIn(me)).toBeNull();
    expect(await t.seed.all("unlockLaunches")).toEqual([]);
  });
});

describe("website reads pass one guard", () => {
  waitsOn(skillTreeStacks, "getSkillTree reads closed while the website flag is off, even with the Skill tree open", async () => {
    await treeShipped();
    const { member } = await signedInMember();
    await treeOpenFor(member, levelSix);
    const asSignedIn = await aSession(juno);
    // Today's switchWebsite(t, postHog, false, ...treeFlags): the website off, the tree's flags on.
    await definitionsStored(t.operations, offForEveryone("website"), ...treeFlags.map(onForEveryone));
    await t.run((ctx) => workspaceKeyOf(ctx, "T1"));

    expect(await asSignedIn.read("website.skillTree.getSkillTree", {})).toEqual({ kind: "closed" });
  });

  waitsOn(["S6", "S15"], "getSkillTree reads signed out without a session", async () => {
    await treeShipped();

    expect(await websiteAs(t, null).read("website.skillTree.getSkillTree", {})).toEqual({ kind: "signed-out" });
  });

  waitsOn(["S6", "S15"], "getSkillTree reads not-a-member for a former member with a live session", async () => {
    await treeShipped();
    await t.seed.insert("members", { workspace: "T1", user: juno.user, kind: "not-a-member", asOf: 0 });
    const asSignedIn = await aSession(juno);

    expect(await asSignedIn.read("website.skillTree.getSkillTree", {})).toEqual({ kind: "not-a-member" });
  });

  waitsOn(["S6"], "an argument that names another member is rejected by the validator", async () => {
    await treeShipped();
    await signedInMember();
    const asSignedIn = await aSession(juno);
    const withAnotherMember = { user: "U_ROWAN" };

    await expect(asSignedIn.read("website.skillTree.getSkillTree", withAnotherMember)).rejects.toThrow(argumentsRefused);
  });
});

describe("WS345 CO22 CO25 CO26: the tree draws every row perksOf lists, with coin costs, upgrade links and the wallet", () => {
  async function coinsOpenAtLevelNine(coins: number, ...owned: PerkId[]) {
    await flagsOn(...treeFlags, "coins");
    await unlocksShippedBeforeAnyoneJoined();
    const { member, me } = await signedInMember();
    await treeOpenFor(member, levelNine);
    await reachesLevel(member, 9);
    await opens(member, "coins");
    await t.run((ctx) => recordReward(ctx, "T1", { member, key: "test:savings", xp: 0, coins, item: null, catalogueVersion: "2", at: 0 }));
    for (const perk of owned) await buys(member, perk);
    return { member, me };
  }

  waitsOn(
    treeStacks,
    "with Coins open, a member reads rows 5, 7 and 9, each upgrade with the perk it replaces and its coin price, and their balance",
    async () => {
      const { member, me } = await coinsOpenAtLevelNine(150, "spark");

      const tree = await skillTreeOf(me);

      const forRequires = { state: "unavailable", reason: "requires", ownedAt: null } as const;
      expect(tree).toEqual({
        kind: "tree",
        skillPoints: 4,
        coins: 150,
        rows: [
          { level: 5, perks: [{ ...spark, state: "owned", reason: null, ownedAt: now.getTime() }, { ...rhythm, ...available }, { ...circle, ...available }] },
          { level: 7, perks: [{ ...flame, ...available }, { ...cadence, ...forRequires }, { ...bridge, ...forRequires }, { ...treasurer, ...available }] },
          { level: 9, perks: [{ ...banker, ...forRequires }] },
        ],
        chatUrl: workspaceLink("T1"),
      });
      await expectProgressionsFacts(member, tree);
    },
    30_000,
  );

  waitsOn(
    treeStacks,
    "an upgrade the member can't pay for in coins reads unavailable for coins",
    async () => {
      const { me } = await coinsOpenAtLevelNine(149, "spark");

      expect(await nodeIn(me, "flame")).toMatchObject({ state: "unavailable", reason: "coins" });
    },
    30_000,
  );

  waitsOn(
    treeStacks,
    "while coins aren't visible, the tree reads no wallet and lists an owned upgrade without its price",
    async () => {
      const { member, me } = await coinsOpenAtLevelNine(150, "spark", "flame");
      await flagsOn(...treeFlags);

      const tree = await skillTreeOf(me);

      expect(tree).toMatchObject({ coins: null });
      expect(await perksIn(me)).toEqual(["spark", "rhythm", "circle", "flame"]);
      expect(await nodeIn(me, "flame")).toMatchObject({ cost: { skillPoints: 1, coins: 0 }, upgrades: "spark", state: "owned" });
      await expectProgressionsFacts(member, tree);
    },
    30_000,
  );
});

async function nodeIn(me: VerifiedMember, perk: PerkId) {
  const tree = await skillTreeOf(me);
  if (tree.kind !== "tree") throw new Error(`expected a tree, got ${tree.kind}`);
  return tree.rows.flatMap((row) => row.perks).find((node) => node.perk === perk);
}

async function perksIn(me: VerifiedMember) {
  const tree = await skillTreeOf(me);
  if (tree.kind !== "tree") throw new Error(`expected a tree, got ${tree.kind}`);
  return tree.rows.flatMap((row) => row.perks.map(({ perk }) => perk));
}
