// The flags' definitions row: what PostHog's answer must hold to replace it, and its read and write in an operation's
// transaction. Nothing here reaches the network; only the refresh (refresh.ts) fetches.
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { flagDefinitions } from "../db/schema/index.ts";
import type { MutationContext, Transaction } from "../operations.ts";
import type { FlagDefinitions, PostHogFeatureFlag } from "./evaluator/types.ts";

const key = "posthog";

// What the evaluator relies on; any other field PostHog sends is kept for it as it came.
const property = z.looseObject({ key: z.string() });
const condition = z.looseObject({ properties: z.array(property).optional(), rollout_percentage: z.number().nullish(), variant: z.string().nullish() });
const flag = z.looseObject({
  key: z.string(),
  active: z.boolean(),
  filters: z
    .looseObject({
      groups: z.array(condition).optional(),
      multivariate: z.looseObject({ variants: z.array(z.looseObject({ key: z.string(), rollout_percentage: z.number() })) }).nullish(),
    })
    .optional(),
});
const answer = z.object({
  flags: z.array(flag),
  group_type_mapping: z.record(z.string(), z.string()).optional(),
  cohorts: z.record(z.string(), z.looseObject({ type: z.enum(["AND", "OR"]), values: z.array(z.unknown()) })).optional(),
  property_matching_version: z.number().optional(),
});

/** PostHog's answer as the evaluator takes it, or `null` when it isn't a valid one. */
export function parseDefinitions(body: unknown): FlagDefinitions | null {
  const parsed = answer.safeParse(body);
  if (!parsed.success) return null;
  const { flags, group_type_mapping = {}, cohorts = {}, property_matching_version } = parsed.data;
  return {
    flags: flags as unknown as PostHogFeatureFlag[],
    groupTypeMapping: group_type_mapping,
    cohorts: cohorts as FlagDefinitions["cohorts"],
    ...(property_matching_version !== undefined && { propertyMatchingVersion: property_matching_version }),
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

/** The stored definitions, or `null` before the first refresh. */
export async function readDefinitions(tx: Transaction): Promise<FlagDefinitions | null> {
  const [row] = await tx.select({ definitions: flagDefinitions.definitions }).from(flagDefinitions).where(eq(flagDefinitions.key, key));
  return row?.definitions ?? null;
}
