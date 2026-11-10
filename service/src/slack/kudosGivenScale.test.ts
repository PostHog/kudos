// One kudos naming 700 new members with every feature on, from outside: posted through the front door, and every
// kudosGiven subscriber run to the end. Today's convex/slack/kudosGivenScale.test.ts, which guarded Convex's limits
// (no subscriber mutation refused, none scheduling 1,000 functions or more). Postgres has neither limit; what stays is
// that no subscriber's job fails, each member named is counted once, and the giver hears of every tier in one DM.
// It mostly tests the subscribers of other stacks: achievements, progression and unlocks (S6), quests and coins (S7),
// replies and DMs (S5), groups and the spotlight (S11), behind the directory (S3) and the parser's hooks (S7, S9).
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { flagsFromPostHog, onForEveryone } from "../../testing/flags.ts";
import { post, settle } from "../../testing/messageFlows.ts";
import { emoji, mention, section } from "../../testing/slackMessages.ts";
import { waitsOn } from "../../testing/waiting.ts";
import type { LadderId, TierRef } from "../achievements/ladders.ts";
import { achievementsLiveIn } from "../achievements/flag.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { decodeStored } from "../db/codec.ts";
import { jobs, ladderCounts, memberProgress } from "../db/schema/index.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import type { MemberId } from "../workspace/directory.ts";
import { signInWorkspace } from "./signIn.ts";

const now = new Date("2026-10-13T10:00:00Z");
const everyFeature = ["xp-levels", "unlocks", "quests", "skill-tree", "achievements", "coins", "website", "groups", "everyone-board", "activity"];
const kudosTs = `${now.getTime() / 1000}.000100`;
const backend = useTestBackend({ now: now.getTime() });

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  vi.stubEnv("SLACK_WORKSPACE_ID", "T1");
  vi.stubEnv("SITE_URL", "https://kudos-site.test");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("POSTHOG_HOST", postHogHost);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("kudosGiven subscribers keep up with one kudos naming 700 new members: each of them is counted once, and no subscriber's job fails", () => {
  waitsOn(
    ["S3", "S5", "S6", "S7", "S9", "S11"],
    "with every feature on, each member named is counted once, and the giver hears of every tier they earned in one DM",
    async () => {
      const t = await everyFeatureOn();
      const alice = await withTheBookOpen(t, "U_ALICE");
      const recipients = newMembers(t, 700);

      await post(t, [section(...recipients.map((user) => mention(user)), emoji("taco"))], { user: "U_ALICE", ts: kudosTs });
      await settle(t);

      expect(await failedJobs(t)).toEqual([]);
      expect(await countedOf(t, recipients)).toEqual(recipients.map((user) => ({ user, recognition: 1, xp: true })));
      expect(await ladderCountOf(t, alice, "generosity")).toBe(700);
      const alicesTiers = [
        { ladder: "generosity", tier: "bronze" },
        { ladder: "generosity", tier: "silver" },
        { ladder: "generosity", tier: "gold" },
        { ladder: "generosity", tier: "diamond" },
        { ladder: "connections", tier: "bronze" },
        { ladder: "connections", tier: "silver" },
        { ladder: "connections", tier: "gold" },
        { ladder: "connections", tier: "diamond" },
        { ladder: "seasons", tier: "bronze" },
      ];
      expect(await tiersToldTo(t, alice)).toEqual([alicesTiers]);
      expect(await tierNoticesOf(t, alice)).toEqual([{ message: kudosTs, tiers: alicesTiers }]);
    },
    600_000,
  );
});

/** Every feature's flag on for everyone, loaded from PostHog, with the unlocks and the book shipped before anyone joined. */
async function everyFeatureOn() {
  const t = backend();
  t.slack.withMember("U_ALICE");
  await flagsFromPostHog(t.operations, t.postHog, ...everyFeature.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, signInWorkspace()!));
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 700 });
  await t.run((ctx) => unlocksLiveIn(ctx, "T1"));
  await t.run((ctx) => achievementsLiveIn(ctx, "T1"));
  await settle(t);
  return t;
}

async function withTheBookOpen(t: TestBackend, user: string): Promise<MemberId> {
  const member = (await t.seed.insert("members", { workspace: "T1", user, kind: "member" })) as MemberId;
  await t.seed.insert("unlocks", { member, feature: "book", readyAt: now.getTime(), openedAt: now.getTime() });
  return member;
}

function newMembers(t: TestBackend, count: number) {
  const users = Array.from({ length: count }, (_, index) => `U_NEW${String(index).padStart(3, "0")}`);
  for (const user of users) t.slack.withMember(user);
  return users;
}

async function failedJobs(t: TestBackend) {
  return t.query(async ({ tx }) => tx.select({ name: jobs.name, error: jobs.error }).from(jobs).where(eq(jobs.state, "failed")));
}

async function countedOf(t: TestBackend, users: string[]) {
  const members = new Map((await t.seed.all("members")).filter((member) => member.workspace === "T1").map((member) => [member.user, member._id as string]));
  const ids = [...members.values()];
  const recognitions = await t.query(async ({ tx }) => tx.select().from(ladderCounts).where(and(eq(ladderCounts.ladder, "recognition"), inArray(ladderCounts.member, ids))));
  const progress = await t.query(async ({ tx }) => tx.select().from(memberProgress).where(inArray(memberProgress.member, ids)));
  return users.map((user) => {
    const member = members.get(user);
    if (member === undefined) return { user, recognition: 0, xp: false };
    const recognition = recognitions.find((row) => row.member === member)?.count ?? 0;
    const xp = progress.find((row) => row.member === member)?.xp ?? 0;
    return { user, recognition, xp: xp > 0 };
  });
}

async function ladderCountOf(t: TestBackend, member: MemberId, ladder: LadderId) {
  const [row] = await t.query(async ({ tx }) => tx.select().from(ladderCounts).where(and(eq(ladderCounts.member, member), eq(ladderCounts.ladder, ladder))));
  return row?.count ?? 0;
}

type TierNotification = { member: MemberId; notification: { kind: string; tiers?: TierRef[] } };

/** The tiers each DM the giver was sent named: the direct message jobs, whatever became of them. */
async function tiersToldTo(t: TestBackend, member: MemberId) {
  const deliveries = await t.query(async ({ tx }) => tx.select({ args: jobs.args }).from(jobs).where(eq(jobs.name, "slack.directMessages.deliverDirectMessage")));
  return deliveries
    .map(({ args }) => decodeStored(args) as TierNotification)
    .filter((delivery) => delivery.member === member && delivery.notification.kind === "tiers-earned")
    .map(({ notification }) => notification.tiers);
}

async function tierNoticesOf(t: TestBackend, member: MemberId) {
  const notices = await t.seed.all("tierNotices");
  return notices.filter((notice) => notice.member === member).map(({ message, tiers }) => ({ message, tiers }));
}
