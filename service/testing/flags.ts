// The fixture driver for flag definitions, as today's testing/flags.ts: a test says what PostHog serves, then loads it
// the way the app does, through the refresh job, or stores it straight in the definitions row through the operation
// runner. A service started as a real process loads the same way: its POSTHOG_HOST is the fakes' server, which serves
// production's flags at the pause (e2e/fakes/productionFlags.ts), and the rig runs the `analytics.flags.refresh` cron
// through `/testing/time` before the first journey and after each switch.
import { vi } from "vitest";
import { parseDefinitions, storeDefinitions } from "../src/analytics/definitions.ts";
import { flagsRefresh } from "../src/analytics/refresh.ts";
import type { Operations } from "../src/operations.ts";
import { FakePostHog, flagsKey, postHogHost, projectToken, routedFetch, type FlagDefinition } from "./fakePostHog.ts";

export const onForEveryone = (key: string): FlagDefinition => ({ key, filters: { groups: [{ properties: [], rollout_percentage: 100 }] } });

export const offForEveryone = (key: string): FlagDefinition => ({ key, filters: { groups: [{ properties: [], rollout_percentage: 0 }] } });

export const onInTheSandboxOnly = (key: string): FlagDefinition => ({
  key,
  filters: { groups: [{ properties: [{ key: "environment", type: "person", value: ["sandbox"], operator: "exact" }], rollout_percentage: 100 }] },
});

export const onForEmails = (key: string, ...emails: string[]): FlagDefinition => ({
  key,
  filters: { groups: [{ properties: [{ key: "email", type: "person", value: emails, operator: "exact" }], rollout_percentage: 100 }] },
});

export const variantForEveryone = (key: string, variant: string): FlagDefinition => ({
  key,
  filters: { groups: [{ properties: [], rollout_percentage: 100 }], multivariate: { variants: [{ key: variant, rollout_percentage: 100 }] } },
});

export const onForPercent = (key: string, rollout_percentage: number): FlagDefinition => ({ key, filters: { groups: [{ properties: [], rollout_percentage }] } });

/**
 * Sets the analytics settings, flags key included, and routes every fetch to a fake PostHog serving `definitions`;
 * any other fetch fails. Undo with `vi.unstubAllEnvs()` and `vi.unstubAllGlobals()`.
 */
export function postHogDeciding(environment: "sandbox" | "production" = "sandbox", ...definitions: FlagDefinition[]): FakePostHog {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", projectToken);
  vi.stubEnv("POSTHOG_PERSONAL_API_KEY", flagsKey);
  vi.stubEnv("KUDOS_ENVIRONMENT", environment);
  vi.stubEnv("POSTHOG_HOST", postHogHost);
  const postHog = new FakePostHog().withFlags(...definitions);
  vi.stubGlobal("fetch", routedFetch(postHog, () => Promise.reject(new Error("no network in tests"))));
  return postHog;
}

/** Serves the definitions from the fake and loads them as the app does: the refresh job, as an action. */
export async function flagsFromPostHog(operations: Operations, postHog: FakePostHog, ...definitions: FlagDefinition[]): Promise<void> {
  postHog.withFlags(...definitions);
  await operations.action("test.flags.refresh", (ctx) => flagsRefresh.handler(ctx, {}));
}

/** Stores what the fake would serve straight in the definitions row, through the runner: no fetch and no key. */
export async function definitionsStored(operations: Operations, ...definitions: FlagDefinition[]): Promise<void> {
  const parsed = parseDefinitions(new FakePostHog().withFlags(...definitions).definitionsBody());
  if (parsed === null) throw new Error("The fixture's definitions are not ones PostHog would serve");
  await operations.mutation("test.flags.store", (ctx) => storeDefinitions(ctx, parsed, ctx.now));
}
