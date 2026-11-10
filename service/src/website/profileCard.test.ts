// The website's own profile card: today's convex/website/profileCard.test.ts. A read of the card runs `getProfileCard`
// for a `me` made from the seeded directory row, as S15's member check answers it. The reads whose subject is the member
// check or the route's arguments (closed, signed out, not a member, an argument naming another member) go through S15's
// route transport with the reader's identity, in S17's route pull request. Ann and
// Bea are seeded as today's `team_join` writes them, with the workspace key its analytics made, and each one's sign-in
// makes their analytics ID, as today's sign-in did.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEmails, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { slashCommandResponseUrl } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import type { LadderId, TierId } from "../achievements/ladders.ts";
import { achievementsLiveIn } from "../achievements/flag.ts";
import { earnLevelUpHoggies } from "../album/levelUpHoggies.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { LevelReachedEvent } from "../bus/events.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { getProfileCard } from "./profileCard.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";

const allowedWorkspace = "T1";
const now = new Date("2026-10-14T10:00:00Z");
const cardFlag = "profile-card";
const shippedFlags = ["website", "xp-levels", "unlocks", "achievements"];
const levelSevenXp = 1500;
const ann = { user: "U_ANN", name: "Ann Quill", email: "ann@example.com" };
const bea = { user: "U_BEA", name: "Bea Marsh", email: "bea@example.com" };
const medalEmoji: Record<TierId, string> = { bronze: "🥉", silver: "🥈", gold: "🥇", diamond: "💎" };

// The Book shipping before anyone joined runs the unlocks and achievements launches (S6). The card reaches its flag
// and body (S13), the directory's names (S3), progression, the Book's medals and its unlock (S6), the avatar (S10) and
// the groups (S11); opening the Book reaches the level-up hoggies (S10) and the member's own Slack card is S13's command.
const cardStacks: [Stack, ...Stack[]] = ["S3", "S6", "S10", "S11", "S13"];
const memberCheck: [Stack, ...Stack[]] = ["S6", "S15"];

type Card = { kind: "card"; name: string; level: number | null; group: string | null; medals: { ladder: LadderId; tier: TierId; name: string }[] };

const backend = useTestBackend({ now: now.getTime(), workspace: allowedWorkspace });

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
});

afterEach(() => void vi.unstubAllEnvs());

function cardOf(t: TestBackend, me: VerifiedMember) {
  return t.query((ctx) => getProfileCard(ctx, me));
}

describe("website reads pass one guard", () => {
  waitsOn(memberCheck, "getProfileCard reads closed while the website flag is off, even with profile-card on", async () => {
    const t = await workspace({ flags: [offForEveryone("website"), ...["xp-levels", "unlocks", "achievements", cardFlag].map(onForEveryone)] });
    const asAnn = await signedInThroughSso(t, ann);

    expect(await asAnn.read("website.profileCard.getProfileCard", {})).toEqual({ kind: "closed" });
  }, 30_000);

  waitsOn(memberCheck, "getProfileCard reads signed out without a session", async () => {
    const t = await workspace();

    expect(await websiteAs(t, null).read("website.profileCard.getProfileCard", {})).toEqual({ kind: "signed-out" });
  }, 30_000);

  waitsOn(memberCheck, "getProfileCard reads not-a-member for a former member with a live session", async () => {
    const t = await workspace();
    await aMember(t, "U_GONE", "not-a-member");
    const asGone = await signedInThroughSso(t, { user: "U_GONE" });

    expect(await asGone.read("website.profileCard.getProfileCard", {})).toEqual({ kind: "not-a-member" });
  }, 30_000);

  waitsOn(["S6"], "getProfileCard rejects an argument that names another member", async () => {
    const t = await workspace();
    await signedIn(t, ann);
    const asAnn = await signedInThroughSso(t, ann);
    const withAnotherMember = { user: bea.user };

    await expect(asAnn.read("website.profileCard.getProfileCard", withAnotherMember)).rejects.toThrow(argumentsRefused);
  }, 30_000);
});

describe("PC15: the website reads the member's own profile card", () => {
  waitsOn(cardStacks, "the card holds exactly the name, level and best four medals the member's own Slack card shows", async () => {
    const t = await workspace();
    const asAnn = await signedIn(t, ann);
    await withXp(t, ann, levelSevenXp);
    await earned(t, ann, "dependability", "bronze", "silver", "gold");
    await earned(t, ann, "applause", "bronze");
    await earned(t, ann, "connections", "bronze", "silver");
    await earned(t, ann, "generosity", "bronze", "silver", "gold");
    await earned(t, ann, "recognition", "bronze", "silver", "gold", "diamond");
    await bookOpenedBy(t, ann);

    const websiteCard = await cardOf(t, asAnn);

    expect(websiteCard).toStrictEqual({
      kind: "card",
      name: "Ann Quill",
      level: 7,
      medals: [
        { ladder: "recognition", tier: "diamond", name: "Hall of Fame" },
        { ladder: "generosity", tier: "gold", name: "Heart of the Team" },
        { ladder: "dependability", tier: "gold", name: "Pillar" },
        { ladder: "connections", tier: "silver", name: "Connector" },
      ],
      group: null,
    });
    expect(await ownSlackCard(t, ann)).toBe(asSlackShows(ann, websiteCard as Card));
  }, 30_000);

  waitsOn(cardStacks, "a member who hasn't opened the Book reads no medals, as their own Slack card shows none", async () => {
    const t = await workspace();
    const asAnn = await signedIn(t, ann);
    await earned(t, ann, "generosity", "bronze", "silver");

    const websiteCard = await cardOf(t, asAnn);

    expect(websiteCard).toStrictEqual({ kind: "card", name: "Ann Quill", level: 1, medals: [], group: null });
    expect(await ownSlackCard(t, ann)).toBe(asSlackShows(ann, websiteCard as Card));
  }, 30_000);

  waitsOn(cardStacks, "with xp-levels off in the workspace, the card has no level", async () => {
    const t = await workspace({ flags: ["website", cardFlag].map(onForEveryone), book: false });
    const asAnn = await signedIn(t, ann);

    expect(await cardOf(t, asAnn)).toStrictEqual({ kind: "card", name: "Ann Quill", level: null, medals: [], group: null });
  }, 30_000);

  waitsOn(cardStacks, "a member the directory has no display name for reads as a teammate", async () => {
    const t = await workspace();
    const member = await aMember(t, "U_NAMELESS");
    await aSession(t, { user: "U_NAMELESS" });

    expect(await cardOf(t, { member, workspace: allowedWorkspace, user: "U_NAMELESS" })).toStrictEqual({ kind: "card", name: "A teammate", level: 1, medals: [], group: null });
  }, 30_000);
});

describe("PC15 PC17: getProfileCard follows the member's own profile-card decision", () => {
  waitsOn(cardStacks, "with profile-card off for everyone, the card reads not-found", async () => {
    const t = await workspace({ flags: [...shippedFlags.map(onForEveryone), offForEveryone(cardFlag)] });
    const asAnn = await signedIn(t, ann);
    await earned(t, ann, "generosity", "bronze");
    await bookOpenedBy(t, ann);

    expect(await cardOf(t, asAnn)).toEqual({ kind: "not-found" });
  }, 30_000);

  waitsOn(cardStacks, "with profile-card on for one email, only that member reads their card", async () => {
    const t = await workspace({ flags: [...shippedFlags.map(onForEveryone), onForEmails(cardFlag, ann.email)] });
    const asAnn = await signedIn(t, ann);
    const asBea = await signedIn(t, bea);

    expect(await cardOf(t, asAnn)).toMatchObject({ kind: "card", name: "Ann Quill" });
    expect(await cardOf(t, asBea)).toEqual({ kind: "not-found" });
  }, 30_000);
});

describe("WS344 GB32: the card names the member's primary group while groups applies", () => {
  waitsOn(cardStacks, "a member whose primary group is Ants reads Ants on their card", async () => {
    const t = await workspace({ flags: [...shippedFlags, cardFlag, "groups"].map(onForEveryone) });
    await primaryGroupOf(t, "Ants", ann, bea);
    const asAnn = await signedIn(t, ann);

    expect(await cardOf(t, asAnn)).toMatchObject({ kind: "card", name: "Ann Quill", group: "Ants" });
  }, 30_000);

  waitsOn(cardStacks, "a member with no primary group reads no group", async () => {
    const t = await workspace({ flags: [...shippedFlags, cardFlag, "groups"].map(onForEveryone) });
    await primaryGroupOf(t, "Ants", bea);
    const asAnn = await signedIn(t, ann);

    expect(await cardOf(t, asAnn)).toMatchObject({ kind: "card", group: null });
  }, 30_000);

  waitsOn(cardStacks, "with groups off for the member, the card has no group", async () => {
    const t = await workspace({ flags: [...shippedFlags.map(onForEveryone), onForEveryone(cardFlag), onForEmails("groups", bea.email)] });
    await primaryGroupOf(t, "Ants", ann, bea);
    const asAnn = await signedIn(t, ann);
    const asBea = await signedIn(t, bea);

    expect(await cardOf(t, asAnn)).toMatchObject({ kind: "card", group: null });
    expect(await cardOf(t, asBea)).toMatchObject({ kind: "card", group: "Ants" });
  }, 30_000);
});

async function primaryGroupOf(t: TestBackend, name: string, ...people: { user: string }[]) {
  const members = await Promise.all(people.map((person) => memberOf(t, person)));
  const group = await t.seed.insert("userGroups", { workspace: allowedWorkspace, group: `S_${name}`, handle: name.toLowerCase(), name, enabled: true, automatic: false, members: members.length, asOf: 0, membersAsOf: 0 });
  for (const member of members) await t.seed.insert("memberGroups", { workspace: allowedWorkspace, member, groups: [group], primary: group });
}

type WorkspaceSetup = { flags?: FlagDefinition[]; book?: boolean };

async function workspace({ flags = [...shippedFlags, cardFlag].map(onForEveryone), book = true }: WorkspaceSetup = {}) {
  const t = backend();
  t.slack.withMember(ann.user, slackProfileOf(ann)).withMember(bea.user, slackProfileOf(bea));
  await definitionsStored(t.operations, ...flags);
  if (book) await bookShippedBeforeAnyoneJoined(t);
  for (const person of [ann, bea]) await joined(t, person);
  await t.settle();
  return t;
}

// What today's `bookShippedBeforeAnyoneJoined` did: the unlocks and achievements launches, then what they scheduled.
async function bookShippedBeforeAnyoneJoined(t: TestBackend) {
  await t.run((ctx) => unlocksLiveIn(ctx, allowedWorkspace));
  await t.run((ctx) => achievementsLiveIn(ctx, allowedWorkspace));
  await t.settle();
}

/** A teammate's `team_join` as the directory records it: their display name and email, and the workspace's key. */
async function joined(t: TestBackend, { user, name, email }: { user: string; name: string; email: string }) {
  await t.seed.insert("members", { workspace: allowedWorkspace, user, kind: "member", asOf: 0, name, displayName: name, email });
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

function slackProfileOf({ name, email }: { name: string; email: string }) {
  return { profile: { display_name: name, email } };
}

function aMember(t: TestBackend, user: string, kind: "member" | "not-a-member" = "member") {
  return t.seed.insert("members", { workspace: allowedWorkspace, user, kind, asOf: 0 }) as Promise<MemberId>;
}

/** A sign-in: the users row for the Slack pair, as today's `aSession`. */
async function aSession(t: TestBackend, { user, ...claims }: { user: string; name?: string }) {
  await t.seed.insert("users", { ...claims, chatIdentity: { workspace: allowedWorkspace, user } });
}

/** A member's sign-in, as today's `aSignedInSession`: their users row and analytics ID, and the check's answer for them. */
async function signedIn(t: TestBackend, { user, name }: { user: string; name: string }): Promise<VerifiedMember> {
  const member = await memberOf(t, { user });
  await aSession(t, { user, name });
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: allowedWorkspace, user, name };
}

async function memberOf(t: TestBackend, { user }: { user: string }): Promise<MemberId> {
  const row = (await t.seed.all("members")).find((member) => member.workspace === allowedWorkspace && member.user === user);
  return row!._id as MemberId;
}

async function withXp(t: TestBackend, person: { user: string }, xp: number) {
  const member = await memberOf(t, person);
  await t.seed.insert("memberProgress", { member, xp, pointsSpent: 0 });
}

async function earned(t: TestBackend, person: { user: string }, ladder: LadderId, ...tiers: TierId[]) {
  const member = await memberOf(t, person);
  for (const tier of tiers) {
    const award = await t.seed.insert("awards", { workspace: allowedWorkspace, conversation: "C0", message: `${ladder}-${tier}`, giver: member, recipient: member, kudos: 1, day: "2026-10-13", at: t.clock.now() });
    await t.seed.insert("earnedTiers", { member, ladder, tier, earnedAt: t.clock.now(), award, catalogueVersion: "1", rewards: [] });
  }
}

async function bookOpenedBy(t: TestBackend, person: { user: string }) {
  const member = await memberOf(t, person);
  await reachesLevel(t, member, 4);
  expect(await t.run((ctx) => openUnlock(ctx, member, "book", "slack"))).toBe("done");
}

async function reachesLevel(t: TestBackend, member: MemberId, level: number) {
  const message = { workspace: allowedWorkspace, conversation: "C1", message: `level-${level}-${member}` };
  const event: LevelReachedEvent = { type: "levelReached", workspace: allowedWorkspace, member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at: t.clock.now() };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

async function ownSlackCard(t: TestBackend, { user }: { user: string }) {
  const body = new URLSearchParams({
    team_id: allowedWorkspace,
    channel_id: "C1",
    channel_name: "general",
    user_id: user,
    command: "/hedgehug",
    text: `<@${user}>`,
    response_url: slashCommandResponseUrl,
    trigger_id: "1.2.3",
  }).toString();
  const response = await t.send("/commands", body, { contentType: "application/x-www-form-urlencoded" });
  const reply = (await response.json()) as { text: string };
  await t.settle();
  return reply.text;
}

function asSlackShows({ user }: { user: string }, { level, medals }: Card) {
  const levelLine = level === null ? [] : [`Level ${level}`];
  const medalLine = medals.length === 0 ? [] : [medals.map(({ tier, name }) => `${medalEmoji[tier]} ${name}`).join(" · ")];
  return [`*<@${user}>*`, ...levelLine, ...medalLine].join("\n");
}
