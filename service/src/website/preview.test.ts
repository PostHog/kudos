// A member previews the website by their own decision: today's convex/website/preview.test.ts. Sign-ins run 17.1's
// first entry, and a member's reads run the handler for a `me` made from their directory row, as S15's member check
// answers it. The reads and commands whose subject is the member check or a session (closed, signed out, a session from
// before the preview) go through S15's route transport with the reader's identity, in S17's route pull request. Today's
// getLeaderboard read has no service handler yet, so the closest service functions stand in for it until S16 ports it.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEmails, onForEveryone } from "../../testing/flags.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { rankedBoardOf } from "../leaderboard/totals.ts";
import type { QueryContext } from "../operations.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady } from "../unlocks/unlocks.ts";
import type { MemberId } from "../workspace/directory.ts";
import { frontDoorLinksOf } from "./link.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { getMyProfile } from "./profile.ts";
import { rememberSignedInMember, SignInRefused } from "./signIn.ts";
import { leaderboardStateOf, unlockPathOf } from "./unlockPath.ts";

const allowedWorkspace = "T1";
const siteUrl = "https://kudos-site.test";
const alice = { user: "U_ALICE", email: "alice@example.com", name: "Alice Hart" };
const bob = { user: "U_BOB", email: "bob@example.com", name: "Bob Reyes" };

const websiteForAlice = onForEmails("website", alice.email);
const everythingForAlice = ["website", "xp-levels", "everyone-board", "unlocks", "quests"].map((key) => onForEmails(key, alice.email));
const websiteForEveryoneTheRestForAlice = [onForEveryone("website"), ...everythingForAlice.slice(1)];

const backend = useTestBackend({ now: new Date("2026-10-14T10:00:00Z").getTime(), workspace: allowedWorkspace });

let t: TestBackend;

beforeEach(() => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", allowedWorkspace);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("SITE_URL", siteUrl);
  t = backend();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// What today's `refreshFlagDefinitions` and `prepareWebsiteFlag` did: the definitions stored, and the workspace's key.
async function flagsServed(...definitions: FlagDefinition[]) {
  await definitionsStored(t.operations, ...definitions);
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

function aMemberWithEmail({ user, email }: { user: string; email: string }) {
  return t.seed.insert("members", { workspace: allowedWorkspace, user, kind: "member", asOf: 0, email }) as Promise<MemberId>;
}

function signIn({ user, name }: { user: string; name: string }) {
  return t.run((ctx) => rememberSignedInMember(ctx, { workspace: allowedWorkspace, user, name }));
}

// Today's website/leaderboard.ts getLeaderboard, S16's: an off leaderboard is not found, an open one is the board.
async function weeklyLeaderboard(ctx: QueryContext, me: VerifiedMember) {
  const state = await leaderboardStateOf(ctx, me, await unlockPathOf(ctx, me));
  if (state.kind === "off") return { kind: "not-found" as const };
  if (state.kind !== "open") return state;
  await rankedBoardOf(ctx, me.workspace, me.user, "week");
  return { kind: "board" as const };
}

async function reachesLevel(member: MemberId, level: number) {
  const message = { workspace: allowedWorkspace, conversation: "C1", message: `level-${level}-${member}` };
  const event: LevelReachedEvent = { type: "levelReached", workspace: allowedWorkspace, member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at: t.clock.now() };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

// The refusal a sign-in ends in; any other error, a stub's included, fails the test as itself.
const refusalOf = (entry: Promise<unknown>) =>
  entry.then(
    () => undefined,
    (error: unknown) => {
      if (error instanceof SignInRefused) return error;
      throw error;
    },
  );

const rowsOf = (table: "users" | "flagExposures" | "previewMoments" | "unlockLaunches" | "bookLaunches") => t.seed.all(table);

async function websiteExposures() {
  return (await t.seed.all("flagExposures")).filter(({ flag }) => flag === "website").map(({ member, value }) => ({ member, value }));
}

async function previewMoments() {
  return (await t.seed.all("previewMoments")).map(({ member, moment }) => ({ member, moment }));
}

function anAnalyticsIdFor(member: MemberId) {
  return t.run((ctx) => analyticsIdOf(ctx, member));
}

const meOf = (member: MemberId, { user, name }: { user: string; name: string }): VerifiedMember => ({ member, workspace: allowedWorkspace, user, name });

// The stacks a member's profile read reaches past the member check: engine/ S4, progression/ S6, wallet/ S7, the album
// flag S9, avatars S10, groups/ S11, the clock and the member check S15, the unlock path, inventory and book spread
// S16, settings and the skill tree S17's later PRs.
// A sign-in reaches the directory S3, the welcome item S8 and the preview moments it runs S6, and the website flag reads
// S6's unlock launch.

describe("F26 F27 F28 F29: a member previews the website by their own decision", () => {
  describe("F26: signing in admits on the workspace decision or the member's own", () => {
    test("while the website is closed for the workspace, a member it doesn't name and a person the directory doesn't know are refused, and no account appears", async () => {
      await aMemberWithEmail(alice);
      await aMemberWithEmail(bob);
      await flagsServed(websiteForAlice);

      expect((await refusalOf(signIn(bob)))?.message).toMatch(/closed/);
      expect((await refusalOf(signIn({ user: "U_STRANGER", name: "Stranger" })))?.message).toMatch(/closed/);

      expect(await rowsOf("users")).toEqual([]);
      expect(await rowsOf("flagExposures")).toEqual([]);
    });

    waitsOn(["S3", "S6", "S8", "S15"], "signing in runs the previewing member's due preview moments, and never the unlocks launch", async () => {
      const member = await aMemberWithEmail(alice);
      await flagsServed(...everythingForAlice);

      await signIn(alice);
      await t.settle();

      expect(await previewMoments()).toEqual([{ member, moment: "unlocks" }]);
      expect(await rowsOf("unlockLaunches")).toEqual([]);
    });

    waitsOn(["S3", "S6", "S8", "S15"], "with the website on for the workspace, a member signs in with their website exposure and no preview moment runs", async () => {
      const member = await aMemberWithEmail(bob);
      await flagsServed(onForEveryone("website"), onForEveryone("xp-levels"), onForEveryone("unlocks"));

      await signIn(bob);

      expect(await websiteExposures()).toEqual([{ member, value: true }]);
      expect(await previewMoments()).toEqual([]);
      expect(await rowsOf("unlockLaunches")).toEqual([]);
    });
  });

  describe("F27: a signed-in member's reads follow their own decision", () => {
    waitsOn(["S3", "S4", "S6", "S7", "S8", "S9", "S10", "S11", "S15", "S16", "S17"], "with the website on for everyone, each member's pages follow their own XP, board and unlocks decisions", async () => {
      const alices = await aMemberWithEmail(alice);
      const bobs = await aMemberWithEmail(bob);
      await flagsServed(...websiteForEveryoneTheRestForAlice);
      await signIn(alice);
      await signIn(bob);
      await reachesLevel(alices, 3);
      await reachesLevel(bobs, 3);
      const asAlice = meOf(alices, alice);
      const asBob = meOf(bobs, bob);

      const alicesProfile = await t.query((ctx) => getMyProfile(ctx, asAlice));
      const bobsProfile = await t.query((ctx) => getMyProfile(ctx, asBob));

      expect(alicesProfile).toMatchObject({ kind: "member", progression: expect.objectContaining({ level: expect.any(Number) }), leaderboard: { kind: "open" } });
      expect(alicesProfile).toMatchObject({ features: expect.arrayContaining([expect.objectContaining({ feature: "leaderboard", state: "open" })]) });
      expect(bobsProfile).toMatchObject({ kind: "member", progression: null, features: null, leaderboard: { kind: "off" } });
      expect((await t.query((ctx) => weeklyLeaderboard(ctx, asAlice))).kind).toBe("board");
      expect(await t.query((ctx) => weeklyLeaderboard(ctx, asBob))).toEqual({ kind: "not-found" });
    });
  });

  describe("F28: App Home's way in for a previewer", () => {
    waitsOn(["S3", "S6", "S8", "S10", "S15", "S16", "S17"], "while the website is closed for the workspace, the previewer's App Home links to the direct sign-in entry of each page, and another member's has no link", async () => {
      const alices = await aMemberWithEmail(alice);
      const bobs = await aMemberWithEmail(bob);
      await flagsServed(...everythingForAlice);
      await signIn(alice);
      await anAnalyticsIdFor(bobs);
      await reachesLevel(alices, 3);

      const alicesLinks = await t.query((ctx) => frontDoorLinksOf(ctx, { workspace: allowedWorkspace, user: alice.user }));
      const bobsLinks = await t.query((ctx) => frontDoorLinksOf(ctx, { workspace: allowedWorkspace, user: bob.user }));

      expect(alicesLinks).toEqual({ origin: `${siteUrl}/sign-in`, pages: [
          { label: "Leaderboard", url: `${siteUrl}/sign-in/leaderboard?src=app-home` },
          { label: "Quests", url: `${siteUrl}/sign-in/?src=app-home` },
        ],
        sections: ["visibility"],
      });
      expect(bobsLinks).toBeNull();
    });

    waitsOn(["S3", "S6", "S15", "S16", "S17"], "with the website on for the workspace, App Home links to the pages themselves", async () => {
      await aMemberWithEmail(bob);
      await flagsServed(onForEveryone("website"));

      expect(await t.query((ctx) => frontDoorLinksOf(ctx, { workspace: allowedWorkspace, user: bob.user }))).toEqual({ origin: siteUrl, pages: [], sections: [] });
    });
  });
});
