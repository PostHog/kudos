// Today's testing/slackBackend.ts helpers for message flows over the service's test backend: a message posted, edited
// or deleted through the front door, and what it gave and stored.
//
// The front door answers a failure with 500 and logs only the error's class, so a message that reaches a stub not
// ported yet would fail a ported test without saying which. When the front door's last failure is a `NotPortedError`,
// these replay the same envelope through the registered message handler, in a mutation of its own, which throws that
// stub's error for `waitsOn`; the failed request rolled back, so the replay starts from the same state.
import { asc, eq, getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema/index.ts";
import { jobs, type Doc, type TableName } from "../src/db/schema/index.ts";
import { notPorted } from "../src/notPorted.ts";
import { serviceRegistry } from "../src/registry.ts";
import type { EventCallback } from "../src/slack/frontDoor.ts";
import type { TestBackend } from "./backend.ts";
import type { Signing } from "./signedSlack.ts";
import {
  messageChangedEvent,
  messageDeletedEvent,
  memberEvent,
  messageEvent,
  threadParentDeletedEvent,
  type DeletionOptions,
  type EditOptions,
  type MessageOptions,
  type RichElement,
} from "./slackMessages.ts";

/** Sends a signed `event_callback` body to `/slack/events`, and throws the stub a failure reached, if it reached one. */
export async function sendEvent(t: TestBackend, body: string, signing: Signing = {}): Promise<Response> {
  const logged = t.logs.length;
  const response = await t.send("/events", body, signing);
  if (response.status === 500 && t.logs.slice(logged).some(({ level, fields }) => level === "error" && fields.error === "NotPortedError")) {
    const message = serviceRegistry.slack.events?.message;
    if (message) await t.run((ctx) => message(ctx, JSON.parse(body) as EventCallback));
  }
  return response;
}

export const post = (t: TestBackend, blocks: RichElement[], options: MessageOptions = {}) => sendEvent(t, messageEvent(blocks, options));
export const edit = (t: TestBackend, blocks: RichElement[], options: EditOptions = {}) => sendEvent(t, messageChangedEvent(blocks, options));
export const deleteMessage = (t: TestBackend, options: DeletionOptions = {}) => sendEvent(t, messageDeletedEvent(options));
export const deleteThreadParent = (t: TestBackend, options: DeletionOptions = {}) => sendEvent(t, threadParentDeletedEvent(options));

/** The workspace's kudos emoji and announcement channel, as an admin sets them. */
export async function setWorkspaceSettings(t: TestBackend, settings: { kudosEmoji?: string; announcementChannel?: string }, workspace = "T1"): Promise<void> {
  const row = (await t.seed.all("workspaces")).find((existing) => existing.workspace === workspace);
  if (row) await t.seed.patch("workspaces", row._id, settings);
  else await t.seed.insert("workspaces", { workspace, ...settings });
}

/** The awards a member of T1 received, in the order they were given. */
export async function awardsTo(t: TestBackend, user: string): Promise<Array<Doc<"awards">>> {
  const member = (await t.seed.all("members")).find((row) => row.workspace === "T1" && row.user === user);
  if (member === undefined) return [];
  return (await t.seed.all("awards")).filter((award) => award.recipient === member._id);
}

export async function kudosReceived(t: TestBackend, user: string): Promise<number> {
  return (await awardsTo(t, user)).reduce((sum, award) => sum + award.kudos, 0);
}

// The service's own tables, which Convex kept outside its documents: jobs (its scheduler), crons, files, the archive
// and the flag definitions.
const serviceTables: ReadonlySet<string> = new Set(["archive", "files", "jobs", "crons", "flagDefinitions", "flagRefreshes"]);
const domainTables = (Object.values(schema) as unknown[])
  .filter((table): table is PgTable => is(table, PgTable))
  .filter((table) => !serviceTables.has(getTableName(table)))
  .sort((one, other) => getTableName(one).localeCompare(getTableName(other)));

/** Every row of every domain table, in a stable order, as today's `everythingStored` lists Convex's documents. */
export async function everythingStored(t: TestBackend, { except = [] }: { except?: TableName[] } = {}): Promise<unknown[]> {
  const tables = domainTables.filter((table) => !(except as string[]).includes(getTableName(table)));
  return t.query(async ({ tx }) => {
    const rows = [];
    for (const table of tables) {
      const columns = getTableColumns(table);
      const order = [columns._creationTime, columns._id].filter((column) => column !== undefined).map((column) => asc(column));
      rows.push(...(await tx.select().from(table).orderBy(...order)).map((row) => ({ table: getTableName(table), ...row })));
    }
    return rows;
  });
}

/**
 * A `team_join` or `user_change` event through the front door. Until S3 registers the directory's handler, the front
 * door would answer it and change nothing, so a test that relies on it ends here in that handler's stub instead.
 */
export async function memberChanged(t: TestBackend, ...event: Parameters<typeof memberEvent>): Promise<Response> {
  if (serviceRegistry.slack.events?.memberChanged === undefined) throw notPorted("slack.events.memberChanged");
  return t.send("/events", memberEvent(...event));
}

async function nextJobAt(t: TestBackend): Promise<number | null> {
  const [next] = await t.query(({ tx }) => tx.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.state, "pending")).orderBy(asc(jobs.runAt)).limit(1));
  return next?.runAt ?? null;
}

/**
 * Today's `settleInTimeOrder`: runs what is due, then moves the app's clock to the next pending job and runs again, in
 * time order, until nothing is pending or the next job is after `until`, where the clock then stops.
 */
export async function settleInTimeOrder(t: TestBackend, { until = Infinity, maxSteps = 10_000 } = {}): Promise<void> {
  for (let step = 0; step < maxSteps; step += 1) {
    await settledWithin(t);
    const next = await nextJobAt(t);
    if (next === null || next > until) {
      if (Number.isFinite(until) && until > t.clock.now()) {
        t.time.advance(until - t.clock.now());
        await settledWithin(t);
      }
      return;
    }
    if (next > t.clock.now()) t.time.advance(next - t.clock.now());
  }
  throw new Error(`settleInTimeOrder: more than ${maxSteps} steps`);
}

/** One settle of the worker, which must end with nothing due or running: an answer cut off by its budget fails the test. */
async function settledWithin(t: TestBackend): Promise<void> {
  const { done, ran } = await t.settle();
  if (!done) throw new Error(`settle ran out of its budget with jobs still due or running, after running ${ran.join(", ") || "nothing"}`);
}

/** Today's `settle`, which runs every scheduled function, those due later included, as convex-test's fake timers did. */
export const settle = (t: TestBackend) => settleInTimeOrder(t);

/** Today's `settleUntil`: runs every job due up to that instant, and leaves the app's clock there. */
export const settleUntil = (t: TestBackend, until: Date) => settleInTimeOrder(t, { until: until.getTime() });

/** A Slack message timestamp of that instant, as Slack writes one. */
export function slackTs(at: Date): string {
  return `${Math.floor(at.getTime() / 1000)}.000100`;
}
