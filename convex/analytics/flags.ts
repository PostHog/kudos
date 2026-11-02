import { PostHog } from "@posthog/convex";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { chatUserOf, emailOf, type MemberId } from "../workspace/directory";
import { captureSettings, environmentSetting } from "./capture";
import { failuresLogged } from "./failures";
import { existingWorkspaceKey, record, workspaceKeyOf } from "./outbox";
import { analyticsIdOf, existingAnalyticsId, recordAnalyticsId } from "./person";

type FlagValue = string | boolean;

export type Flag<V extends FlagValue> = { key: string; safeDefault: V; values: readonly V[] };

type Subject = { distinctId: string; email?: string };

export const flagSeamCheck = { key: "kudos-flag-seam-check", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

const postHog = new PostHog(components.posthog);

export function memberDecision<V extends FlagValue>(ctx: QueryCtx | MutationCtx, read: Flag<V>, member: MemberId): Promise<V> {
  return evaluated(ctx, read, () => memberSubject(ctx, member));
}

export function memberDecisionWithoutWriting<V extends FlagValue>(ctx: QueryCtx | MutationCtx, read: Flag<V>, member: MemberId): Promise<V> {
  return evaluated(ctx, read, () => existingMemberSubject(ctx, member));
}

type DecisionToKeep<V> = { value: V; keep: () => Promise<void> };

export async function memberDecisionBeforeWriting<V extends FlagValue>(ctx: MutationCtx, read: Flag<V>, member: MemberId): Promise<DecisionToKeep<V>> {
  const existing = await existingAnalyticsId(ctx, member);
  const analyticsId = existing ?? crypto.randomUUID();
  const value = await evaluated(ctx, read, async () => ({ distinctId: analyticsId, email: await emailOf(ctx, member) }));
  const keep = async () => {
    if (existing === null) await recordAnalyticsId(ctx, member, analyticsId);
  };
  return { value, keep };
}

export function workspaceDecision<V extends FlagValue>(ctx: QueryCtx | MutationCtx, read: Flag<V>, workspace: string): Promise<V> {
  return evaluated(ctx, read, () => workspaceSubject(ctx, workspace));
}

export function workspaceDecisionWithoutWriting<V extends FlagValue>(ctx: QueryCtx | MutationCtx, read: Flag<V>, workspace: string): Promise<V> {
  return evaluated(ctx, read, () => existingWorkspaceSubject(ctx, workspace));
}

async function memberSubject(ctx: QueryCtx | MutationCtx, member: MemberId): Promise<Subject | null> {
  if (!canWrite(ctx)) return existingMemberSubject(ctx, member);
  return { distinctId: await analyticsIdOf(ctx, member), email: await emailOf(ctx, member) };
}

async function existingMemberSubject(ctx: QueryCtx, member: MemberId): Promise<Subject | null> {
  const analyticsId = await existingAnalyticsId(ctx, member);
  if (analyticsId === null) return existingWorkspaceSubject(ctx, (await chatUserOf(ctx, member)).workspace);
  return { distinctId: analyticsId, email: await emailOf(ctx, member) };
}

async function workspaceSubject(ctx: QueryCtx | MutationCtx, workspace: string): Promise<Subject | null> {
  if (!canWrite(ctx)) return existingWorkspaceSubject(ctx, workspace);
  return { distinctId: await workspaceKeyOf(ctx, workspace) };
}

async function existingWorkspaceSubject(ctx: QueryCtx, workspace: string): Promise<Subject | null> {
  const workspaceKey = await existingWorkspaceKey(ctx, workspace);
  return workspaceKey === null ? null : { distinctId: workspaceKey };
}

async function evaluated<V extends FlagValue>(ctx: QueryCtx | MutationCtx, read: Flag<V>, subjectOf: () => Promise<Subject | null>): Promise<V> {
  if (!flagsKeySet()) return read.safeDefault;
  try {
    const subject = await subjectOf();
    if (subject === null) return read.safeDefault;
    const value = await postHog.getFeatureFlag(readingDefinitionsOnce(ctx), { key: read.key, distinctId: subject.distinctId, personProperties: personPropertiesOf(subject) });
    return declaredValue(read, value);
  } catch {
    console.warn("analytics.flag_not_evaluated", { flag: read.key });
    return read.safeDefault;
  }
}

type DefinitionsReader = Parameters<PostHog["getFeatureFlag"]>[0];

const definitionsReaders = new WeakMap<QueryCtx, DefinitionsReader>();

function readingDefinitionsOnce(ctx: QueryCtx): DefinitionsReader {
  const known = definitionsReaders.get(ctx);
  if (known !== undefined) return known;
  let definitions: Promise<unknown> | undefined;
  const reader: DefinitionsReader = { runQuery: (reference, args) => (definitions ??= ctx.runQuery(reference, args)) };
  definitionsReaders.set(ctx, reader);
  return reader;
}

export async function exposed<V extends FlagValue>(ctx: MutationCtx, read: Flag<V>, member: MemberId, value: NoInfer<V>): Promise<void> {
  await exposureRecorded(ctx, { member, flag: read.key, value });
}

export async function exposedApart<V extends FlagValue>(ctx: MutationCtx, read: Flag<V>, member: MemberId, value: NoInfer<V>): Promise<void> {
  if (!exposuresRecorded()) return;
  await ctx.scheduler.runAfter(0, internal.analytics.flags.recordExposure, { member, flag: read.key, value });
}

const exposureValidator = { member: v.id("members"), flag: v.string(), value: v.union(v.string(), v.boolean()) };

type Exposure = { member: MemberId; flag: string; value: FlagValue };

export const recordExposure = internalMutation({
  args: exposureValidator,
  handler: (ctx, exposure): Promise<void> => failuresLogged("analytics.exposure_not_recorded", () => exposureRecorded(ctx, exposure), { flag: exposure.flag }),
});

async function exposureRecorded(ctx: MutationCtx, exposure: Exposure): Promise<void> {
  if (!exposuresRecorded()) return;
  const { member, flag, value } = exposure;
  const earlier = await ctx.db
    .query("flagExposures")
    .withIndex("by_member_flag_value", (q) => q.eq("member", member).eq("flag", flag).eq("value", value))
    .unique();
  if (earlier !== null) return;
  await ctx.db.insert("flagExposures", exposure);
  const { workspace } = await chatUserOf(ctx, member);
  await record(ctx, workspace, [
    {
      event: "$feature_flag_called",
      subject: { member },
      at: Date.now(),
      properties: { feature_flag: flag, feature_flag_response: value, locally_evaluated: true },
    },
  ]);
}

export const seamCheck = internalQuery({
  args: { member: v.id("members") },
  returns: v.boolean(),
  handler: (ctx, { member }) => memberDecision(ctx, flagSeamCheck, member),
});

function exposuresRecorded() {
  return captureSettings() !== null && flagsKeySet();
}

function flagsKeySet() {
  return (process.env.POSTHOG_PERSONAL_API_KEY ?? "").trim() !== "";
}

function canWrite(ctx: QueryCtx | MutationCtx): ctx is MutationCtx {
  return "insert" in ctx.db;
}

function personPropertiesOf({ email }: Subject) {
  const environment = environmentSetting();
  return { ...(environment === null ? {} : { environment }), ...(email === undefined ? {} : { email }) };
}

function declaredValue<V extends FlagValue>(read: Flag<V>, value: unknown): V {
  return read.values.find((declared) => declared === value) ?? read.safeDefault;
}
