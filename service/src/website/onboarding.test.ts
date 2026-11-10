// A newcomer's onboarding on the website: the how-it-works card until they give a kudos or close it, and the getting
// started steps off the Monday path. Today's convex/website/onboarding.test.ts, on the service's test backend: each
// reader is a `me` made from the seeded directory row, as S15's member check answers it. getAlbum and turnItem are S16's
// website handlers, which the service doesn't have yet, so each album read ends in S16's stub for it; closeHowItWorks is
// this stack's handler and runs as itself.
import { getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken } from "../../testing/fakePostHog.ts";
import { definitionsStored, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { emoji, mention, messageEvent, reactionEvent, section, text } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import type { TableName } from "../db/schema/index.ts";
import { dataModelTables } from "../load/loader.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { xpToReach } from "../progression/levels.ts";
import { serviceRegistry } from "../registry.ts";
import type { HomeMember } from "../feedback/homes.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { AlbumAnswer, AlbumRead, TurnAnswer } from "./album.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { closeHowItWorks } from "./onboarding.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const allowedWorkspace = "T1";
const saysWhy = "Thanks for untangling the flaky migration before the release";
const albumOpen = ["album", "collection", "packs", "hugs"];
const onboardingOn = [...albumOpen, "hidden-items", "onboarding"];
const juno = { user: "U_JUNO", name: "Juno Whitlock" };
const bob = { user: "U_BOB", name: "Bob Okonkwo" };
const taco = { kudosEmoji: "taco", kudosEmojiImage: null };
const slack = `https://app.slack.com/client/${allowedWorkspace}`;

// getAlbum's read (S16's handler) and the onboarding facts it answers: awards (S4), the onboarding flag, the loop lesson
// and the turned items (S8), the album flag and the thoughtful boards (S9), and hugs (S13).
const albumRead: [Stack, ...Stack[]] = ["S4", "S8", "S9", "S13", "S16"];
// A kudos or a hug through Slack, whose events every domain's subscribers take: the parser and engine (S4), replies
// (S5), progression, achievements and unlocks (S6), quests and the wallet (S7), the album (S8, S9, S10), groups and
// boards (S11), activity (S12), hugs (S13) and analytics (S14).
const givingAndReading: [Stack, ...Stack[]] = ["S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S16"];
// closeHowItWorks: the album flag (S9), the onboarding flag (S8) and the usage fact (S14).
const closing: [Stack, ...Stack[]] = ["S8", "S9", "S14"];
const closingAndReading: [Stack, ...Stack[]] = ["S4", "S8", "S9", "S13", "S14", "S16"];

type Person = { user: string; name: string };

const backend = useTestBackend({ now: tuesday.getTime(), workspace: allowedWorkspace });

let t: TestBackend;
let messages = 0;

beforeEach(async () => {
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
  messages = 0;
  for (const person of [juno, bob]) t.slack.withMember(person.user, { real_name: person.name });
  await t.seed.insert("workspaces", { workspace: allowedWorkspace, kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(...onboardingOn);
  // The members rows each `team_join` wrote, as today's test joined both teammates.
  for (const person of [juno, bob]) await t.seed.insert("members", { workspace: allowedWorkspace, user: person.user, kind: "member", realName: person.name, asOf: tuesday.getTime() });
});

afterEach(() => void vi.unstubAllEnvs());

describe("LP67 LP68: getAlbum answers the how-it-works card to a member who never gave a kudos and never closed it", () => {
  waitsOn(
    albumRead,
    "a newcomer reads the card with their Slack workspace's address and the level-2 lines, beside the workspace's kudos emoji",
    async () => {
      const album = await albumOf(await signedIn(juno));

      expect(album.howItWorks, "the newcomer's card").toEqual({ slack, toLevelTwo: true, kudos: taco });
    },
    60_000,
  );

  waitsOn(
    givingAndReading,
    "a member who has given a kudos reads no card, while the teammate they thanked still does",
    async () => {
      await thanks(juno, saysWhy, bob);

      expect(await albumOf(await signedIn(juno)), "the giver's album").not.toHaveProperty("howItWorks");
      expect((await albumOf(await signedIn(bob))).howItWorks, "the recipient's card").toBeDefined();
    },
    60_000,
  );

  waitsOn(
    albumRead,
    "a never-giver already at level 2 reads the card without the level-2 lines",
    async () => {
      await reachesXp(juno, xpToReach(2));

      expect((await albumOf(await signedIn(juno))).howItWorks, "the card at level 2").toEqual({ slack, toLevelTwo: false, kudos: taco });
    },
    60_000,
  );

  for (const [off, flags] of [
    ["onboarding off", [...albumOpen, "hidden-items"]],
    ["hidden-items off", [...albumOpen, "onboarding"]],
  ] as const) {
    waitsOn(
      albumRead,
      `with ${off}, getAlbum answers no card`,
      async () => {
        await switchWebsite(...flags);

        expect(await albumOf(await signedIn(juno))).not.toHaveProperty("howItWorks");
      },
      60_000,
    );
  }
});

describe("LP69: closeHowItWorks stores the member's close once and records onboarding card closed", () => {
  waitsOn(
    closingAndReading,
    "a close stores it, takes the card away for good and records tried_slack once; a second close stores and records nothing",
    async () => {
      const asJuno = await signedIn(juno);

      expect(await close(asJuno, true)).toEqual({ kind: "closed" });
      await t.settle();
      const stored = await everyTable();
      expect(await close(asJuno, false), "the second close").toEqual({ kind: "closed" });
      await t.settle();

      expect(await albumOf(asJuno), "the album after the close").not.toHaveProperty("howItWorks");
      expect(await everyTable(), "what the second close stored").toEqual(stored);
      expect(closesRecorded(), "the usage facts PostHog took").toEqual([{ tried_slack: true }]);
    },
    60_000,
  );

  waitsOn(
    closing,
    "Got it and Esc record tried_slack false",
    async () => {
      await close(await signedIn(juno), false);
      await t.settle();

      expect(closesRecorded()).toEqual([{ tried_slack: false }]);
    },
    60_000,
  );

  waitsOn(
    closingAndReading,
    "a close outlives onboarding turning off and back on: the card never comes back",
    async () => {
      const asJuno = await signedIn(juno);
      await close(asJuno, false);
      await switchWebsite(...albumOpen, "hidden-items");
      await switchWebsite(...onboardingOn);

      expect(await albumOf(asJuno)).not.toHaveProperty("howItWorks");
    },
    60_000,
  );

  waitsOn(
    closing,
    "with onboarding off, a close is refused and stores and records nothing",
    async () => {
      await switchWebsite(...albumOpen, "hidden-items");
      const asJuno = await signedIn(juno);
      await t.settle();
      const before = await everyTable();

      expect(await close(asJuno, true)).toEqual({ kind: "refused" });
      await t.settle();

      expect(await everyTable()).toEqual(before);
      expect(closesRecorded()).toEqual([]);
    },
    60_000,
  );
});

describe("LP76: getAlbum answers the onboarding steps, each done from one read", () => {
  waitsOn(
    albumRead,
    "a newcomer has done none of the four steps",
    async () => {
      expect((await albumOf(await signedIn(juno))).gettingStarted).toEqual({ steps: { hugged: false, thoughtful: false, turned: false, levelTwo: false }, kudos: taco });
    },
    60_000,
  );

  waitsOn(
    givingAndReading,
    "a hug the member gave does Give a hug, and one they received does not",
    async () => {
      await thanks(bob, "Shipped the fix for the flaky deploy", juno);
      await hug(bob, juno);

      expect((await albumOf(await signedIn(bob))).gettingStarted?.steps, "the hugger's steps").toMatchObject({ hugged: true });
      expect((await albumOf(await signedIn(juno))).gettingStarted?.steps, "the hugged member's steps").toMatchObject({ hugged: false });
    },
    60_000,
  );

  waitsOn(
    givingAndReading,
    "a kudos the member gave does the kudos step, and turning its item does Turn an item",
    async () => {
      await thanks(juno, saysWhy, bob);
      const asJuno = await signedIn(juno);
      expect((await albumOf(asJuno)).gettingStarted?.steps, "after the kudos").toMatchObject({ thoughtful: true, turned: false });

      for (const { item } of (await albumOf(asJuno)).board?.items ?? []) await t.run((ctx) => turnItem(ctx, asJuno, { item }));

      expect((await albumOf(asJuno)).gettingStarted?.steps, "after the turn").toMatchObject({ thoughtful: true, turned: true });
      expect((await albumOf(await signedIn(bob))).gettingStarted?.steps, "the thanked member's steps").toMatchObject({ thoughtful: false });
    },
    60_000,
  );

  waitsOn(
    givingAndReading,
    "HH6: a short kudos the member gave does the kudos step too, and not the thanked member's",
    async () => {
      await thanks(juno, "ty", bob);

      expect((await albumOf(await signedIn(juno))).gettingStarted?.steps).toMatchObject({ thoughtful: true });
      expect((await albumOf(await signedIn(bob))).gettingStarted?.steps, "the thanked member's steps").toMatchObject({ thoughtful: false });
    },
    60_000,
  );

  waitsOn(
    albumRead,
    "reaching level 2 does Reach level 2",
    async () => {
      await reachesXp(juno, xpToReach(2));

      expect((await albumOf(await signedIn(juno))).gettingStarted?.steps).toMatchObject({ levelTwo: true });
    },
    60_000,
  );

  for (const [off, flags] of [
    ["onboarding off", [...albumOpen, "hidden-items"]],
    ["hidden-items off", [...albumOpen, "onboarding"]],
  ] as const) {
    waitsOn(
      albumRead,
      `with ${off}, getAlbum answers no Getting started`,
      async () => {
        await switchWebsite(...flags);

        expect(await albumOf(await signedIn(juno))).not.toHaveProperty("gettingStarted");
      },
      60_000,
    );
  }

  waitsOn(
    albumRead,
    "MQ38: on the Monday path, getAlbum answers no Getting started, since the quests panel's journey replaces it",
    async () => {
      await switchWebsite(...onboardingOn, "xp-levels", "monday-quest");

      const album = await albumOf(await signedIn(juno));

      expect(album, "the Monday-path member's album").not.toHaveProperty("gettingStarted");
      expect(album.howItWorks, "the newcomer's card, kept").toEqual({ slack, toLevelTwo: true, kudos: taco });
    },
    60_000,
  );
});

// S16's website handlers, which the service doesn't have yet.
async function getAlbum(_ctx: QueryContext, _me: VerifiedMember): Promise<AlbumRead> {
  throw notPorted("website.album.getAlbum");
}

async function turnItem(_ctx: MutationContext, _me: VerifiedMember, _args: { item: string }): Promise<TurnAnswer> {
  throw notPorted("website.album.turnItem");
}

// Today's `switchWebsite(t, postHog, true, ...flags)`: the website open, these flags on for everyone, and the workspace's key made.
async function switchWebsite(...flags: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, allowedWorkspace));
}

function close(me: VerifiedMember, triedSlack: boolean) {
  return t.run(async (ctx) => closeHowItWorks(ctx, me, (await lookup(ctx, me.workspace, me.user)) as HomeMember, { triedSlack }));
}

function closesRecorded() {
  return t.postHog
    .productEvents()
    .filter(({ event }) => event === "onboarding card closed")
    .map(({ properties }) => ({ tried_slack: properties.tried_slack }));
}

// The front door acknowledges an event no domain registered a handler for and takes nothing in, so a kudos or a hug
// sent before the stack that handles it lands would go nowhere: until then it ends here, as at a stub.
function handledByTheFrontDoor(kind: "message" | "reactionAdded") {
  if (!Object.hasOwn(serviceRegistry.slack.events ?? {}, kind)) throw notPorted(`slack.events.${kind}`);
}

async function thanks(giver: Person, words: string, recipient: Person) {
  handledByTheFrontDoor("message");
  messages += 1;
  t.time.advance(minuteMs);
  await t.send("/events", messageEvent([section(text(`${words} `), mention(recipient.user), emoji("taco"))], { user: giver.user, ts: tsOf(messages) }));
  await t.settle();
}

async function hug(giver: Person, author: Person) {
  handledByTheFrontDoor("reactionAdded");
  t.time.advance(minuteMs);
  await t.send("/events", reactionEvent({ user: giver.user, itemUser: author.user, ts: tsOf(messages) }));
  await t.settle();
}

function tsOf(message: number) {
  return `${tuesday.getTime() / 1000 + message}.${String(message).padStart(6, "0")}`;
}

async function reachesXp(someone: Person, xp: number) {
  const member = await memberOf(someone);
  const progress = (await t.seed.all("memberProgress")).find((row) => row.member === member);
  if (progress === undefined) await t.seed.insert("memberProgress", { member, xp, pointsSpent: 0 });
  else await t.seed.patch("memberProgress", progress._id, { xp });
}

// A reader signed in as today's `aSignedInSession` left them: the analytics ID the flags decide them by, and the member
// check's answer.
async function signedIn(someone: Person): Promise<VerifiedMember> {
  const member = await memberOf(someone);
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: allowedWorkspace, user: someone.user, name: someone.name };
}

async function albumOf(me: VerifiedMember): Promise<AlbumAnswer> {
  const album: AlbumRead | { kind: string } = await t.query((ctx) => getAlbum(ctx, me));
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album as AlbumAnswer;
}

async function memberOf(someone: Person): Promise<MemberId> {
  const row = (await t.seed.all("members")).find(({ workspace, user }) => workspace === allowedWorkspace && user === someone.user);
  if (row === undefined) throw new Error(`${someone.name} is no member`);
  return row._id as MemberId;
}

// Every table of the data model, each in creation order, as today's `everyTable` read every table of the schema.
async function everyTable() {
  const tables: Record<string, unknown[]> = {};
  for (const table of dataModelTables) tables[getTableName(table)] = await t.seed.all(getTableName(table) as TableName);
  return tables;
}
