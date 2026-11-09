// The outbox's write API, as today's convex/analytics/outbox.ts: product events and exceptions become pending rows in
// the caller's transaction, so they commit or roll back with it. Sending them is the drain's (S14), which `wakeDrain`
// wakes without reading or writing anything of the drain's.
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Id } from "../db/columns.ts";
import { fromDocument } from "../db/documents.ts";
import { analyticsOutbox, workspaceKeys, type Doc } from "../db/schema/index.ts";
import { actionJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { captureSettings, nativeErrorReportingOn, type Capture } from "./capture.ts";
import { analyticsIdOf } from "./person.ts";

const taxonomyVersion = 1;

export type Properties = Record<string, string | number | boolean>;

/** A product event on a member, at the instant it happened. */
export type ProductEvent = { event: string; subject: { member: Id<"members"> }; at: number; properties: Properties };

export type Exception = NonNullable<Doc<"analyticsOutbox">["exception"]>;

export type FailedFunction = { path: string; kind: "http" | "action" | "mutation" };

/** Records the events with the workspace's shared properties; with capture off, nothing, not even an ID or a key. */
export async function record(ctx: MutationContext, workspace: string, events: ProductEvent[]): Promise<void> {
  const capture = captureSettings();
  if (capture === null) return;
  const shared = await sharedPropertiesOf(ctx, capture, workspace);
  for (const { event, subject, at, properties } of events) {
    const distinctId = await analyticsIdOf(ctx, subject.member);
    await insertPending(ctx, { event, distinctId, timestamp: at, properties: { ...properties, ...shared } });
  }
  await wakeDrain(ctx);
}

export async function sharedPropertiesOf(ctx: MutationContext, capture: Capture, workspace: string): Promise<Properties> {
  return { environment: capture.environment, workspace_key: await workspaceKeyOf(ctx, workspace), taxonomy_version: taxonomyVersion };
}

/** Records an error nobody caught as one $exception under the deployment; `false` when it records nothing. */
export async function recordException(ctx: MutationContext, failed: FailedFunction, exception: Exception, at: number): Promise<boolean> {
  const capture = captureSettings();
  if (capture === null || nativeErrorReportingOn()) return false;
  const keys = await ctx.tx.select({ workspaceKey: workspaceKeys.workspaceKey }).from(workspaceKeys).limit(2);
  const properties: Properties = {
    environment: capture.environment,
    ...(keys.length === 1 && { workspace_key: keys[0]!.workspaceKey }),
    taxonomy_version: taxonomyVersion,
    function_path: failed.path,
    function_kind: failed.kind,
  };
  await insertPending(ctx, { event: "$exception", distinctId: `deployment:${capture.environment}`, timestamp: at, properties, exception });
  await wakeDrain(ctx);
  return true;
}

/** The workspace's key, made the first time it is needed. */
export async function workspaceKeyOf(ctx: MutationContext, workspace: string): Promise<string> {
  const existing = await existingWorkspaceKey(ctx, workspace);
  if (existing !== null) return existing;
  const workspaceKey = randomUUID();
  await ctx.tx.insert(workspaceKeys).values({ ...ctx.newRow(), workspace, workspaceKey });
  return workspaceKey;
}

/** The oldest key stored for the workspace, or `null`. */
export async function existingWorkspaceKey(ctx: QueryContext, workspace: string): Promise<string | null> {
  const [row] = await ctx.tx
    .select({ workspaceKey: workspaceKeys.workspaceKey })
    .from(workspaceKeys)
    .where(eq(workspaceKeys.workspace, workspace))
    .orderBy(asc(workspaceKeys._creationTime), asc(workspaceKeys._id))
    .limit(1);
  return row?.workspaceKey ?? null;
}

type Pending = Pick<Doc<"analyticsOutbox">, "event" | "distinctId" | "timestamp" | "properties" | "exception">;

async function insertPending(ctx: MutationContext, row: Pending): Promise<void> {
  const document = { ...ctx.newRow(), uuid: randomUUID(), ...row, state: "pending", failures: 0, dueAt: ctx.now };
  await ctx.tx.insert(analyticsOutbox).values(fromDocument(analyticsOutbox, document) as typeof analyticsOutbox.$inferInsert);
}

/**
 * The drain, S14's to fill: it claims the due pending rows `FOR UPDATE SKIP LOCKED`, exits at once when another drain
 * holds them, and sends them. Until then it does nothing, and the rows wait.
 */
export const drain = actionJob("analytics.drain.drain", z.object({}), async () => {});

/**
 * Wakes the drain once the caller commits: a job row and the jobs channel's notification, both insert-only. Today's
 * read the drain's row, its job and the pending rows in the caller's transaction, so requests conflicted with a drain
 * claiming the outbox and ran out of retries; a request here never touches them.
 */
async function wakeDrain(ctx: MutationContext): Promise<void> {
  await ctx.jobs.enqueue(drain, {});
}
