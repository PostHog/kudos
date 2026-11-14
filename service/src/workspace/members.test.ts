// The workspace's settings, its members and its URL on the service's transaction: the reads every other domain makes
// of the directory, the defaults a workspace without a row has, the welcome nudge switch, the celebrations switch and
// the one pending request for the workspace's URL.
import { and, asc, eq, ne } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import type { FlagDefinition } from "../../testing/fakePostHog.ts";
import { definitionsStored, offForEveryone, onForEveryone, postHogDeciding } from "../../testing/flags.ts";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/service.ts";
import { publicCelebrationsOn, celebrationsSwitchReadIn, celebrationsSwitchShownTo, setPublicCelebrations } from "./celebrationsSwitch.ts";
import { customEmojiImageOf, originalCustomEmojiOf } from "./customEmoji.ts";
import {
  chatUserOf,
  currentMemberOfUser,
  currentMembersNamedIn,
  currentMembersOf,
  currentNameAndPictureOf,
  displayNameOf,
  emailOf,
  fullNameOf,
  isAPersonOf,
  isMember,
  lookup,
  nameAndPictureOf,
  peopleIn,
  personFactsOf,
  profileNameOf,
  teammatesOf,
  timeZoneOf,
  type MemberId,
} from "./directory.ts";
import { hugBudgetOf, saveWelcomeNudge, saveWorkspaceSettings, setHugBudget, settingsOf, welcomeNudgeOn } from "./settings.ts";
import { claimWorkspaceUrlRequest, customEmojiPageOf, releaseWorkspaceUrlRequest, rememberWorkspaceUrl, workspaceUrlOf } from "./url.ts";
import { fillWorkspaceUrlLater } from "../slack/workspaceUrl.ts";

const now = new Date("2026-10-17T10:00:00Z").getTime();
const backend = useTestBackend({ now });

let t: TestBackend;

beforeEach(() => {
  vi.stubEnv("KUDOS_EMOJI", "");
  postHogDeciding("sandbox");
  t = backend();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// The directory's member row for `user` in T1, as Slack's events would keep it.
const member = (user: string, fields: { admin?: boolean; name?: string; kind?: "member" | "bot" | "not-a-member" } = {}) =>
  t.seed.insert("members", { workspace: "T1", user, kind: "member", asOf: 0, ...fields }) as Promise<MemberId>;

// Flag definitions stored as PostHog would serve them.
const flags = (...definitions: FlagDefinition[]) => definitionsStored(t.operations, ...definitions);

// The jobs operations enqueued and none has run yet, besides the backend's own recorder of published events.
const scheduled = () =>
  t.query(async ({ tx }) =>
    (await tx.select().from(jobs).where(and(eq(jobs.state, "pending"), ne(jobs.name, "testing.published"))).orderBy(asc(jobs._creationTime), asc(jobs._id))).map((row) => {
      const { name, args } = toDocument<{ name: string; args: unknown }>(jobs, row);
      return { name, args };
    }),
  );

describe("a workspace's settings", () => {
  test("a workspace with no row has today's defaults", async () => {
    expect(await t.query((ctx) => settingsOf(ctx, "T1"))).toEqual({ baseAllowance: 3, kudosEmoji: "taco", announcementChannel: null });
    expect(await t.query((ctx) => hugBudgetOf(ctx, "T1"))).toBe(10);
  });

  test("the deployment's KUDOS_EMOJI is the default kudos emoji, by its name", async () => {
    vi.stubEnv("KUDOS_EMOJI", " :Hoggo: ");

    expect((await t.query((ctx) => settingsOf(ctx, "T1"))).kudosEmoji).toBe("hoggo");
  });

  test("saved settings are read back, and a field cleared by a save reads as its default", async () => {
    await t.run((ctx) => saveWorkspaceSettings(ctx, "T1", { baseAllowance: 5, announcementChannel: "C_NEWS", hugBudget: 2 }));
    expect(await t.query((ctx) => settingsOf(ctx, "T1"))).toEqual({ baseAllowance: 5, kudosEmoji: "taco", announcementChannel: "C_NEWS" });

    await t.run((ctx) => saveWorkspaceSettings(ctx, "T1", { announcementChannel: undefined }));

    expect(await t.query((ctx) => settingsOf(ctx, "T1"))).toEqual({ baseAllowance: 5, kudosEmoji: "taco", announcementChannel: null });
    expect(await t.query((ctx) => hugBudgetOf(ctx, "T1"))).toBe(2);
    expect(await t.seed.all("workspaces")).toHaveLength(1);
  });

  test("an operator sets a known workspace's hug budget to a whole number only", async () => {
    await t.run((ctx) => saveWorkspaceSettings(ctx, "T1", {}));

    await t.run((ctx) => setHugBudget(ctx, { workspace: "T1", hugBudget: 0 }));

    expect(await t.query((ctx) => hugBudgetOf(ctx, "T1"))).toBe(0);
    await expect(t.run((ctx) => setHugBudget(ctx, { workspace: "T1", hugBudget: 1.5 }))).rejects.toThrow("whole number");
    await expect(t.run((ctx) => setHugBudget(ctx, { workspace: "T2", hugBudget: 4 }))).rejects.toThrow("Kudos knows no workspace T2");
  });

  test("the welcome nudge is on until a workspace turns it off, and back on", async () => {
    expect(await t.query((ctx) => welcomeNudgeOn(ctx, "T1"))).toBe(true);

    await t.run((ctx) => saveWelcomeNudge(ctx, "T1", false));
    expect(await t.query((ctx) => welcomeNudgeOn(ctx, "T1"))).toBe(false);
    await t.run((ctx) => saveWelcomeNudge(ctx, "T1", true));

    expect(await t.query((ctx) => welcomeNudgeOn(ctx, "T1"))).toBe(true);
    expect(await t.seed.all("welcomeNudgeSwitches")).toHaveLength(1);
  });

  test("a custom emoji's picture is read by its name, and an alias names its original", async () => {
    await t.seed.insert("customEmoji", { workspace: "T1", name: "hoggo", image: "https://emoji.test/hoggo.png", listing: 1 });
    await t.seed.insert("customEmoji", { workspace: "T1", name: "hog", image: "https://emoji.test/hoggo.png", aliasOf: "hoggo", listing: 1 });

    expect(await t.query((ctx) => customEmojiImageOf(ctx, "T1", "hoggo"))).toBe("https://emoji.test/hoggo.png");
    expect(await t.query((ctx) => customEmojiImageOf(ctx, "T2", "hoggo"))).toBeUndefined();
    expect(await t.query((ctx) => originalCustomEmojiOf(ctx, "T1", "hog"))).toEqual({ name: "hoggo", image: "https://emoji.test/hoggo.png" });
    expect(await t.query((ctx) => originalCustomEmojiOf(ctx, "T1", "nope"))).toBeNull();
  });
});

describe("the directory's members", () => {
  test("a member is looked up by Slack user, with their time zone and admin flag; a bot and a former member by their kind", async () => {
    const alice = await member("U_ALICE", { name: "alice", admin: true });
    await t.seed.patch("members", alice, { timeZone: "Europe/Berlin" });
    await member("U_BOT", { kind: "bot" });
    await member("U_GONE", { kind: "not-a-member" });

    expect(await t.query((ctx) => lookup(ctx, "T1", "U_ALICE"))).toEqual({ kind: "member", member: alice, timeZone: "Europe/Berlin", admin: true });
    expect(await t.query((ctx) => lookup(ctx, "T1", "U_BOT"))).toEqual({ kind: "bot" });
    expect(await t.query((ctx) => lookup(ctx, "T1", "U_GONE"))).toEqual({ kind: "not-a-member" });
    expect(await t.query((ctx) => lookup(ctx, "T1", "U_NOBODY"))).toBeUndefined();
    expect(await t.query((ctx) => lookup(ctx, "T2", "U_ALICE"))).toBeUndefined();
  });

  test("a member's Slack identity, email, names and picture are read from their row", async () => {
    const alice = await t.seed.insert("members", {
      workspace: "T1",
      user: "U_ALICE",
      kind: "member",
      name: "alice",
      email: "alice@example.com",
      realName: "Alice Example",
      displayName: "Ali",
      title: "Engineer",
      picture: "https://avatars.test/alice.png",
      timeZone: "America/New_York",
      asOf: 0,
    });

    expect(await t.query((ctx) => chatUserOf(ctx, alice))).toEqual({ workspace: "T1", user: "U_ALICE" });
    expect(await t.query((ctx) => emailOf(ctx, alice))).toBe("alice@example.com");
    expect(await t.query((ctx) => isMember(ctx, alice))).toBe(true);
    expect(await t.query((ctx) => nameAndPictureOf(ctx, alice))).toEqual({ name: "alice", picture: "https://avatars.test/alice.png" });
    expect(await t.query((ctx) => displayNameOf(ctx, alice))).toBe("alice");
    expect(await t.query((ctx) => profileNameOf(ctx, alice))).toBe("Ali");
    expect(await t.query((ctx) => fullNameOf(ctx, alice))).toBe("Alice Example");
    expect(await t.query((ctx) => timeZoneOf(ctx, alice))).toBe("America/New_York");
    expect(await t.query((ctx) => personFactsOf(ctx, alice))).toEqual({
      workspace: "T1",
      user: "U_ALICE",
      admin: false,
      email: "alice@example.com",
      realName: "Alice Example",
      displayName: "Ali",
      title: "Engineer",
      picture: "https://avatars.test/alice.png",
    });
  });

  test("a member who left keeps their Slack identity but no name, email, picture, time zone or facts", async () => {
    const gone = await t.seed.insert("members", { workspace: "T1", user: "U_GONE", kind: "not-a-member", asOf: 0 });

    expect(await t.query((ctx) => chatUserOf(ctx, gone))).toEqual({ workspace: "T1", user: "U_GONE" });
    expect(await t.query((ctx) => isMember(ctx, gone))).toBe(false);
    expect(await t.query((ctx) => emailOf(ctx, gone))).toBeUndefined();
    expect(await t.query((ctx) => nameAndPictureOf(ctx, gone))).toEqual({ name: undefined, picture: null });
    expect(await t.query((ctx) => currentNameAndPictureOf(ctx, gone))).toBeNull();
    expect(await t.query((ctx) => timeZoneOf(ctx, gone))).toBeNull();
    expect(await t.query((ctx) => fullNameOf(ctx, gone))).toBe("");
    expect(await t.query((ctx) => personFactsOf(ctx, gone))).toBeNull();
    expect(await t.query((ctx) => isAPersonOf(ctx, "T1", gone))).toBe(true);
  });

  test("a full name falls back from the real name to the name, and a profile name from the display name to the real name", async () => {
    const bob = await t.seed.insert("members", { workspace: "T1", user: "U_BOB", kind: "member", name: "bob", realName: "Bob Example", asOf: 0 });
    const carol = await member("U_CAROL", { name: "carol" });

    expect(await t.query((ctx) => profileNameOf(ctx, bob))).toBe("Bob Example");
    expect(await t.query((ctx) => fullNameOf(ctx, carol))).toBe("carol");
    expect(await t.query((ctx) => profileNameOf(ctx, carol))).toBeUndefined();
  });

  test("an ID the directory doesn't hold is no member, and asking for its Slack identity fails", async () => {
    const alice = await member("U_ALICE");
    await t.seed.delete("members", alice);

    expect(await t.query((ctx) => isMember(ctx, alice))).toBe(false);
    expect(await t.query((ctx) => isAPersonOf(ctx, "T1", alice))).toBe(false);
    await expect(t.query((ctx) => chatUserOf(ctx, alice))).rejects.toThrow("no such member in the directory");
  });

  test("a bot is no person, and a member of another workspace is no person of this one", async () => {
    const bot = await member("U_BOT", { kind: "bot" });
    const elsewhere = await t.seed.insert("members", { workspace: "T2", user: "U_ALICE", kind: "member", asOf: 0 });

    expect(await t.query((ctx) => isAPersonOf(ctx, "T1", bot))).toBe(false);
    expect(await t.query((ctx) => isAPersonOf(ctx, "T1", elsewhere))).toBe(false);
  });

  test("the current members are the workspace's members, in Slack user order; people include those who left, as former", async () => {
    const carol = await member("U_CAROL", { name: "carol" });
    const alice = await t.seed.insert("members", { workspace: "T1", user: "U_ALICE", kind: "member", name: "alice", realName: "Alice Example", asOf: 0 });
    const gone = await member("U_GONE", { kind: "not-a-member" });
    await member("U_BOT", { kind: "bot" });
    await t.seed.insert("members", { workspace: "T2", user: "U_DAVE", kind: "member", asOf: 0 });

    expect(await t.query((ctx) => currentMembersOf(ctx, "T1"))).toEqual([alice, carol]);
    expect(await t.query((ctx) => currentMembersNamedIn(ctx, "T1"))).toEqual([
      { member: alice, fullName: "Alice Example" },
      { member: carol, fullName: "carol" },
    ]);
    expect(await t.query((ctx) => teammatesOf(ctx, "T1", carol))).toEqual([alice]);
    expect(await t.query((ctx) => currentMemberOfUser(ctx, "T1", "U_ALICE"))).toEqual({ member: alice, name: "alice" });
    expect(await t.query((ctx) => currentMemberOfUser(ctx, "T1", "U_GONE"))).toBeUndefined();
    const people = await t.query((ctx) => peopleIn(ctx, "T1"));
    expect(people.get(gone)).toEqual({ user: "U_GONE", name: undefined, picture: null, former: true });
    expect(people.get(alice)).toEqual({ user: "U_ALICE", name: "alice", picture: null, former: false });
    expect(people.size).toBe(4);
  });

  test("two rows for one Slack user fail the lookup, as Convex's unique read did", async () => {
    await member("U_ALICE");
    await member("U_ALICE");

    await expect(t.query((ctx) => lookup(ctx, "T1", "U_ALICE"))).rejects.toThrow(new Error("unique() query returned more than one result from table members:"));
  });
});

describe("the celebrations switch", () => {
  const switching = (on: boolean, person: { member: MemberId; admin: boolean }) => t.run((ctx) => setPublicCelebrations(ctx, "T1", person, on));

  test("while celebrations-switch is off, celebrations are public and nobody switches them", async () => {
    await flags(offForEveryone("celebrations-switch"));
    const admin = await member("U_ADMIN", { admin: true });

    expect(await switching(false, { member: admin, admin: true })).toBe(false);
    expect(await t.query((ctx) => publicCelebrationsOn(ctx, "T1"))).toBe(true);
    expect(await t.query((ctx) => celebrationsSwitchReadIn(ctx, "T1"))).toBeNull();
    expect(await t.run((ctx) => celebrationsSwitchShownTo(ctx, "T1", { member: admin, admin: true }))).toBeNull();
  });

  test("an admin turns public celebrations off and on, once each, with one stored switch", async () => {
    await flags(onForEveryone("celebrations-switch"));
    const admin = await member("U_ADMIN", { admin: true });

    expect(await t.run((ctx) => celebrationsSwitchShownTo(ctx, "T1", { member: admin, admin: true }))).toBe(true);
    expect(await switching(true, { member: admin, admin: true })).toBe(false);
    expect(await switching(false, { member: admin, admin: true })).toBe(true);
    expect(await t.query((ctx) => publicCelebrationsOn(ctx, "T1"))).toBe(false);
    expect(await t.query((ctx) => celebrationsSwitchReadIn(ctx, "T1"))).toBe(false);
    expect(await switching(false, { member: admin, admin: true })).toBe(false);
    expect(await switching(true, { member: admin, admin: true })).toBe(true);

    expect(await t.query((ctx) => publicCelebrationsOn(ctx, "T1"))).toBe(true);
    expect(await t.seed.all("celebrationsSwitches")).toHaveLength(1);
  });

  test("a member who is neither an admin nor the maintainer switches nothing", async () => {
    await flags(onForEveryone("celebrations-switch"), onForEveryone("workspace-settings"));
    vi.stubEnv("KUDOS_MAINTAINER", "U_MAINTAINER");
    const alice = await member("U_ALICE");

    expect(await switching(false, { member: alice, admin: false })).toBe(false);
    expect(await t.run((ctx) => celebrationsSwitchShownTo(ctx, "T1", { member: alice, admin: false }))).toBeNull();
    expect(await t.seed.all("celebrationsSwitches")).toEqual([]);
  });

  test("the maintainer switches them while workspace-settings is on for them", async () => {
    await flags(onForEveryone("celebrations-switch"), onForEveryone("workspace-settings"));
    vi.stubEnv("KUDOS_MAINTAINER", "U_MAINTAINER");
    const owner = await member("U_MAINTAINER");

    expect(await switching(false, { member: owner, admin: false })).toBe(true);
    expect(await t.query((ctx) => publicCelebrationsOn(ctx, "T1"))).toBe(false);
  });
});

describe("the workspace's URL", () => {
  const claim = () => t.run((ctx) => claimWorkspaceUrlRequest(ctx, "T1"));

  test("one request is pending at a time, and it lapses after 10 minutes", async () => {
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);

    t.clock.advance(10 * 60 * 1000 - 1);
    expect(await claim()).toBe(false);
    t.clock.advance(1);

    expect(await claim()).toBe(true);
  });

  test("a released request can be claimed again at once", async () => {
    await claim();

    await t.run((ctx) => releaseWorkspaceUrlRequest(ctx, { workspace: "T1" }));

    expect(await claim()).toBe(true);
  });

  test("Slack's https URL is remembered as its origin, which permalinks and the custom emoji page read, and no request is claimed after", async () => {
    await claim();

    expect(await t.run((ctx) => rememberWorkspaceUrl(ctx, { workspace: "T1", url: "https://acme.slack.test/some/path" }))).toBe(true);

    expect(await t.query((ctx) => workspaceUrlOf(ctx, "T1"))).toBe("https://acme.slack.test/");
    expect(await t.query((ctx) => customEmojiPageOf(ctx, "T1"))).toBe("https://acme.slack.test/customize/emoji");
    expect((await t.seed.all("workspaces"))[0]?.urlRequestedAt).toBeUndefined();
    expect(await claim()).toBe(false);
  });

  test("a URL that isn't https, or isn't one, is not remembered", async () => {
    expect(await t.run((ctx) => rememberWorkspaceUrl(ctx, { workspace: "T1", url: "http://acme.slack.test/" }))).toBe(false);
    expect(await t.run((ctx) => rememberWorkspaceUrl(ctx, { workspace: "T1", url: "not a url" }))).toBe(false);

    expect(await t.query((ctx) => workspaceUrlOf(ctx, "T1"))).toBeNull();
    expect(await t.query((ctx) => customEmojiPageOf(ctx, "T1"))).toBeNull();
  });

  test("filling the URL later asks Slack once, by one job, while a request is pending", async () => {
    await t.run((ctx) => fillWorkspaceUrlLater(ctx, "T1"));
    await t.run((ctx) => fillWorkspaceUrlLater(ctx, "T1"));

    expect(await scheduled()).toEqual([{ name: "slack.workspaceUrl.fillWorkspaceUrl", args: { workspace: "T1" } }]);
  });
});
