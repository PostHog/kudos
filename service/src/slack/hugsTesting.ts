// What the ported hug tests share, as today's testing/slackBackend.ts and testing/flags.ts gave them: the test backend
// set up as their `workspace()` set up Convex's, signed reactions and kudos through the front door, settling in time
// order, and reads of members, standings and stored rows. Time moves with the app's clock: the fixtures' timestamps
// read `Date.now()`, which follows the app's clock here.
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { eq, min } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";
import type { DomainEvent } from "../bus/events.ts";
import * as dataModel from "../db/schema/index.ts";
import type { TableName } from "../db/schema/index.ts";
import * as serviceTables from "../db/schema/service.ts";
import { jobs } from "../db/schema/service.ts";
import { NotPortedError, notPorted } from "../notPorted.ts";
import { achievementsLiveIn } from "../achievements/flag.ts";
import { unlocksLiveIn } from "../unlocks/launch.ts";
import { standingOf } from "../progression/progression.ts";
import { serviceRegistry } from "../registry.ts";
import type { EventKind } from "./frontDoor.ts";
import type { MemberId } from "../workspace/directory.ts";
import { setHugBudget as setHugBudgetOf } from "../workspace/settings.ts";
import { useTestBackend, type BackendOptions, type LogLine, type TestBackend } from "../../testing/backend.ts";
import type { Stack } from "../../testing/waiting.ts";
import { flagsFromPostHog, onForEveryone } from "../../testing/flags.ts";
import { flagsKey, postHogHost, projectToken, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { emoji, memberEvent, mention, messageEvent, reactionEvent, section, type MessageOptions, type ReactionOptions, type RichElement } from "../../testing/slackMessages.ts";

export const hourMs = 60 * 60 * 1000;

/**
 * The stacks a hug reaches: S4's reaction handler, S3's directory and settings, and the subscribers of `hugGiven` and
 * `hugReceived` whose bodies other stacks port: S5's welcome and welcome nudge, S6's hug rewards, S7's quests, S8's
 * hug finds, S9's tallies, S11's leaderboard hug counts and S14's analytics.
 */
export const reachedByAHug: [Stack, ...Stack[]] = ["S3", "S4", "S5", "S6", "S7", "S8", "S9", "S11", "S14"];

/** A reaction that is no hug still reaches S4's handler, S3's directory, S9's earned and hype emoji, and S6 for the XP read. */
export const reachedByAReaction: [Stack, ...Stack[]] = ["S3", "S4", "S6", "S9"];

export function slackTs(at: number) {
  return `${Math.floor(at / 1000)}.000100`;
}

/**
 * Call at the top of a test file: today's beforeEach and afterEach (Slack's settings, PostHog deciding in the sandbox,
 * `Date` at `now`), and a backend per test whose app clock starts at `Date.now()`: a test that sets the system time
 * before it starts its backend starts the app's clock there, as Convex's test backend followed the faked time.
 */
export function useHugsBackend(now: Date, options: Pick<BackendOptions, "registry"> = {}): () => TestBackend {
  const backend = useTestBackend(options);
  beforeEach(() => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
    vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
    vi.stubEnv("KUDOS_ENVIRONMENT", "sandbox");
    vi.stubEnv("POSTHOG_HOST", postHogHost);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  return () => backend({ now: Date.now() });
}

/** Today's `setWorkspaceSettings`: the workspace's row, written straight. */
export async function setWorkspaceSettings(t: TestBackend, settings: { kudosEmoji?: string; announcementChannel?: string }, workspace = "T1") {
  const row = (await t.seed.all("workspaces")).find((stored) => stored.workspace === workspace);
  if (row === undefined) await t.seed.insert("workspaces", { workspace, ...settings });
  else await t.seed.patch("workspaces", row._id, settings);
}

/** Today's `flagsOnForEveryone` then `flagsLoaded`: PostHog serves only these flags, on for everyone, and the app loads them. */
export async function flagsOn(t: TestBackend, flags: string[]) {
  return flagsLoaded(t, ...flags.map(onForEveryone));
}

/** PostHog serves only these definitions, and the app loads them as it does, the refresh job. */
export async function flagsLoaded(t: TestBackend, ...definitions: FlagDefinition[]) {
  await flagsFromPostHog(t.operations, t.postHog, ...definitions);
  return t;
}

/**
 * A reaction through the front door, signed by the app's clock. S4 registers the `reactionAdded` handler (4.5); until
 * then the front door acks a reaction and does nothing, so the step stops here.
 */
export async function react(t: TestBackend, options: ReactionOptions = {}) {
  return sentTo(t, "reactionAdded", "slack.reactions.reactionAdded", reactionEvent(options));
}

/** A message through the front door. S4 registers the `message` handler, the event pipeline. */
export async function post(t: TestBackend, blocks: RichElement[], options: MessageOptions = {}) {
  return sentTo(t, "message", "slack.processEvent.processEvent", messageEvent(blocks, options));
}

/** Today's `memberChanged`: a `team_join` or `user_change` through the front door. S3 registers `memberChanged`. */
export async function memberChanged(t: TestBackend, ...event: Parameters<typeof memberEvent>) {
  return sentTo(t, "memberChanged", "slack.directory.recordPerson", memberEvent(...event));
}

// A kind nobody registered is acked and dropped at the front door, which would let a test go on past a step that did
// nothing; it ends at the handler's stub instead, as a test that waits on its stack must. A registered handler that
// reaches another stack's stub answers 500 and logs only the error's class, so the step ends at a stub then too, not at
// a later assertion. The log names no request, and sends may run at once: a 500 ends at a stub only when every failure
// logged while it ran was a stub, so another request's stub never hides a real failure.
export async function sentTo(t: TestBackend, kind: EventKind, path: string, body: string) {
  if (!Object.hasOwn(serviceRegistry.slack.events ?? {}, kind)) throw notPorted(path);
  const logged = t.logs.length;
  const response = await t.send("/events", body);
  const failure = failureOf(response.status, t.logs.slice(logged), path);
  if (failure !== null) throw failure;
  return response;
}

/**
 * Sends that run at once, as today's tests ran them with `Promise.all`: every one settles first, so a send that ends at a
 * stub early can't hide a real failure another logs later. A real failure ends the step ahead of any stub.
 */
export async function atOnce<Results extends readonly unknown[]>(sends: { [Index in keyof Results]: Promise<Results[Index]> }): Promise<Results> {
  const settled = await Promise.allSettled(sends);
  const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  // A rejection is read by its result, never by its reason, which may be any value, undefined among them.
  const real = rejected.find(({ reason }) => !(reason instanceof NotPortedError));
  if (real !== undefined) throw real.reason;
  if (rejected.length > 0) throw rejected[0]!.reason;
  return settled.map((result) => (result as PromiseFulfilledResult<unknown>).value) as unknown as Results;
}

/** What a send ends in: `null` when it answered, a stub's `NotPortedError`, or the real failure logged while it ran. */
export function failureOf(status: number, loggedWhileItRan: readonly LogLine[], path: string): Error | null {
  if (status !== 500) return null;
  const failures = loggedWhileItRan.filter(({ message }) => message === "slack request failed");
  const real = failures.find(({ fields }) => fields.error !== "NotPortedError");
  if (real !== undefined) return new Error(`The front door answered 500 while ${String(real.fields.error)} failed a request`);
  return failures.length > 0 ? notPorted(`a stub behind ${path}`) : null;
}

export async function kudosMessage(t: TestBackend, giver: string, recipients: string[], ts: string) {
  await post(t, [section(...recipients.map((user) => mention(user)), emoji("taco"))], { user: giver, ts });
  await settle(t);
}

/**
 * Today's `settle`: runs every job, a later one once the clock gets there, in time order, until none is left. The app's
 * clock and `Date` move to each later job's time.
 */
export async function settle(t: TestBackend) {
  for (let fired = 0; fired < 10_000; fired += 1) {
    await t.settle();
    const [row] = await t.query(({ tx }) => tx.select({ next: min(jobs.runAt) }).from(jobs).where(eq(jobs.state, "pending")));
    if (row?.next == null) return;
    moveTo(t, row.next);
  }
  throw new Error("settle: more than 10,000 jobs fell due");
}

/** Today's `vi.setSystemTime`: the app's clock and `Date` both move to `at`, forward only. */
export function moveTo(t: TestBackend, at: number) {
  if (at > t.clock.now()) t.time.advance(at - t.clock.now());
  vi.setSystemTime(t.clock.now());
}

export async function memberOf(t: TestBackend, user: string, workspace = "T1"): Promise<MemberId | null> {
  const rows = (await t.seed.all("members")).filter((row) => row.workspace === workspace && row.user === user);
  if (rows.length > 1) throw new Error(`unique() query returned more than one result from table members:`);
  return rows[0]?._id ?? null;
}

export async function xpOf(t: TestBackend, user: string) {
  const member = await memberOf(t, user);
  return member === null ? 0 : (await t.query((ctx) => standingOf(ctx, member))).xp;
}

/** The domain events committed operations published, as today's tests recorded `publish`'s argument: without the fact. */
export async function factsOf<Type extends DomainEvent["type"]>(t: TestBackend, type: Type): Promise<Array<Extract<DomainEvent, { type: Type }>>> {
  const published = (await t.published()).filter((event) => event.type === type).map(({ fact: _, ...event }) => event);
  return published as Array<Extract<DomainEvent, { type: Type }>>;
}

/** Today's `unlocksShippedBeforeAnyoneJoined`: unlocks live in the workspace before anyone joined. */
export async function unlocksShippedBeforeAnyoneJoined(t: TestBackend, workspace = "T1") {
  await t.run((ctx) => unlocksLiveIn(ctx, workspace));
  return t;
}

/** Today's `bookShippedBeforeAnyoneJoined`: unlocks and achievements live before anyone joined. */
export async function bookShippedBeforeAnyoneJoined(t: TestBackend, workspace = "T1") {
  await unlocksShippedBeforeAnyoneJoined(t, workspace);
  await t.run((ctx) => achievementsLiveIn(ctx, workspace));
  await settle(t);
  return t;
}

/**
 * A step today's tests expected to be refused: answers the refusal, and rethrows a stub's `NotPortedError` instead, so a
 * waiting test ends at the stub rather than at an assertion about its message.
 */
export async function refusalOf(step: Promise<unknown>): Promise<Error> {
  try {
    await step;
  } catch (error) {
    if (error instanceof NotPortedError || !(error instanceof Error)) throw error;
    return error;
  }
  throw new Error("The step was expected to be refused, and went through");
}

/** Today's `setHugBudget`: the operator's internal mutation, S3's. */
export async function setHugBudget(t: TestBackend, args: { workspace: string; hugBudget: number }): Promise<void> {
  await t.run((ctx) => setHugBudgetOf(ctx, args));
}

const serviceOwned = new Set((Object.values(serviceTables) as unknown[]).filter((table): table is PgTable => is(table, PgTable)).map(getTableName));

/** The data model's tables, the ones Convex held; the service's own (jobs, crons, receipts' bookkeeping) are not. */
export const dataModelTables: TableName[] = (Object.values(dataModel) as unknown[])
  .filter((table): table is PgTable => is(table, PgTable))
  .map((table) => getTableName(table) as TableName)
  .filter((table) => !serviceOwned.has(table));

/** Today's `everythingStored`: every row of the data model, table by table in creation order. */
export async function everythingStored(t: TestBackend, { except = [] }: { except?: string[] } = {}): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const table of dataModelTables.filter((table) => !except.includes(table))) rows.push(...((await t.seed.all(table)) as Array<Record<string, unknown>>));
  return rows;
}

