// A member previews the website by their own decision: today's convex/website/preview.test.ts. Sign-ins run 17.1's
// first entry, and a member's reads run the handler for a `me` made from their directory row, as S15's member check
// answers it. The reads and commands whose subject is the member check or a session (closed, signed out, a session from
// before the preview) go through S15's route transport with the reader's identity, in S17's route pull request. Today's
// getLeaderboard read has no service handler yet, so the closest service functions stand in for it until S16 ports it.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
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
import { signedInThroughSso, websiteAs } from "./routesTesting.ts";
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

/** A person who signed in, through the app's first entry, and whose requests come through SSO as them. */
async function signedIn(person: { user: string; name: string; email: string }) {
  await signIn(person);
  return signedInThroughSso(t, person);
}

/** A sign-in from before: a users row for the Slack pair, as today's `aSession`, and the person's requests through SSO. */
async function aSession(person: { user: string; email: string }) {
  await t.seed.insert("users", { chatIdentity: { workspace: allowedWorkspace, user: person.user } });
  return { asSignedIn: await signedInThroughSso(t, person) };
}

/** Today's `myProfile(caller)`: getMyProfile through the whole app, as a signed-in person or a visitor. */
function myProfile(as: ReturnType<typeof websiteAs> = websiteAs(t, null)) {
  return as.read<{ kind: string }>("website.profile.getMyProfile", {});
}

/** Today's `openFeature(caller)`: the website's Open command for the leaderboard, through the whole app. */
function openFeature(as: ReturnType<typeof websiteAs>) {
  return as.command<{ kind: string }>("website.commands.openFeature", { feature: "leaderboard" });
}

const onForHalf = (key: string): FlagDefinition => ({ key, filters: { groups: [{ properties: [], rollout_percentage: 50 }] } });

async function anIdInHalfOf(flag: string, inside: boolean) {
  for (let attempt = 0; ; attempt++) {
    const id = `id-${inside ? "in" : "out"}-${attempt}`;
    if ((await rolloutHashOf(flag, id)) <= 0.5 === inside) return id;
  }
}

async function rolloutHashOf(flag: string, distinctId: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${flag}.${distinctId}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return parseInt(hex.slice(0, 15), 16) / 0xfffffffffffffff;
}

const everyRowOf = (...tables: Array<"analyticsIds" | "flagExposures" | "analyticsOutbox">) => Promise.all(tables.map((table) => t.seed.all(table)));

const meOf = (member: MemberId, { user, name }: { user: string; name: string }): VerifiedMember => ({ member, workspace: allowedWorkspace, user, name });

// The stacks a member's profile read reaches past the member check: engine/ S4, progression/ S6, wallet/ S7, the album
// flag S9, avatars S10, groups/ S11, the clock and the member check S15, the unlock path, inventory and book spread
// S16, settings and the skill tree S17's later PRs.
// A sign-in reaches the directory S3, the welcome item S8, the website flag S15 and the preview moments it runs S6.

describe("F26 F27 F28 F29: a member previews the website by their own decision", () => {
  describe("F26: signing in admits on the workspace decision or the member's own", () => {
    waitsOn(["S3", "S4", "S6", "S7", "S8", "S9", "S10", "S11", "S15", "S16", "S17"], "while the website is closed for the workspace, the member it names by email signs in, sends their website exposure once, and reads their profile", async () => {
      const member = await aMemberWithEmail(alice);
      await flagsServed(websiteForAlice);

      const asAlice = await signedIn(alice);
      await signIn(alice);

      expect((await myProfile(asAlice)).kind).toBe("member");
      expect(await websiteExposures()).toEqual([{ member, value: true }]);
      expect(await myProfile()).toEqual({ kind: "closed" });
    });

    waitsOn(["S3", "S15"], "while the website is closed for the workspace, a member it doesn't name and a person the directory doesn't know are refused, and no account appears", async () => {
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
    waitsOn(["S15"], "while the website is closed for the workspace, a member it doesn't name reads closed with a live session, as a visitor without one does", async () => {
      const bobs = await aMemberWithEmail(bob);
      await aMemberWithEmail(alice);
      await flagsServed(websiteForAlice);
      await anAnalyticsIdFor(bobs);
      const { asSignedIn } = await aSession(bob);

      expect(await myProfile(asSignedIn)).toEqual({ kind: "closed" });
      expect(await myProfile()).toEqual({ kind: "closed" });
    });

    waitsOn(["S15"], "a previewer's session that hasn't been verified yet reads closed, since the workspace decides for a person the directory doesn't know", async () => {
      await flagsServed(websiteForAlice);
      const { asSignedIn } = await aSession(alice);

      expect(await myProfile(asSignedIn)).toEqual({ kind: "closed" });
    });

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

  describe("F27: the website on for the workspace and off in one member's own decision", () => {
    const halfTheWebsite = onForHalf("website");

    function bucketed(inside: boolean) {
      return anIdInHalfOf("website", inside);
    }

    async function aWorkspaceInsideAndBobOutside() {
      const workspaceKey = await bucketed(true);
      const analyticsId = await bucketed(false);
      const member = await aMemberWithEmail(bob);
      await t.seed.insert("workspaceKeys", { workspace: allowedWorkspace, workspaceKey });
      await t.seed.insert("analyticsIds", { member, analyticsId });
      await flagsServed(halfTheWebsite);
      return member;
    }

    waitsOn(["S15"], "a member with no analytics ID yet, whose session the workspace decision admits, is refused by their own decision and the command writes nothing at all", async () => {
      const workspaceKey = await bucketed(true);
      const analyticsId = await bucketed(false);
      await aMemberWithEmail(bob);
      await t.seed.insert("workspaceKeys", { workspace: allowedWorkspace, workspaceKey });
      await flagsServed(halfTheWebsite);
      const { asSignedIn } = await aSession(bob);
      vi.spyOn(crypto, "randomUUID").mockReturnValue(analyticsId as ReturnType<typeof crypto.randomUUID>);
      const before = await everyRowOf("analyticsIds", "flagExposures", "analyticsOutbox");

      expect(await openFeature(asSignedIn)).toEqual({ kind: "closed" });
      expect(await everyRowOf("analyticsIds", "flagExposures", "analyticsOutbox")).toEqual(before);
    });

    waitsOn(["S3", "S8", "S15"], "the member signs in on the workspace decision with their own exposure off, then reads closed, while a visitor without a session is asked to sign in", async () => {
      const member = await aWorkspaceInsideAndBobOutside();

      const asBob = await signedIn(bob);

      expect(await websiteExposures()).toEqual([{ member, value: false }]);
      expect(await myProfile(asBob)).toEqual({ kind: "closed" });
      expect(await myProfile()).toEqual({ kind: "signed-out" });
    });

  });

  describe("F21: a previewer's command never records a workspace launch the flag's switch made due", () => {
    const everyFlagOn = ["website", "xp-levels", "everyone-board", "unlocks", "quests"].map(onForEveryone);

    waitsOn(["S3", "S6", "S8", "S15"], "unlocks switched on for the workspace after the preview: the previewer's open answers refused and records no unlocks launch", async () => {
      await aMemberWithEmail(alice);
      await flagsServed(...everythingForAlice);
      const asAlice = await signedIn(alice);
      await flagsServed(...everyFlagOn);

      expect(await openFeature(asAlice)).toEqual({ kind: "refused" });
      expect(await rowsOf("unlockLaunches")).toEqual([]);
    });

    waitsOn(["S3", "S6", "S8", "S15"], "unlocks and quests switched on for the workspace after an unlocks preview: the previewer's command starts no Journey preview, and nothing it schedules records a launch", async () => {
      const member = await aMemberWithEmail(alice);
      await flagsServed(...everythingForAlice.filter(({ key }) => key !== "quests"));
      const asAlice = await signedIn(alice);
      await flagsServed(onForEmails("website", alice.email), ...everyFlagOn.filter(({ key }) => key !== "website"));

      expect(await openFeature(asAlice)).toEqual({ kind: "refused" });
      await t.settle();

      expect(await previewMoments()).toEqual([{ member, moment: "unlocks" }]);
      expect(await rowsOf("unlockLaunches")).toEqual([]);
    });

    waitsOn(["S3", "S6", "S8", "S15"], "achievements switched on for the workspace after unlocks launched: the previewer's sign-in runs no Journey preview, and their open answers refused and records no Book launch", async () => {
      await aMemberWithEmail(alice);
      const workspaceFlags = everyFlagOn.filter(({ key }) => key !== "website" && key !== "quests");
      await flagsServed(websiteForAlice, onForEmails("quests", alice.email), ...workspaceFlags);
      await t.run((ctx) => unlocksLiveIn(ctx, allowedWorkspace));
      await flagsServed(websiteForAlice, onForEmails("quests", alice.email), ...workspaceFlags, onForEveryone("achievements"));

      const asAlice = await signedIn(alice);

      expect(await previewMoments()).toEqual([]);
      expect(await openFeature(asAlice)).toEqual({ kind: "refused" });
      await t.settle();
      expect(await rowsOf("bookLaunches")).toEqual([]);
    });
  });

  describe("F29: a session from before the preview", () => {
    waitsOn(["S6", "S8", "S10", "S15"], "the previewer's first command sends the website exposure and runs the preview moment, so their Open works", async () => {
      const member = await aMemberWithEmail(alice);
      await flagsServed(...everythingForAlice);
      await anAnalyticsIdFor(member);
      const { asSignedIn } = await aSession(alice);

      expect(await openFeature(asSignedIn)).toEqual({ kind: "opened" });
      expect(await websiteExposures()).toEqual([{ member, value: true }]);
      expect(await previewMoments()).toContainEqual({ member, moment: "unlocks" });
      expect(await rowsOf("unlockLaunches")).toEqual([]);
    });

    waitsOn(["S15"], "a member the preview doesn't name answers closed and writes nothing", async () => {
      const member = await aMemberWithEmail(bob);
      await aMemberWithEmail(alice);
      await flagsServed(...everythingForAlice);
      await anAnalyticsIdFor(member);
      const { asSignedIn } = await aSession(bob);
      const before = await rowsOf("flagExposures");

      expect(await openFeature(asSignedIn)).toEqual({ kind: "closed" });
      expect(await rowsOf("flagExposures")).toEqual(before);
      expect(await previewMoments()).toEqual([]);
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

    waitsOn(["S3", "S15", "S16", "S17"], "with the website on for the workspace, App Home links to the pages themselves", async () => {
      await aMemberWithEmail(bob);
      await flagsServed(onForEveryone("website"));

      expect(await t.query((ctx) => frontDoorLinksOf(ctx, { workspace: allowedWorkspace, user: bob.user }))).toEqual({ origin: siteUrl, pages: [], sections: [] });
    });
  });
});
