// The signed-in member's home page: today's convex/website/profile.test.ts. Each read runs `getMyProfile` for a `me`
// made from the seeded directory row and the sign-in's claims, as S15's member check answers it. The reads whose subject
// is the member check itself (closed, signed out, verifying, unverified, not a member) go through S15's route transport
// with the reader's identity, in S17's route pull request. Today's `prepareWebsiteFlag` made the workspace's key;
// `workspaceKeyOf` stands in for it.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone, onInTheSandboxOnly } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import { homeFacts } from "../engine/home.ts";
import { observe } from "../engine/engine.ts";
import { groupsShownTo } from "../groups/groups.ts";
import { progressionHomeOf } from "../progression/progression.ts";
import { memberChanged } from "../slack/hugsTesting.ts";
import type { MemberId } from "../workspace/directory.ts";
import { tick } from "./clock.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { getMyProfile, type MyProfile } from "./profile.ts";
import { signedInThroughSso, websiteAs } from "./routesTesting.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-13T10:00:00Z");
const juno = { user: "U_JUNO", name: "Juno Whitlock", image: "https://avatars.slack-edge.com/juno.png" };
const bookSpread = "book-spread";
const album = "album";

// What getMyProfile reaches past the member check: the clock and member check (S15), homeFacts (S4), the unlock path,
// inventory and book spread (S16), progression (S6), the wallet (S7), the album flag (S9), the avatar (S10), groups
// (S11), and the settings and skill tree reads (S17's later slices).
const profileStacks: [Stack, ...Stack[]] = ["S4", "S6", "S7", "S9", "S10", "S11", "S15", "S16"];
const memberCheck: [Stack, ...Stack[]] = ["S15"];

const backend = useTestBackend({ now: now.getTime(), workspace: allowedWorkspace });

let t: TestBackend;

beforeEach(() => {
  // A deployment for the allowed workspace whose flags PostHog decides, as today's `aDeploymentForWorkspace`.
  vi.stubEnv("SLACK_WORKSPACE_ID", allowedWorkspace);
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

function myProfile(me: VerifiedMember) {
  return t.query((ctx) => getMyProfile(ctx, me));
}

function aMember(user: string, kind: "member" | "not-a-member" = "member", timeZone?: string) {
  return t.seed.insert("members", { workspace: allowedWorkspace, user, kind, asOf: 0, ...(timeZone && { timeZone }) }) as Promise<MemberId>;
}

/** The member check's answer for a member who signed in with these claims. */
function meOf(member: MemberId, { user, ...claims }: { user: string; name?: string; image?: string }): VerifiedMember {
  return { member, workspace: allowedWorkspace, user, ...claims };
}

// What today's `switchWebsite` did: the definitions PostHog serves, and `prepareWebsiteFlag`'s workspace key.
async function switchWebsite(open: boolean, ...alsoOn: string[]) {
  await serving(open ? onForEveryone("website") : offForEveryone("website"), ...alsoOn.map(onForEveryone));
}

async function serving(...definitions: FlagDefinition[]) {
  await definitionsStored(t.operations, ...definitions);
  await prepareWebsiteFlag();
}

/** Today's `aSession`: the person signs in through SSO with their Slack name and picture; there is no app session. */
async function aSession({ user, ...claims }: { user: string; name?: string; image?: string }) {
  await t.seed.insert("users", { ...claims, chatIdentity: { workspace: allowedWorkspace, user } });
  return signedInThroughSso(t, { user });
}

/** Today's `myProfile(asSignedIn)`: getMyProfile through the whole app, as the signed-in person or a visitor. */
function myProfileAs(as: ReturnType<typeof websiteAs> = websiteAs(t, null)) {
  return as.read<MyProfile>("website.profile.getMyProfile", {});
}

async function prepareWebsiteFlag() {
  const workspace = process.env.SLACK_WORKSPACE_ID;
  if (workspace) await t.run((ctx) => workspaceKeyOf(ctx, workspace));
}

describe("website reads pass one guard", () => {
  describe("WS2 WS3 WS4: the website flag closes every read", () => {
    waitsOn(memberCheck, "a member with a live session reads closed while the flag is off", async () => {
      await aMember(juno.user);
      const asSignedIn = await aSession(juno);
      await switchWebsite(false);

      expect(await myProfileAs(asSignedIn)).toEqual({ kind: "closed" });
    });

    waitsOn(memberCheck, "a visitor with no session reads closed, not signed out, while the flag is off", async () => {
      await switchWebsite(false);

      expect(await myProfileAs()).toEqual({ kind: "closed" });
    });

    waitsOn(memberCheck, "a flag nobody created in PostHog answers off", async () => {
      await aMember(juno.user);
      const asSignedIn = await aSession(juno);
      await definitionsStored(t.operations);
      await prepareWebsiteFlag();

      expect(await myProfileAs(asSignedIn)).toEqual({ kind: "closed" });
    });

    waitsOn(memberCheck, "the flag on for the workspace still reads closed until prepareWebsiteFlag made its workspace key", async () => {
      await aMember(juno.user);
      const asSignedIn = await aSession(juno);
      await definitionsStored(t.operations, { key: "website", filters: { groups: [{ properties: [], rollout_percentage: 100 }] } });

      expect(await myProfileAs(asSignedIn)).toEqual({ kind: "closed" });
    });

    waitsOn(memberCheck, "an unset SLACK_WORKSPACE_ID reads closed, whatever the flag says", async () => {
      await aMember(juno.user);
      const asSignedIn = await aSession(juno);
      await switchWebsite(true);
      vi.stubEnv("SLACK_WORKSPACE_ID", "");

      expect(await myProfileAs(asSignedIn)).toEqual({ kind: "closed" });
    });

    waitsOn(profileStacks, "switching the flag off closes a session that was reading the member's profile", async () => {
      await aMember(juno.user);
      const asSignedIn = await aSession(juno);
      await switchWebsite(true);
      expect((await myProfileAs(asSignedIn)).kind).toBe("member");

      await switchWebsite(false);

      expect(await myProfileAs(asSignedIn)).toEqual({ kind: "closed" });
    });
  });

  describe("WS9 WS11 WS14: every read checks the live session, the workspace and the directory, in that order", () => {
    beforeEach(() => switchWebsite(true));

    waitsOn(memberCheck, "a visitor with no session is signed out, never an empty profile", async () => {
      expect(await myProfileAs()).toEqual({ kind: "signed-out" });
    });

    waitsOn(memberCheck, "a signed-in person the directory doesn't know yet is being verified", async () => {
      const asSignedIn = await aSession(juno);
      await t.seed.insert("memberVerifications", { workspace: allowedWorkspace, user: juno.user, attempts: 1, state: "pending" });

      expect(await myProfileAs(asSignedIn)).toEqual({ kind: "verifying" });
    });

    waitsOn(memberCheck, "a signed-in person whose verification failed reads unverified, never a member", async () => {
      const asSignedIn = await aSession(juno);
      await t.seed.insert("memberVerifications", { workspace: allowedWorkspace, user: juno.user, attempts: 3, state: "failed" });

      expect(await myProfileAs(asSignedIn)).toEqual({ kind: "unverified" });
    });

    waitsOn(["S3", ...profileStacks], "a member user_change deactivates reads not-a-member on their next read, whatever their session", async () => {
      await aMember(juno.user);
      const asSignedIn = await aSession(juno);
      expect((await myProfileAs(asSignedIn)).kind).toBe("member");

      await memberChanged(t, "user_change", { id: juno.user, team_id: allowedWorkspace, deleted: true });

      expect(await myProfileAs(asSignedIn)).toEqual({ kind: "not-a-member" });
    });

    waitsOn(profileStacks, "a member reads their own name and Slack picture from the sign-in", async () => {
      await aMember(juno.user);
      await aMember("U_BOB");
      await aSession({ user: "U_BOB", name: "Bob" });
      const asSignedIn = await aSession(juno);

      expect(await myProfileAs(asSignedIn)).toMatchObject({ kind: "member", name: "Juno Whitlock", face: { kind: "slack", image: juno.image } });
    });
  });
});

describe("a member's name and face come from the sign-in", () => {
  beforeEach(() => switchWebsite(true));

  waitsOn(profileStacks, "a member's Slack picture carries their initials for when it fails to load", async () => {
    const member = await aMember(juno.user);

    expect(await myProfile(meOf(member, juno))).toMatchObject({ face: { kind: "slack", image: juno.image, initials: "JW" } });
  });

  waitsOn(profileStacks, "a member without a Slack picture reads their initials", async () => {
    const member = await aMember(juno.user);

    expect(await myProfile(meOf(member, { user: juno.user, name: "Juno Whitlock" }))).toMatchObject({ kind: "member", name: "Juno Whitlock", face: { kind: "initials", initials: "JW" } });
  });
});

describe("WS13 WS15 WS18: a member's home answer projects their own homeFacts", () => {
  beforeEach(() => switchWebsite(true));

  waitsOn(profileStacks, "a member reads their own kudos left, refill, this week and in total, with where to thank someone in Slack", async () => {
    const member = await aMember(juno.user);
    await aMember("U_BOB");
    await aMember("U_CAROL");
    await give("U_BOB", juno.user, 1, new Date("2026-10-06T10:00:00Z"));
    await give(juno.user, "U_BOB", 2);
    await give("U_CAROL", "U_BOB", 3);

    expect(await myProfile(meOf(member, juno))).toEqual({
      kind: "member",
      name: "Juno Whitlock",
      face: { kind: "slack", image: juno.image, initials: "JW" },
      kudosEmoji: "taco",
      allowance: { left: 1, base: 3, refillsAt: Date.parse("2026-10-14T00:00:00Z") },
      thisWeek: { given: 2, received: 0 },
      lifetime: { given: 2, received: 1 },
      chatUrl: "https://app.slack.com/client/T1",
      leaderboard: { kind: "off" },
      features: null,
      progression: null,
      skillPoints: null,
      coins: null,
      inventory: null,
      groups: false,
      settings: false,
    });
  });

  waitsOn(profileStacks, "the answer is the member's homeFacts, never another member's", async () => {
    const member = await aMember(juno.user);
    await aMember("U_BOB");
    await give("U_BOB", juno.user, 3);
    const facts = await t.query((ctx) => homeFacts(ctx, allowedWorkspace, juno.user));

    const profile = await myProfile(meOf(member, juno));

    expect([facts?.kind, profile.kind]).toEqual(["member", "member"]);
    if (facts?.kind !== "member" || profile.kind !== "member") return;
    expect(profile.allowance).toEqual({ left: facts.left, base: facts.base, refillsAt: facts.refillsAt });
    expect(profile.thisWeek).toEqual({ given: facts.givenWeek, received: facts.receivedWeek });
    expect(profile.lifetime).toEqual({ given: facts.given, received: facts.received });
    expect(profile).toMatchObject({ allowance: { left: 3 }, thisWeek: { given: 0, received: 3 } });
  });

  waitsOn(profileStacks, "the answer updates after a kudos lands", async () => {
    const me = meOf(await aMember(juno.user), juno);
    await aMember("U_BOB");
    expect(await myProfile(me)).toMatchObject({ allowance: { left: 3 }, thisWeek: { given: 0 } });

    await give(juno.user, "U_BOB", 1);

    expect(await myProfile(me)).toMatchObject({ allowance: { left: 2 }, thisWeek: { given: 1 }, lifetime: { given: 1 } });
  });

  waitsOn(profileStacks, "after the member's midnight and a clock tick, the answer is the new day's, without another kudos", async () => {
    const me = meOf(await aMember(juno.user, "member", "Europe/Berlin"), juno);
    await aMember("U_BOB");
    await give(juno.user, "U_BOB", 3);
    expect(await myProfile(me)).toMatchObject({ allowance: { left: 0, refillsAt: Date.parse("2026-10-13T22:00:00Z") } });

    await advanceTo(new Date("2026-10-13T22:05:00Z"));
    await t.run((ctx) => tick(ctx, {}));

    expect(await myProfile(me)).toMatchObject({ allowance: { left: 3, refillsAt: Date.parse("2026-10-14T22:00:00Z") } });
  });

  waitsOn(profileStacks, "after the week turns and a clock tick, the answer starts the new week, keeping the totals", async () => {
    const me = meOf(await aMember(juno.user), juno);
    await aMember("U_BOB");
    await give(juno.user, "U_BOB", 2);

    await advanceTo(new Date("2026-10-19T00:05:00Z"));
    await t.run((ctx) => tick(ctx, {}));

    expect(await myProfile(me)).toMatchObject({ thisWeek: { given: 0, received: 0 }, lifetime: { given: 2, received: 0 } });
  });
});

describe("level and XP are invisible while xp-levels is off", () => {
  waitsOn(profileStacks, "WS47: while xp-levels is off, a member with XP reads no progression", async () => {
    await switchWebsite(true);
    const { me } = await aMemberWithXp(1600);

    expect(await myProfile(me)).toMatchObject({ kind: "member", progression: null });
  });

  for (const [title, xp, progression] of [
    ["at level 1 with no XP yet", 0, { level: 1, xp: 0, levelStartsAt: 0, nextLevelAt: 20, xpToNextLevel: 20 }],
    ["exactly on a level's threshold", 100, { level: 3, xp: 100, levelStartsAt: 100, nextLevelAt: 300, xpToNextLevel: 200 }],
    ["past level 5, still without skill points", 1600, { level: 7, xp: 1600, levelStartsAt: 1500, nextLevelAt: 2100, xpToNextLevel: 500 }],
  ] as const) {
    waitsOn(profileStacks, `WS47 WS51: while xp-levels is on, a member ${title} reads their level and the XP to the next one`, async () => {
      await switchWebsite(true, "xp-levels");
      const { me } = await aMemberWithXp(xp);

      const profile = await myProfile(me);

      expect(profile).toMatchObject({ kind: "member" });
      expect(profile.kind === "member" && profile.progression).toEqual(progression);
    });
  }

  waitsOn(profileStacks, "WS47: the progression is progression's own read of the member, never another member's", async () => {
    await switchWebsite(true, "xp-levels");
    const bob = await aMember("U_BOB");
    await t.seed.insert("memberProgress", { member: bob, xp: 600, pointsSpent: 0 });
    const { me, member } = await aMemberWithXp(300);
    const home = await t.query((ctx) => progressionHomeOf(ctx, member));

    expect(await myProfile(me)).toMatchObject({ progression: { level: home.level, xp: home.xp, xpToNextLevel: home.xpToNextLevel } });
  });

  waitsOn(profileStacks, "WS47: switching xp-levels off hides the progression of a session that was reading it", async () => {
    await switchWebsite(true, "xp-levels");
    const { me } = await aMemberWithXp(300);
    expect(await myProfile(me)).toMatchObject({ progression: { level: 4 } });

    await switchWebsite(true);

    expect(await myProfile(me)).toMatchObject({ kind: "member", progression: null });
  });
});

describe("groups are named only while groupsShownTo answers", () => {
  for (const { case: title, alsoOn, aGroupCounts, groups } of [
    { case: "groups is off", alsoOn: [], aGroupCounts: true, groups: false },
    { case: "groups is on but no group counts in the workspace", alsoOn: ["groups"], aGroupCounts: false, groups: false },
    { case: "groups is on and a group counts in the workspace", alsoOn: ["groups"], aGroupCounts: true, groups: true },
  ]) {
    waitsOn(profileStacks, `#417: while ${title}, getMyProfile says groups is ${groups}, as groupsShownTo does`, async () => {
      await switchWebsite(true, ...alsoOn);
      const member = await aMember(juno.user);
      if (aGroupCounts) await aCountingGroupWith(member);

      expect(await myProfile(meOf(member, juno))).toMatchObject({ kind: "member", groups });
      expect(await t.query((ctx) => groupsShownTo(ctx, member))).toBe(groups);
    });
  }

  waitsOn(profileStacks, "#417: switching groups off hides the groups fact of a session that was reading it", async () => {
    await switchWebsite(true, "groups");
    const member = await aMember(juno.user);
    await aCountingGroupWith(member);
    const me = meOf(member, juno);
    expect(await myProfile(me)).toMatchObject({ groups: true });

    await switchWebsite(true);

    expect(await myProfile(me)).toMatchObject({ kind: "member", groups: false });
  });
});

describe("getMyProfile says bookSpread only while book-spread is on", () => {
  const productOwner = "product-owner@example.com";

  for (const { case: title, bookSpread: definitions, email, environment } of [
    { case: "book-spread is off", bookSpread: [offForEveryone(bookSpread)] },
    { case: "PostHog has no book-spread flag", bookSpread: [] },
    { case: "the ship's condition reads another member's email in production", bookSpread: [asTheShipCreatesIt(productOwner)], email: "juno@example.com", environment: "production" },
  ] as { case: string; bookSpread: FlagDefinition[]; email?: string; environment?: string }[]) {
    waitsOn(profileStacks, `#587: while ${title}, getMyProfile carries no bookSpread and otherwise equals the answer with it on`, async () => {
      const me = await aMemberServed(email, onForEveryone(bookSpread));
      const on = await myProfile(me);

      await serving(onForEveryone("website"), ...definitions);
      if (environment !== undefined) vi.stubEnv("KUDOS_ENVIRONMENT", environment);
      const off = await myProfile(me);

      expect(on).toMatchObject({ kind: "member", bookSpread: true });
      expect(off).not.toHaveProperty("bookSpread");
      expect(off).toEqual(withoutBookSpread(on));
    });
  }

  for (const { case: title, definition, email, environment } of [
    { case: "on for everyone", definition: onForEveryone(bookSpread) },
    { case: "the ship's condition, in the sandbox", definition: asTheShipCreatesIt(productOwner) },
    { case: "the ship's condition, for the product owner's email in production", definition: asTheShipCreatesIt(productOwner), email: productOwner, environment: "production" },
  ] as { case: string; definition: FlagDefinition; email?: string; environment?: string }[]) {
    waitsOn(profileStacks, `#587: while book-spread is ${title}, getMyProfile carries bookSpread true and no exposure is sent`, async () => {
      const me = await aMemberServed(email, definition);
      if (environment !== undefined) vi.stubEnv("KUDOS_ENVIRONMENT", environment);

      expect(await myProfile(me)).toMatchObject({ kind: "member", bookSpread: true });
      expect(await exposuresTo(bookSpread)).toEqual([]);
    });
  }

  waitsOn(memberCheck, "#587: without the flags key the website reads closed, with no bookSpread, even while PostHog turned book-spread on", async () => {
    await aMemberServed(undefined, onForEveryone(bookSpread));
    const asSignedIn = await signedInThroughSso(t, juno);
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");

    expect(await myProfileAs(asSignedIn)).toEqual({ kind: "closed" });
  });
});

describe("AL39: getMyProfile says album only while album is on", () => {
  for (const { case: title, definitions, environment } of [
    { case: "album is off", definitions: [offForEveryone(album)] },
    { case: "PostHog has no album flag", definitions: [] },
    { case: "album is on only in the sandbox and this is production", definitions: [onInTheSandboxOnly(album)], environment: "production" },
  ] as { case: string; definitions: FlagDefinition[]; environment?: string }[]) {
    waitsOn(profileStacks, `while ${title}, getMyProfile carries no album and otherwise equals the answer with it on`, async () => {
      const me = await aMemberServed(undefined, onForEveryone(album));
      const on = await myProfile(me);

      await serving(onForEveryone("website"), ...definitions);
      if (environment !== undefined) vi.stubEnv("KUDOS_ENVIRONMENT", environment);
      const off = await myProfile(me);

      expect(on).toMatchObject({ kind: "member", album: true });
      expect(off).not.toHaveProperty("album");
      expect(off).toEqual(withoutAlbum(on));
    });
  }

  waitsOn(profileStacks, "while album is on in the sandbox, getMyProfile carries album true and sends no exposure", async () => {
    const me = await aMemberServed(undefined, onInTheSandboxOnly(album));

    expect(await myProfile(me)).toMatchObject({ kind: "member", album: true });
    expect(await exposuresTo(album)).toEqual([]);
  });

  waitsOn(memberCheck, "without the flags key the website reads closed, with no album, even while PostHog turned album on", async () => {
    await aMemberServed(undefined, onForEveryone(album));
    const asSignedIn = await signedInThroughSso(t, juno);
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");

    expect(await myProfileAs(asSignedIn)).toEqual({ kind: "closed" });
  });
});

async function advanceTo(at: Date) {
  await t.time.advance(at.getTime() - t.clock.now());
}

async function exposuresTo(flag: string) {
  return (await t.seed.all("flagExposures")).filter((exposure) => exposure.flag === flag);
}

function withoutAlbum(profile: MyProfile) {
  if (profile.kind !== "member") return profile;
  const { album: _, ...rest } = profile;
  return rest;
}

function withoutBookSpread(profile: MyProfile) {
  if (profile.kind !== "member") return profile;
  const { bookSpread: _, ...rest } = profile;
  return rest;
}

/** A member who signed in while PostHog served `definitions`, as today's `aSignedInSession`: their analytics ID is made. */
async function aMemberServed(email: string | undefined, ...definitions: FlagDefinition[]) {
  await serving(onForEveryone("website"), ...definitions);
  const member = await aMember(juno.user);
  if (email !== undefined) await t.seed.patch("members", member, { email });
  await t.seed.insert("users", { name: juno.name, image: juno.image, chatIdentity: { workspace: allowedWorkspace, user: juno.user } });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return meOf(member, juno);
}

function asTheShipCreatesIt(productOwner: string): FlagDefinition {
  return {
    key: bookSpread,
    filters: {
      groups: [
        { properties: [{ key: "environment", type: "person", value: ["sandbox"], operator: "exact" }], rollout_percentage: 100 },
        { properties: [{ key: "email", type: "person", value: [productOwner], operator: "exact" }], rollout_percentage: 100 },
      ],
    },
  };
}

async function aCountingGroupWith(member: MemberId) {
  const group = await t.seed.insert("userGroups", { workspace: allowedWorkspace, group: "S_ANTS", handle: "ants", name: "Ants", enabled: true, automatic: false, members: 3, asOf: 0, membersAsOf: 0 });
  await t.seed.insert("memberGroups", { workspace: allowedWorkspace, member, groups: [group], primary: group });
}

async function aMemberWithXp(xp: number) {
  const member = await aMember(juno.user);
  if (xp > 0) await t.seed.insert("memberProgress", { member, xp, pointsSpent: 0 });
  return { me: meOf(member, juno), member };
}

async function give(giver: string, recipient: string, kudos: number, at = new Date(t.clock.now())) {
  await t.run((ctx) =>
    observe(ctx, {
      kind: "posted",
      ref: { workspace: allowedWorkspace, conversation: "C1", message: `${giver}-${recipient}-${at.getTime()}` },
      author: giver,
      revision: BigInt(at.getTime()) * 1000n,
      at: at.getTime(),
      content: { mentions: [{ kind: "person", user: recipient }], emoji: Array<string>(kudos).fill("taco"), text: "thanks for the review" },
      words: { segments: [{ kind: "text", text: "thanks for the review" }], visibility: "public" },
    }),
  );
}
