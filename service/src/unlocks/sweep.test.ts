// The hourly sweep pages members 25 a job: the first job handles the first 25, the job it enqueues the rest, and a
// rerun from the start writes nothing new. Members without XP only reach the workspace's launch, so these tests run
// before S5's notices land.
import { asc } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsFromPostHog, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { unlockLaunches, unlocks } from "../db/schema/index.ts";
import { sweepJob } from "./sweep.ts";

const backend = useTestBackend({ now: new Date("2026-10-13T10:00:00Z").getTime() });

beforeEach(() => {
  postHogDeciding("sandbox");
});

test("a sweep launches unlocks where the first 25 members are, and the job it enqueues reaches the 26th", async () => {
  const t = await withMembersInTheirOwnWorkspaces(26);

  await t.run((ctx) => sweepJob.handler(ctx, sweepJob.args.parse({})));
  expect(await launchedWorkspaces(t)).toEqual(workspaces(25));

  await t.settle();
  expect(await launchedWorkspaces(t)).toEqual(workspaces(26));
  expect(await openedLeaderboards(t)).toBe(26);
});

test("the hourly sweep run again launches nothing twice and opens nothing twice", async () => {
  const t = await withMembersInTheirOwnWorkspaces(26);
  await t.time.runCron("unlocks.sweep.sweep");
  const unlocksBefore = await openedLeaderboards(t);

  t.clock.advance(60 * 60 * 1000);
  await t.time.runCron("unlocks.sweep.sweep");

  expect(await launchedWorkspaces(t)).toEqual(workspaces(26));
  expect(await openedLeaderboards(t)).toBe(unlocksBefore);
});

async function withMembersInTheirOwnWorkspaces(count: number) {
  const t = backend();
  await flagsFromPostHog(t.operations, t.postHog, ...["xp-levels", "unlocks", "everyone-board"].map(onForEveryone));
  for (const workspace of workspaces(count)) await t.seed.insert("members", { workspace, user: "U_ALICE", kind: "member", timeZone: "UTC" });
  return t;
}

function workspaces(count: number) {
  return Array.from({ length: count }, (_, index) => `T${String(index).padStart(2, "0")}`);
}

async function launchedWorkspaces(t: TestBackend) {
  const launches = await t.query(({ tx }) => tx.select({ workspace: unlockLaunches.workspace }).from(unlockLaunches).orderBy(asc(unlockLaunches.workspace)));
  return launches.map(({ workspace }) => workspace);
}

async function openedLeaderboards(t: TestBackend) {
  const rows = await t.query(({ tx }) => tx.select({ feature: unlocks.feature, openedAt: unlocks.openedAt }).from(unlocks));
  return rows.filter(({ feature, openedAt }) => feature === "leaderboard" && openedAt !== null).length;
}
