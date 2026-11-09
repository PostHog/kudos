// The feature flag seam, as today's convex/analytics/flags.ts: a flag is declared once with its key, values and safe
// default, and answered for a member (on their analytics ID, with the person properties environment and email) or for
// a workspace (on its key, with environment only). Each answer is evaluated locally on the operation's snapshot of
// the stored definitions, read at most once per attempt through its own transaction; nothing here reaches the network,
// and anything that can't be evaluated answers the safe default.
import { and, eq } from "drizzle-orm";
import { encodeStored } from "../db/codec.ts";
import type { Id } from "../db/columns.ts";
import { fromDocument } from "../db/documents.ts";
import { flagExposures, members } from "../db/schema/index.ts";
import { errorFields, jsonLog } from "../log.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import { captureSettings, environmentSetting, flagsKey } from "./capture.ts";
import { readDefinitions } from "./definitions.ts";
import { LocalFeatureFlagEvaluator } from "./evaluator/evaluator.ts";
import { existingWorkspaceKey, record, workspaceKeyOf } from "./outbox.ts";
import { analyticsIdOf, existingAnalyticsId, recordAnalyticsId } from "./person.ts";

type FlagValue = string | boolean;
type MemberId = Id<"members">;

export type Flag<V extends FlagValue> = { key: string; safeDefault: V; values: readonly V[] };

type Subject = { distinctId: string; email?: string };

export const flagSeamCheck = { key: "kudos-flag-seam-check", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

const log = jsonLog();

/** In a mutation, makes the member's analytics ID if they have none; in a query, as `memberDecisionWithoutWriting`. */
export function memberDecision<V extends FlagValue>(ctx: QueryContext | MutationContext, flag: Flag<V>, member: MemberId): Promise<V> {
  return evaluated(ctx, flag, async () => (canWrite(ctx) ? { distinctId: await analyticsIdOf(ctx, member), ...(await emailOf(ctx, member)) } : existingMemberSubject(ctx, member)));
}

/** A member without an analytics ID gets the workspace decision without writing. */
export function memberDecisionWithoutWriting<V extends FlagValue>(ctx: QueryContext, flag: Flag<V>, member: MemberId): Promise<V> {
  return evaluated(ctx, flag, () => existingMemberSubject(ctx, member));
}

/** Decides on the member's analytics ID, or on a new one that `keep` records; without `keep`, nothing is written. */
export async function memberDecisionBeforeWriting<V extends FlagValue>(ctx: MutationContext, flag: Flag<V>, member: MemberId): Promise<{ value: V; keep: () => Promise<void> }> {
  const existing = await existingAnalyticsId(ctx, member);
  const analyticsId = existing ?? crypto.randomUUID();
  const value = await evaluated(ctx, flag, async () => ({ distinctId: analyticsId, ...(await emailOf(ctx, member)) }));
  return { value, keep: async () => void (existing === null && (await recordAnalyticsId(ctx, member, analyticsId))) };
}

/** In a mutation, makes the workspace's key if it has none; in a query, as `workspaceDecisionWithoutWriting`. */
export function workspaceDecision<V extends FlagValue>(ctx: QueryContext | MutationContext, flag: Flag<V>, workspace: string): Promise<V> {
  return evaluated(ctx, flag, async () => (canWrite(ctx) ? { distinctId: await workspaceKeyOf(ctx, workspace) } : existingWorkspaceSubject(ctx, workspace)));
}

/** A workspace without a key gets the safe default. */
export function workspaceDecisionWithoutWriting<V extends FlagValue>(ctx: QueryContext, flag: Flag<V>, workspace: string): Promise<V> {
  return evaluated(ctx, flag, () => existingWorkspaceSubject(ctx, workspace));
}

/** Records the member's exposure to the flag's value once per member, flag and value, while capture and flags are on. */
export async function exposed<V extends FlagValue>(ctx: MutationContext, flag: Flag<V>, member: MemberId, value: NoInfer<V>): Promise<void> {
  if (captureSettings() === null || flagsKey() === null) return;
  const stored = encodeStored(value);
  const [earlier] = await ctx.tx
    .select({ _id: flagExposures._id })
    .from(flagExposures)
    .where(and(eq(flagExposures.member, member), eq(flagExposures.flag, flag.key), eq(flagExposures.value, stored)))
    .limit(1);
  if (earlier !== undefined) return;
  const row = fromDocument(flagExposures, { ...ctx.newRow(), member, flag: flag.key, value });
  await ctx.tx.insert(flagExposures).values(row as typeof flagExposures.$inferInsert);
  const { workspace } = await directoryRowOf(ctx, member);
  const properties = { feature_flag: flag.key, feature_flag_response: value, locally_evaluated: true };
  await record(ctx, workspace, [{ event: "$feature_flag_called", subject: { member }, at: ctx.now, properties }]);
}

async function evaluated<V extends FlagValue>(ctx: QueryContext, flag: Flag<V>, subjectOf: () => Promise<Subject | null>): Promise<V> {
  if (flagsKey() === null) return flag.safeDefault;
  try {
    const subject = await subjectOf();
    if (subject === null) return flag.safeDefault;
    const evaluator = await snapshotOf(ctx.tx);
    if (evaluator === null) return flag.safeDefault;
    const environment = environmentSetting();
    const personProperties = { ...(environment !== null && { environment }), ...(subject.email !== undefined && { email: subject.email }) };
    const value = await evaluator.getFeatureFlag(flag.key, subject.distinctId, {}, personProperties);
    return flag.values.find((declared) => declared === value) ?? flag.safeDefault;
  } catch (error) {
    log.error("flag not evaluated", { flag: flag.key, ...errorFields(error) });
    return flag.safeDefault;
  }
}

// The definitions each attempt read, by its transaction: a mutation's retry gets a new transaction, so it reads again
// and never decides on its losing attempt's snapshot.
const snapshots = new WeakMap<Transaction, Promise<LocalFeatureFlagEvaluator | null>>();

function snapshotOf(tx: Transaction): Promise<LocalFeatureFlagEvaluator | null> {
  let snapshot = snapshots.get(tx);
  if (snapshot === undefined) {
    snapshot = readDefinitions(tx).then((definitions) => definitions && new LocalFeatureFlagEvaluator(definitions));
    snapshots.set(tx, snapshot);
  }
  return snapshot;
}

async function existingMemberSubject(ctx: QueryContext, member: MemberId): Promise<Subject | null> {
  const analyticsId = await existingAnalyticsId(ctx, member);
  if (analyticsId === null) return existingWorkspaceSubject(ctx, (await directoryRowOf(ctx, member)).workspace);
  return { distinctId: analyticsId, ...(await emailOf(ctx, member)) };
}

async function existingWorkspaceSubject(ctx: QueryContext, workspace: string): Promise<Subject | null> {
  const workspaceKey = await existingWorkspaceKey(ctx, workspace);
  return workspaceKey === null ? null : { distinctId: workspaceKey };
}

// Today's workspace/directory reads (`chatUserOf`, `emailOf`), until the workspace stack owns them.
async function directoryRowOf(ctx: QueryContext, member: MemberId) {
  const [row] = await ctx.tx.select({ workspace: members.workspace, kind: members.kind, email: members.email }).from(members).where(eq(members._id, member));
  if (row === undefined) throw new Error("no such member in the directory");
  return row;
}

async function emailOf(ctx: QueryContext, member: MemberId): Promise<{ email?: string }> {
  const [row] = await ctx.tx.select({ kind: members.kind, email: members.email }).from(members).where(eq(members._id, member));
  return row?.kind === "member" && row.email !== null ? { email: row.email } : {};
}

function canWrite(ctx: QueryContext | MutationContext): ctx is MutationContext {
  return "newRow" in ctx;
}
