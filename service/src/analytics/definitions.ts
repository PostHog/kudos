// The flags' definitions row: what PostHog's answer must hold to replace it, and its read and write in an operation's
// transaction. Nothing here reaches the network; only the refresh (refresh.ts) fetches.
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { flagDefinitions, flagRefreshes } from "../db/schema/index.ts";
import type { MutationContext, QueryContext, Transaction } from "../operations.ts";
import type { FlagDefinitions, PostHogFeatureFlag } from "./evaluator/types.ts";

const key = "posthog";

// Every field the copied evaluator reads, with the type it reads it as: evaluator.ts, match-property.ts, and the
// @posthog/core functions they call (matchFeatureFlagProperty, getFeatureFlagVariant, resolveFeatureFlagPayload). One
// that fails refuses the whole answer, so the last good row stays: a malformed field, such as a string `negation`,
// would otherwise read as truthy and could turn a flag on. Any other field PostHog sends is kept as it came.
const percentage = z.number().min(0).max(100);
const scalar = z.union([z.string(), z.number(), z.boolean()]);
const property = z
  .looseObject({
    key: z.string(),
    type: z.string().nullish(),
    operator: z.string().nullish(),
    // Core's matcher also takes a list of booleans, as the flags service does. `is_set` and `is_not_set` read none.
    value: z.union([scalar, z.array(scalar)]).nullish(),
    negation: z.boolean().nullish(),
    dependency_chain: z.array(z.string()).optional(),
  })
  // A cohort tells a nested group from a property by a `values` field (match-property.ts, matchPropertyGroup).
  .refine((fields) => !("values" in fields))
  .refine((fields) => valueFits(fields.operator, fields.value));

// What each operator compares its value as (core's matchFeatureFlagProperty): a date or a pattern is one string, an
// order one string or number, set or unset nothing; the rest take a value or a list of them.
function valueFits(operator: string | null | undefined, value: unknown): boolean {
  if (operator === "is_set" || operator === "is_not_set") return true;
  if (value == null) return false;
  if (operator?.startsWith("is_date_") || operator === "regex" || operator === "not_regex") return typeof value === "string";
  if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") return typeof value === "string" || typeof value === "number";
  return true;
}
type Group = { type: "AND" | "OR"; values: Group[] | z.infer<typeof property>[] };
// A cohort's values are all groups or all properties: a mixed list would be read as whichever its first one is.
const group: z.ZodType<Group> = z.lazy(() => z.looseObject({ type: z.enum(["AND", "OR"]), values: z.union([z.array(group), z.array(property)]) }));
const condition = z.looseObject({
  properties: z.array(property).nullish(),
  rollout_percentage: percentage.nullish(),
  variant: z.string().nullish(),
  aggregation_group_type_index: z.number().int().nullish(),
});
const flag = z.looseObject({
  key: z.string(),
  active: z.boolean(),
  ensure_experience_continuity: z.boolean().nullish(),
  bucketing_identifier: z.enum(["distinct_id", "device_id", ""]).nullish(),
  filters: z
    .looseObject({
      aggregation_group_type_index: z.number().int().nullish(),
      groups: z.array(condition).nullish(),
      multivariate: z.looseObject({ variants: z.array(z.looseObject({ key: z.string(), rollout_percentage: percentage })) }).nullish(),
      payloads: z.record(z.string(), z.json()).nullish(),
    })
    .nullish(),
});
const answer = z.object({
  flags: z.array(flag),
  group_type_mapping: z.record(z.string(), z.string()).nullish(),
  cohorts: z.record(z.string(), group).nullish(),
  property_matching_version: z.number().nullish(),
});

/** PostHog's answer as the evaluator takes it, or `null` when it isn't a valid one. */
export function parseDefinitions(body: unknown): FlagDefinitions | null {
  const parsed = answer.safeParse(body);
  if (!parsed.success) return null;
  const { flags, group_type_mapping, cohorts, property_matching_version } = parsed.data;
  return {
    flags: flags as unknown as PostHogFeatureFlag[],
    groupTypeMapping: group_type_mapping ?? {},
    cohorts: (cohorts ?? {}) as FlagDefinitions["cohorts"],
    ...(property_matching_version != null && { propertyMatchingVersion: property_matching_version }),
  };
}

/**
 * Replaces the row when the definitions changed, and answers whether it did. Unchanged ones write nothing, so a
 * mutation that read the row never conflicts with a refresh that found nothing new.
 */
export async function storeDefinitions(ctx: MutationContext, definitions: FlagDefinitions, fetchedAt: number): Promise<boolean> {
  const written = await ctx.tx
    .insert(flagDefinitions)
    .values({ key, definitions, fetchedAt })
    .onConflictDoUpdate({
      target: flagDefinitions.key,
      set: { definitions, fetchedAt },
      setWhere: sql`${flagDefinitions.definitions} is distinct from excluded.definitions`,
    })
    .returning({ key: flagDefinitions.key });
  return written.length > 0;
}

/** What PostHog's empty answer stores: every flag unknown, so every decision its safe default. */
export const noDefinitions: FlagDefinitions = { flags: [], groupTypeMapping: {}, cohorts: {} };

/**
 * A good answer from PostHog: replaces the definitions when they changed, as `storeDefinitions`, and records the refresh
 * either way. Answers whether the definitions changed.
 */
export async function refreshDefinitions(ctx: MutationContext, definitions: FlagDefinitions): Promise<boolean> {
  const replaced = await storeDefinitions(ctx, definitions, ctx.now);
  await ctx.tx
    .insert(flagRefreshes)
    .values({ key, refreshedAt: ctx.now })
    .onConflictDoUpdate({ target: flagRefreshes.key, set: { refreshedAt: ctx.now } });
  return replaced;
}

/**
 * When the refresh last had a good answer, or `null` before the first. A definitions row with no refresh recorded,
 * such as one the load copied from today's component, was refreshed when it was fetched.
 */
export async function lastRefreshed(ctx: QueryContext): Promise<number | null> {
  const [refresh] = await ctx.tx.select({ at: flagRefreshes.refreshedAt }).from(flagRefreshes).where(eq(flagRefreshes.key, key));
  if (refresh !== undefined) return refresh.at;
  const [row] = await ctx.tx.select({ at: flagDefinitions.fetchedAt }).from(flagDefinitions).where(eq(flagDefinitions.key, key));
  return row?.at ?? null;
}

/** The stored definitions, or `null` before the first refresh. */
export async function readDefinitions(tx: Transaction): Promise<FlagDefinitions | null> {
  const [row] = await tx.select({ definitions: flagDefinitions.definitions }).from(flagDefinitions).where(eq(flagDefinitions.key, key));
  return row?.definitions ?? null;
}
