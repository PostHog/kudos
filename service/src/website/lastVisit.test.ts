// The last visit moves forward once per visit: today's convex/website/lastVisit.test.ts, on the service's test backend.
// Each reader is a `me` made from the seeded directory row, as S15's member check answers it; arrive is this slice's
// command, run with the person the directory knows in the same mutation; getAlbum is S16's handler and runs as itself;
// turnItem is S16's command, which has no route yet, so a turn ends at a stand-in for its stub. The directory rows are
// the ones each `team_join` wrote; the company profiles come from the sync as today. The guard tests whose subject is
// the member check (closed, signed out, not a member, an argument naming a member) call arrive by its route name through
// the whole app, signed in through SSO or not at all, so the app's own identity mapping and member check (S15) answer.
import { asc, desc, eq, getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, routedFetch } from "../../testing/fakePostHog.ts";
import { FakePostHogCom, type TeamPage } from "../../testing/fakePostHogCom.ts";
import { definitionsStored, offForEveryone, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { emoji, mention, messageEvent, section, text } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { analyticsIdOf } from "../analytics/person.ts";
import { syncCompanyProfiles } from "../companyProfiles/sync.ts";
import { awards } from "../db/schema/index.ts";
import type { TableName } from "../db/schema/index.ts";
import { jobs } from "../db/schema/service.ts";
import type { HomeMember } from "../feedback/homes.ts";
import { dataModelTables } from "../load/loader.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { serviceRegistry } from "../registry.ts";
import { memberChanged } from "../slack/hugsTesting.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import { getAlbum, type AlbumAnswer, type AlbumRead, type TurnAnswer } from "./album.ts";
import { arrive as arriveAt, lastVisitOf, moveLastVisitTo, type ArrivalAnswer } from "./lastVisit.ts";
import type { VerifiedMember } from "./memberQuery.ts";
import { argumentsRefused, signedInThroughSso, websiteAs } from "./routesTesting.ts";

const tuesday = new Date("2026-10-13T10:00:00Z");
const minuteMs = 60_000;
const why = "Thanks for untangling the flaky migration";
const albumOpen = ["album", "collection", "packs"];
const itemsOn = [...albumOpen, "hidden-items"];

// What each step reaches past this stack's handlers:
// - a kudos through Slack, whose events every domain's subscribers take: the parser and engine (S4), replies (S5),
//   progression (S6), quests and the wallet (S7), the album (S8, S9, S10), groups and boards (S11), activity (S12),
//   hugs (S13) and analytics (S14);
const giving: Stack[] = ["S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14"];
// - getAlbum's read (S16's handler) and what it answers: awards (S4), the items (S8), the album flag and stickers (S9)
//   and hugs (S13);
const reading: Stack[] = ["S4", "S8", "S9", "S13", "S16"];
// - a turn: S16's turnItem;
const turning: Stack[] = ["S16"];
// - an arrival: the album flag, stickers and team stickers (S9), the hidden-items flag and the turns (S8), the hoggie
//   tallies (S10), the newest award received (S4) and the first-thanks moment (S6).
const arriving: Stack[] = ["S4", "S6", "S8", "S9", "S10"];

function stacks(...steps: Stack[][]): [Stack, ...Stack[]] {
  const all = [...new Set(steps.flat())].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return all as [Stack, ...Stack[]];
}

type Person = { user: string; name: string };

const alice = person("Alice", "Marchetti");
const bob = person("Bob", "Okonkwo");
const carol = person("Carol", "Lindqvist");
const everyone = [alice, bob, carol];
const lanterns: TeamPage = { slug: "lanterns", name: "Lanterns", profiles: profilesOf(alice, bob, carol) };

const backend = useTestBackend({ now: tuesday.getTime(), workspace: "T1" });

let postHogCom: FakePostHogCom;
let t: TestBackend;
let messages = 0;

beforeEach(async () => {
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
  messages = 0;
  postHogCom = new FakePostHogCom();
  for (const { user, name } of everyone) t.slack.withMember(user, { profile: { display_name: name, real_name: name } });
  vi.stubGlobal("fetch", routedFetch(t.postHog, (input, init) => (postHogCom.owns(new URL(input instanceof Request ? input.url : String(input))) ? postHogCom.fetch(input) : t.slack.fetch(input, init))));
  await t.seed.insert("workspaces", { workspace: "T1", kudosEmoji: "taco", baseAllowance: 200 });
  await switchWebsite(...itemsOn);
  // The members rows each `team_join` wrote.
  for (const { user, name } of everyone) await t.seed.insert("members", { workspace: "T1", user, kind: "member", name, realName: name, displayName: name, asOf: tuesday.getTime() });
  await t.settle();
  postHogCom.withTeams(lanterns);
  await t.operations.action("companyProfiles.sync.syncCompanyProfiles", (ctx) => syncCompanyProfiles(ctx, {}));
  await t.settle();
});

afterEach(() => void vi.unstubAllEnvs());

describe("LP26: the last visit moves forward once per visit", () => {
  waitsOn(stacks(giving, reading, turning, arriving), "an arrival moves the last visit to the newest instant put in or received, never to the clock, and the next arrival from it moves it on to what was put in since", async () => {
    await thanks(alice, bob, carol);
    const asAlice = await signedIn(alice);
    expect((await albumOf(asAlice)).lastVisit).toBeNull();
    const bobTurnedAt = await laterTurnTheSticker(asAlice, bob);
    t.time.advance(10 * minuteMs);

    expect(await arrive(asAlice, null)).toEqual({ kind: "arrived", lastVisit: bobTurnedAt });
    const carolTurnedAt = await laterTurnTheSticker(asAlice, carol);
    t.time.advance(10 * minuteMs);
    expect(await arrive(asAlice, bobTurnedAt)).toEqual({ kind: "arrived", lastVisit: carolTurnedAt });

    expect((await albumOf(asAlice)).lastVisit).toBe(carolTurnedAt);
    expect(await t.run((ctx) => lastVisitOfPerson(ctx, alice))).toBe(carolTurnedAt);
  }, 60_000);

  waitsOn(stacks(giving, arriving), "a kudos received since the last visit moves it at the next arrival, so the teaser's kudos since the last visit start after what the member came back to", async () => {
    const receivedAt = (await thanks(alice, bob)).decidedAt;
    t.time.advance(10 * minuteMs);

    expect(await arrive(await signedIn(bob), null)).toEqual({ kind: "arrived", lastVisit: receivedAt });
  }, 60_000);

  waitsOn(stacks(giving, turning, arriving, reading), "a stale tab's arrival, holding an older last visit, moves nothing, so two tabs read the same last visit", async () => {
    await thanks(alice, bob, carol);
    const tab = await signedIn(alice);
    const staleTab = await signedIn(alice);
    const bobTurnedAt = await laterTurnTheSticker(tab, bob);
    await arrive(tab, null);
    await laterTurnTheSticker(tab, carol);

    expect(await arrive(staleTab, null)).toEqual({ kind: "arrived", lastVisit: bobTurnedAt });
    expect((await albumOf(tab)).lastVisit).toBe(bobTurnedAt);
    expect((await albumOf(staleTab)).lastVisit).toBe(bobTurnedAt);
  }, 60_000);

  waitsOn(stacks(giving, turning, arriving, reading), "moving the last visit to an earlier instant keeps it where it is", async () => {
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const bobTurnedAt = await laterTurnTheSticker(asAlice, bob);
    await arrive(asAlice, null);
    const member = await memberOf(alice);

    await t.run((ctx) => moveLastVisitTo(ctx, member, bobTurnedAt - minuteMs));

    expect((await albumOf(asAlice)).lastVisit).toBe(bobTurnedAt);
  }, 60_000);

  waitsOn(stacks(giving, reading, arriving), "with hidden-items off, getAlbum answers no last visit and no sticker's instant, and arriving answers refused and writes nothing", async () => {
    await switchWebsite(...albumOpen);
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const album = await albumOf(asAlice);
    const before = await everythingWritten();

    expect(await arrive(asAlice, null)).toEqual({ kind: "refused" });

    expect(await everythingWritten()).toEqual(before);
    expect(album).not.toHaveProperty("lastVisit");
    for (const shown of album.people) expect(shown).not.toHaveProperty("at");
  }, 60_000);
});

describe("LP22: getAlbum answers when each sticker was put in", () => {
  waitsOn(stacks(giving, turning, reading), "with hidden-items on, a held person answers the instant their sticker was put in, and a person not held answers none", async () => {
    await thanks(alice, bob);
    const asAlice = await signedIn(alice);
    const bobTurnedAt = await laterTurnTheSticker(asAlice, bob);

    const { people } = await albumOf(asAlice);

    expect(people.find(({ person }) => person === bobOf(people))).toMatchObject({ held: true, at: bobTurnedAt });
    expect(people.filter(({ held }) => !held).map((shown) => shown.at)).toEqual(people.filter(({ held }) => !held).map(() => undefined));
  }, 60_000);
});

describe("website commands pass one guard", () => {
  waitsOn(["S15"], "WS61: with the website flag off, arriving answers closed and writes nothing at all", async () => {
    const asAlice = await aSession(alice);
    await websiteOff(...itemsOn);
    const before = await everythingWritten();

    expect(await asAlice.command("website.lastVisit.arrive", { from: null })).toEqual({ kind: "closed" });
    expect(await everythingWritten()).toEqual(before);
  }, 60_000);

  waitsOn(["S3", "S15"], "WS61: without a session arriving answers signed-out, and for a member who left not-a-member, writing nothing at all", async () => {
    const asAlice = await aSession(alice);
    const before = await everythingWritten();

    expect(await websiteAs(t, null).command("website.lastVisit.arrive", { from: null })).toEqual({ kind: "signed-out" });
    expect(await everythingWritten()).toEqual(before);
    await memberChanged(t, "user_change", { id: alice.user, team_id: "T1", deleted: true });
    await t.settle();
    const left = await everythingWritten();
    expect(await asAlice.command("website.lastVisit.arrive", { from: null })).toEqual({ kind: "not-a-member" });
    expect(await everythingWritten()).toEqual(left);
  }, 60_000);

  test("WS61: the last visit the tab read is the only argument, so no call names a member", async () => {
    const asAlice = await aSession(alice);
    const before = await everythingWritten();

    await expect(asAlice.command("website.lastVisit.arrive", { from: null, member: await memberOf(alice) })).rejects.toThrow(argumentsRefused);
    expect(await everythingWritten()).toEqual(before);
  }, 60_000);
});

// S16's turn command, which has no route yet: website commands get no module-map stubs, so until S16 registers
// `website.album.turnItem` a turn ends here, as at its stub.
async function turnItem(_ctx: MutationContext, _me: VerifiedMember, _person: HomeMember, _args: { item: string }): Promise<TurnAnswer> {
  throw notPorted("website.album.turnItem");
}

// Today's `switchWebsite(t, postHog, true, ...flags)`: the website open, these flags on for everyone, and the workspace's key made.
async function switchWebsite(...flags: string[]) {
  await definitionsStored(t.operations, onForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

function person(first: string, last: string): Person {
  return { user: `U_${first}_${last}`.toUpperCase(), name: `${first} ${last}` };
}

function profilesOf(...people: Person[]): TeamPage["profiles"] {
  return people.map(({ name }) => {
    const [firstName, lastName] = name.split(" ") as [string, string];
    return { id: everyone.findIndex((someone) => someone.name === name) + 1, firstName, lastName, colour: "teal" };
  });
}

// The front door acknowledges an event no domain registered a handler for and takes nothing in, so a kudos sent before
// the stack that handles it lands would go nowhere: until then it ends here, as at a stub.
function handledByTheFrontDoor(kind: "message") {
  if (!Object.hasOwn(serviceRegistry.slack.events ?? {}, kind)) throw notPorted(`slack.events.${kind}`);
}

// The front door answers 500 when a registered handler fails, and the test would go on as if the event did nothing. A
// failure that reached a stub still waits, as at the stub; any other answer but 200 fails the test as itself.
async function delivered(response: Response | Promise<Response>): Promise<void> {
  const { status } = await response;
  if (status === 200) return;
  const failure = t.logs.findLast(({ message }) => message === "slack request failed");
  if (failure?.fields.error === "NotPortedError") throw notPorted("slack.frontDoor.handler");
  throw new Error(`The front door answered ${status}`);
}

async function thanks(giver: Person, ...recipients: Person[]) {
  handledByTheFrontDoor("message");
  messages += 1;
  t.time.advance(minuteMs);
  const at = t.clock.now();
  const ts = `${at / 1000}.${String(messages).padStart(6, "0")}`;
  await delivered(t.send("/events", messageEvent([section(text(`${why} `), ...recipients.map(({ user }) => mention(user)), emoji("taco"))], { user: giver.user, ts })));
  await t.settle();
  return { decidedAt: await newestAwardDecidedAt(recipients[0]!) };
}

async function newestAwardDecidedAt(recipient: Person) {
  const member = await memberOf(recipient);
  const [award] = await t.query(({ tx }) => tx.select({ _creationTime: awards._creationTime }).from(awards).where(eq(awards.recipient, member)).orderBy(desc(awards._creationTime), desc(awards._id)).limit(1));
  return award!._creationTime;
}

function arrive(reader: VerifiedMember, from: number | null): Promise<ArrivalAnswer> {
  return t.run(async (ctx) => arriveAt(ctx, reader, (await lookup(ctx, reader.workspace, reader.user)) as HomeMember, { from }));
}

async function laterTurnTheSticker(reader: VerifiedMember, of: Person): Promise<number> {
  t.time.advance(minuteMs);
  const turnedAt = t.clock.now();
  const item = await stickerItemOf(alice, of);
  const turned = await t.run(async (ctx) => turnItem(ctx, reader, (await lookup(ctx, reader.workspace, reader.user)) as HomeMember, { item }));
  if (turned.kind !== "turned") throw new Error(`expected the sticker turned, got ${JSON.stringify(turned)}`);
  return turnedAt;
}

async function albumOf(reader: VerifiedMember): Promise<AlbumAnswer> {
  const album: AlbumRead | { kind: string } = await t.query((ctx) => getAlbum(ctx, reader));
  if (album.kind !== "album") throw new Error(`expected an album, got ${JSON.stringify(album)}`);
  return album as AlbumAnswer;
}

function bobOf(people: AlbumAnswer["people"]) {
  return people.find(({ name }) => name === bob.name)!.person;
}

async function lastVisitOfPerson(ctx: QueryContext, someone: Person) {
  const member = await lookup(ctx, "T1", someone.user);
  if (member?.kind !== "member") throw new Error(`${someone.name} is no member`);
  return lastVisitOf(ctx, member.member);
}

// A reader signed in as today's `aSignedInSession` left them: the analytics ID the flags decide them by, and the member
// check's answer. Each command reads the person the directory knows in its own mutation, as the route does.
/** Today's `aSignedInSession`: the person signs in, through SSO here, and the website's requests come as them. */
function aSession(someone: Person) {
  return signedInThroughSso(t, someone);
}

// Today's `switchWebsite(t, postHog, false, ...flags)`: the website off, these flags on, and the workspace's key made.
async function websiteOff(...flags: string[]) {
  await definitionsStored(t.operations, offForEveryone("website"), ...flags.map(onForEveryone));
  await t.run((ctx) => workspaceKeyOf(ctx, "T1"));
}

async function signedIn(someone: Person): Promise<VerifiedMember> {
  const member = await memberOf(someone);
  await t.run((ctx) => analyticsIdOf(ctx, member));
  return { member, workspace: "T1", user: someone.user, name: someone.name };
}

async function memberOf(someone: Person): Promise<MemberId> {
  const rows = (await t.seed.all("members")).filter((member) => member.workspace === "T1" && member.user === someone.user);
  if (rows.length > 1) throw new Error(`${rows.length} members rows for ${someone.name}, where one is unique`);
  return rows[0]!._id as MemberId;
}

async function stickerItemOf(giver: Person, thanked: Person): Promise<string> {
  const [member, person] = [await memberOf(giver), await memberOf(thanked)];
  const items = (await t.seed.all("items")).filter((row) => row.member === member);
  const item = items.find((row) => row.source === "sticker" && row.reason.kind === "thanks" && row.reason.person === person);
  if (item === undefined) throw new Error(`no sticker item for thanking ${thanked.name}`);
  return item._id;
}

// Every table of the data model, each in creation order, and every job, as today's `everythingWritten` read every table
// of the schema and the scheduled functions.
async function everythingWritten() {
  const tables: Record<string, unknown[]> = {};
  for (const table of dataModelTables) tables[getTableName(table)] = await t.seed.all(getTableName(table) as TableName);
  return { tables, scheduled: await t.query(({ tx }) => tx.select().from(jobs).orderBy(asc(jobs._creationTime), asc(jobs._id))) };
}
