// What S8's ported album tests share: the pieces of today's testing/website.ts, testing/slackBackend.ts,
// testing/unlocks.ts and testing/hoggies.ts they use, on the service's test backend. Test-only; the stacks that own the
// Slack events (S4) and the website (S15, S16) replace their parts here with their own helpers.
//
// Two of today's paths have no service version yet, and both answer as the stub they will be:
// - A Slack event whose kind no domain registered a handler for is acknowledged and dropped by the front door; today's
//   convex/slack/events.ts takes it in, so `slackEvent` reaches that module's stub, `slack.events.slackEvents` (S4).
// - A website command or read with no service route nor module-map stub answers through `formerConvexCall`, named by
//   its Convex path.
import { asc, getTableName, is, eq } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { expect, vi } from "vitest";
import type { TestBackend } from "../../testing/backend.ts";
import { flagsKey, postHogHost, projectToken, routedFetch, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { FakePostHogCom } from "../../testing/fakePostHogCom.ts";
import { flagsFromPostHog, onForEveryone } from "../../testing/flags.ts";
import { signingSecret } from "../../testing/signedSlack.ts";
import { appHomeOpened, memberEvent, messageEvent, reactionEvent, type MessageOptions, type ReactionOptions, type RichElement } from "../../testing/slackMessages.ts";
import { achievementsLiveIn } from "../achievements/flag.ts";
import { workspaceKeyOf } from "../analytics/outbox.ts";
import { syncCompanyProfiles } from "../companyProfiles/sync.ts";
import type { Id } from "../db/columns.ts";
import { toDocument } from "../db/documents.ts";
import * as schema from "../db/schema/index.ts";
import { jobs, type TableName } from "../db/schema/index.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext } from "../operations.ts";
import type { Registry } from "../registration.ts";
import { serviceRegistry } from "../registry.ts";
import { slackEvents } from "../slack/events.ts";
import type { EventCallback, EventKind, Handled, SlackEvent } from "../slack/frontDoor.ts";
import { signInWorkspace } from "../slack/signIn.ts";
import type { Feature } from "../unlocks/feature.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { makeReady, openUnlock } from "../unlocks/unlocks.ts";
import type { MyActivity } from "../website/activity.ts";
import type { AlbumHoggiesRead, AlbumPersonRead, AlbumRead, LevelUpRead, OpenAnswer, PutAllInAnswer, PutInAnswer, TurnAnswer, UnlockAnswer } from "../website/album.ts";
import type { CollectionAnswer } from "../website/collection.ts";
import type { CommandAnswer, CrateOpenAnswer, CratePurchaseAnswer } from "../website/commands.ts";
import type { Denial } from "../website/memberQuery.ts";
import { rememberSignedInMember } from "../website/signIn.ts";
import type { MemberId } from "../workspace/directory.ts";
import { catalogue, hoggieNamed } from "./hoggies/catalogue.ts";
import { earnLevelUpHoggies } from "./levelUpHoggies.ts";

export { FakePostHogCom, type TeamPage } from "../../testing/fakePostHogCom.ts";

export const allowedWorkspace = "T1";

export type Person = { user: string; name: string };

export function person(first: string, last: string): Person {
  return { user: `U_${first}_${last}`.toUpperCase(), name: `${first} ${last}` };
}

// --- testing/website.ts ---

/** Today's `aDeploymentForWorkspace`: the deployment's settings for one workspace. Undo with `vi.unstubAllEnvs()`. */
export function aDeploymentForWorkspace(workspace: string = allowedWorkspace) {
  vi.stubEnv("SLACK_WORKSPACE_ID", workspace);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
}

const onEverywhere: FlagDefinition = { key: "website", filters: { groups: [{ properties: [], rollout_percentage: 100 }] } };
const offEverywhere: FlagDefinition = { key: "website", active: false, filters: { groups: [{ properties: [], rollout_percentage: 100 }] } };

/**
 * Today's `switchWebsite`: PostHog serves the website flag, open or closed, and the named flags on for everyone; the app
 * refreshes them, then runs `prepareWebsiteFlag`, whose body keeps the sign-in workspace's key.
 */
export async function switchWebsite(t: TestBackend, open: boolean, ...alsoOn: string[]) {
  await flagsFromPostHog(t.operations, t.postHog, open ? onEverywhere : offEverywhere, ...alsoOn.map(onForEveryone));
  const workspace = signInWorkspace();
  if (workspace !== undefined) await t.run((ctx) => workspaceKeyOf(ctx, workspace));
}

/** Today's `aMember`; `_id` stands in for the ID a fresh Convex backend would give, where a test relies on it. */
export function aMember(t: TestBackend, user: string, kind: "member" | "not-a-member" = "member", workspace = allowedWorkspace, { _id }: { _id?: string } = {}) {
  return t.seed.insert("members", { workspace, user, kind, asOf: 0, ...(_id && { _id }) }) as Promise<MemberId>;
}

/** The member's row, as today's `members.by_user` with `unique()`, or null. */
export async function memberOrNullOf(t: TestBackend, { user }: Person, workspace = allowedWorkspace): Promise<MemberId | null> {
  const rows = (await t.seed.all("members")).filter((row) => row.workspace === workspace && row.user === user);
  if (rows.length > 1) throw new Error("unique() query returned more than one result from table members");
  return (rows[0]?._id as MemberId | undefined) ?? null;
}

/** The member's row, as today's `members.by_user` with `unique()`; a person with none fails the test. */
export async function memberOf(t: TestBackend, someone: Person, workspace = allowedWorkspace): Promise<MemberId> {
  const member = await memberOrNullOf(t, someone, workspace);
  if (member === null) throw new Error(`${someone.name} is no member of ${workspace}`);
  return member;
}

/** A member's browser session, as today's `authSessions` row; the service keeps no table for it until S15. */
export type Session = { user: Id<"users">; endsAt: number };

/** The former Convex paths of the calls `formerConvexCall` stands in for. */
export type FormerConvexPath =
  | "website.album.getAlbum"
  | "website.album.getAlbumHoggies"
  | "website.album.getAlbumPerson"
  | "website.album.getLevelUp"
  | "website.album.openThoughtfulPack"
  | "website.album.putIn"
  | "website.album.putAllIn"
  | "website.album.turnItem"
  | "website.album.unlockTeamSticker"
  | "website.collection.getCollection"
  | "website.activity.getActivity"
  | "website.commands.openCrate"
  | "website.commands.openFeature"
  | "website.commands.buyCrate"
  | "album.emojiNames.reserveSharedEmojiNames";

// The one seam for the calls that have neither a service route nor a module-map stub yet: each is named by its former
// Convex path and throws that path's `NotPortedError`, as a stub there would. Once S15's route table
// (PostHog/kudos#935) is on main, look the name up there, call the route when it is registered (or POST
// /api/query|mutation/<name>), and throw `notPorted(<name>)` only when it isn't. S8 makes that switch when #935 lands.
export async function formerConvexCall<T>(name: FormerConvexPath, caller: Session | null, args: Record<string, unknown> = {}): Promise<T> {
  void caller;
  void args;
  throw notPorted(name);
}

/** A website caller, signed in or not, as today's `t.withIdentity(...)` or `t` makes the calls. */
export type Reader = {
  session: Session | null;
  getAlbum(): Promise<AlbumRead | Denial>;
  getAlbumHoggies(): Promise<AlbumHoggiesRead | Denial>;
  getAlbumPerson(args: { person: MemberId }): Promise<AlbumPersonRead | Denial>;
  getLevelUp(args: { level: number }): Promise<LevelUpRead | Denial>;
  openThoughtfulPack(args: { pack: Id<"thoughtfulPacks"> }): Promise<OpenAnswer | Denial>;
  putIn(args: { item: Id<"trayItems"> }): Promise<PutInAnswer | Denial>;
  putAllIn(args?: Record<string, never>): Promise<PutAllInAnswer | Denial>;
  turnItem(args: { item: Id<"items"> }): Promise<TurnAnswer | Denial>;
  unlockTeamSticker(args: { team: string }): Promise<UnlockAnswer | Denial>;
  getCollection(): Promise<CollectionAnswer | Denial>;
  getActivity(args: { filter: string; cursor: string | null }): Promise<MyActivity>;
  openCrate(args: { crate: string }): Promise<CrateOpenAnswer | Denial>;
  openFeature(args: { feature: Feature }): Promise<CommandAnswer | Denial>;
  buyCrate(args: { next: number }): Promise<CratePurchaseAnswer | Denial>;
};

function readerOf(session: Session | null): Reader {
  const call =
    <T>(name: FormerConvexPath) =>
    (args: Record<string, unknown> = {}) =>
      formerConvexCall<T>(name, session, args);
  return {
    session,
    getAlbum: call("website.album.getAlbum"),
    getAlbumHoggies: call("website.album.getAlbumHoggies"),
    getAlbumPerson: call("website.album.getAlbumPerson"),
    getLevelUp: call("website.album.getLevelUp"),
    openThoughtfulPack: call("website.album.openThoughtfulPack"),
    putIn: call("website.album.putIn"),
    putAllIn: call("website.album.putAllIn"),
    turnItem: call("website.album.turnItem"),
    unlockTeamSticker: call("website.album.unlockTeamSticker"),
    getCollection: call("website.collection.getCollection"),
    getActivity: call("website.activity.getActivity"),
    openCrate: call("website.commands.openCrate"),
    openFeature: call("website.commands.openFeature"),
    buyCrate: call("website.commands.buyCrate"),
  };
}

/** A caller with no session, as today's calls on `t` itself. */
export const signedOut: Reader = readerOf(null);

const hourMs = 60 * 60 * 1000;

/**
 * Today's `aSignedInSession`: `rememberSignedInMember` as the sign-in callback calls it, then the session it signs in
 * to; the reader is that session's. `existingUserId` is the callback's own, for a later sign-in of the same user.
 */
export async function aSignedInSession(
  t: TestBackend,
  { user, name }: Person,
  { workspace = allowedWorkspace, endsIn = hourMs, existingUserId = null }: { workspace?: string; endsIn?: number; existingUserId?: Id<"users"> | null } = {},
): Promise<{ user: Id<"users">; asSignedIn: Reader }> {
  const profile = { id: `${workspace}/${user}`, chatWorkspace: workspace, chatUser: user, name };
  const userId = await t.run((ctx) => rememberSignedInMember(ctx, { existingUserId, profile }));
  return { user: userId, asSignedIn: readerOf({ user: userId, endsAt: t.clock.now() + endsIn }) };
}

/**
 * How today's Convex refuses a call that names an argument its validator lacks (`ArgumentValidationError: Object
 * contains extra field \`member\`...`), and how a service route's strict arguments will (zod's `Unrecognized key:
 * "member"`). No stub's message matches it.
 */
export const extraMemberArgument = /extra field `member`|Unrecognized key: "member"/;

// --- testing/slackBackend.ts ---

// The service's registry, with every Slack event handler's failure kept, so a stub a handler reaches is thrown to the
// test as itself rather than as the front door's 500. A port that sends Slack events runs its backend on it.
const handlerFailures: unknown[] = [];
type EventHandler = (ctx: MutationContext, envelope: EventCallback) => Promise<Handled>;
const events: Partial<Record<EventKind, EventHandler>> = Object.fromEntries(
  Object.entries(serviceRegistry.slack.events ?? {}).map(([kind, handler]) => [
    kind,
    async (ctx: MutationContext, envelope: EventCallback) => {
      try {
        return await (handler as EventHandler)(ctx, envelope);
      } catch (error) {
        handlerFailures.push(error);
        throw error;
      }
    },
  ]),
);
export const registry: Registry = { ...serviceRegistry, slack: { ...serviceRegistry.slack, events } };

// The front door's classification, for the events these ports send: the first kind whose test passes takes it.
function kindOf(event: SlackEvent): EventKind {
  if (event.type === "app_home_opened" && event.tab === "home") return "homeOpened";
  if (event.type === "team_join" || event.type === "user_change") return "memberChanged";
  if (event.type === "reaction_added") return "reactionAdded";
  return "message";
}

/**
 * A signed `event_callback` body through the front door, as today's `t.fetch("/slack/events", ...)`. While no domain
 * registered a handler for its kind, the front door would drop it unseen; today's convex/slack/events.ts takes it in,
 * so it reaches that module's stub instead. A handler's failure is thrown as itself.
 */
export async function slackEvent(t: TestBackend, body: string): Promise<void> {
  const { event } = JSON.parse(body) as { event: SlackEvent };
  if (!Object.hasOwn(events, kindOf(event))) void slackEvents.isHttp;
  const response = await t.send("/events", body);
  if (response.status !== 200) throw handlerFailures.pop() ?? new Error(`The front door answered ${response.status}`);
}

/** Today's `post`: a message event through the signed front door. */
export function post(t: TestBackend, blocks: RichElement[], options: MessageOptions = {}) {
  return slackEvent(t, messageEvent(blocks, options));
}

/** Today's `memberChanged`: a `team_join` or `user_change` event through the signed front door. */
export function memberChanged(t: TestBackend, ...event: Parameters<typeof memberEvent>) {
  return slackEvent(t, memberEvent(...event));
}

/** Today's `react`: a `reaction_added` event through the signed front door. */
export function react(t: TestBackend, options: ReactionOptions = {}) {
  return slackEvent(t, reactionEvent(options));
}

/** Today's App Home open: an `app_home_opened` event through the signed front door. */
export function homeOpened(t: TestBackend, user: string) {
  return slackEvent(t, appHomeOpened(user, { eventTime: new Date(t.clock.now()) }));
}

/** Today's `kudosReceived`: the kudos of every award to the person. */
export async function kudosReceived(t: TestBackend, user: string) {
  const member = (await t.seed.all("members")).find((row) => row.workspace === allowedWorkspace && row.user === user);
  if (member === undefined) return 0;
  return (await t.seed.all("awards")).filter(({ recipient }) => recipient === member._id).reduce((sum, award) => sum + award.kudos, 0);
}

/**
 * Today's `settleInTimeOrder`: settles, then moves the app's clock to the next pending job and settles again, so the
 * jobs scheduled for later run in time order, until nothing is pending.
 */
export async function settleInTimeOrder(t: TestBackend, maxSteps = 200): Promise<void> {
  for (let step = 0; step < maxSteps; step += 1) {
    await t.settle();
    const [next] = await t.query(({ tx }) => tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt)).limit(1));
    if (next === undefined) return;
    t.time.advance(Math.max(0, next.runAt - t.clock.now()));
  }
  throw new Error(`settleInTimeOrder: more than ${maxSteps} steps`);
}

/** Today's `vi.setSystemTime(at)` on the app's clock, which only moves forward: an earlier instant leaves it. */
export function setTime(t: TestBackend, at: number): void {
  t.time.advance(Math.max(0, at - t.clock.now()));
}

const tableNames = (Object.values(schema) as unknown[])
  .filter((table): table is PgTable => is(table, PgTable))
  .filter((table) => table !== jobs)
  .map((table) => getTableName(table) as TableName);

/** Every domain table's rows, as today's loop over `schema.tables`; the jobs, today's `_scheduled_functions`, apart. */
export async function everyTable(t: TestBackend): Promise<Record<string, Record<string, unknown>[]>> {
  const rows: Record<string, Record<string, unknown>[]> = {};
  for (const name of tableNames) rows[name] = (await t.seed.all(name)) as Record<string, unknown>[];
  return rows;
}

/** Today's `everythingWritten`: every table and every scheduled job. */
export async function everythingWritten(t: TestBackend) {
  const scheduled = await t.query(async ({ tx }) => (await tx.select().from(jobs).orderBy(asc(jobs._creationTime), asc(jobs._id))).map((row) => toDocument(jobs, row)));
  return { tables: await everyTable(t), scheduled };
}

/**
 * Today's second `testBackend()`, fresh and empty: the service's tests share one database per worker, so this empties
 * every table, the jobs among them, inside the test, then starts the next backend from `backend` (`useTestBackend`'s),
 * with its own fakes and its clock back at the start. The backend before it is done with.
 */
export async function aFreshBackend(t: TestBackend, backend: () => TestBackend): Promise<TestBackend> {
  await t.run(async ({ tx }) => {
    for (const table of [...tableNames, getTableName(jobs)]) await tx.delete(schemaTable(table));
  });
  return backend();
}

function schemaTable(name: string): PgTable {
  return (Object.values(schema) as unknown[]).find((table): table is PgTable => is(table, PgTable) && getTableName(table) === name)!;
}

// --- testing/fakePostHogCom.ts: the team pages the company copy sync reads ---

/** Routes posthog.com's team pages to a new fake, beside the backend's PostHog and Slack fakes. */
export function withPostHogCom(t: TestBackend): FakePostHogCom {
  const postHogCom = new FakePostHogCom();
  vi.stubGlobal(
    "fetch",
    routedFetch(t.postHog, (input, init) => (postHogCom.owns(new URL(input instanceof Request ? input.url : String(input))) ? postHogCom.fetch(input) : t.slack.fetch(input, init))),
  );
  return postHogCom;
}

/** Today's `t.action(internal.companyProfiles.sync.syncCompanyProfiles, {})`, then a settle. */
export async function syncTheCompanyCopy(t: TestBackend) {
  await t.operations.action("test.companyProfiles.sync", (ctx) => syncCompanyProfiles(ctx, {}));
  await t.settle();
}

// --- testing/unlocks.ts ---

/** Today's `unlocksShippedBeforeAnyoneJoined`. */
export async function unlocksShippedBeforeAnyoneJoined(t: TestBackend, workspace = allowedWorkspace) {
  await t.run((ctx) => unlocksLiveIn(ctx, workspace));
  return t;
}

/** Today's `bookShippedBeforeAnyoneJoined`: unlocks and achievements live in the workspace before anyone joined. */
export async function bookShippedBeforeAnyoneJoined(t: TestBackend, workspace = allowedWorkspace) {
  await unlocksShippedBeforeAnyoneJoined(t, workspace);
  await t.run((ctx) => achievementsLiveIn(ctx, workspace));
  await t.settle();
  return t;
}

/** Today's `reachesLevel`: the levelReached event's two subscribers, run as their jobs would. */
export async function reachesLevel(t: TestBackend, member: MemberId, level: number, at = t.clock.now()) {
  const message = { workspace: allowedWorkspace, conversation: "C1", message: `level-${level}-${member}` };
  const event = { type: "levelReached" as const, workspace: allowedWorkspace, member, level, skillPointsGained: 0, skillPoints: 0, xpToNextLevel: 200, message, at };
  await t.run((ctx) => makeReady(ctx, { event }));
  await t.run((ctx) => earnLevelUpHoggies(ctx, { event }));
}

/** Today's `opens`. */
export async function opens(t: TestBackend, member: MemberId, feature: Feature) {
  expect(await t.run((ctx) => openUnlock(ctx, member, feature, "slack"))).toBe("done");
}

// --- testing/hoggies.ts ---

/** Today's `holds`: the member holds a found copy of each hoggie. */
export async function holds(t: TestBackend, member: MemberId, ...hoggies: string[]) {
  for (const hoggie of hoggies) {
    const tally = (await t.seed.all("dropTallies")).find((row) => row.member === member);
    const n = (tally?.drops ?? 0) + 1;
    if (tally === undefined) await t.seed.insert("dropTallies", { member, drops: n });
    else await t.seed.patch("dropTallies", tally._id, { drops: n });
    const at = t.clock.now();
    const held = (await t.seed.all("hoggieTallies")).find((row) => row.member === member && row.hoggie === hoggie);
    const copy = (held?.count ?? 0) + 1;
    await t.seed.insert("drops", { member, crate: `test:held:${n}`, hoggie, rarity: hoggieNamed(hoggie)!.rarity, n, copy, catalogueVersion: catalogue.version, at, crest: null } as never);
    if (held === undefined) await t.seed.insert("hoggieTallies", { member, hoggie, count: copy, firstAt: at, firstN: n } as never);
    else await t.seed.patch("hoggieTallies", held._id, { count: copy } as never);
  }
}
