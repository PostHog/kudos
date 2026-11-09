// The flags' definitions refresh, the one place that fetches them: an action job outside every operation, run every
// minute by its cron as today's PostHog component runs its refresh loop. A valid answer replaces the row; a failure,
// a timeout or an invalid body keeps the last good one, logged without the key or the body.
import { z } from "zod";
import { actionJob } from "../jobs/define.ts";
import { errorFields, jsonLog, type Log } from "../log.ts";
import { flagsKey, postHogHost } from "./capture.ts";
import { parseDefinitions, storeDefinitions } from "./definitions.ts";

export function createFlagsRefresh({ log = jsonLog(), timeoutMs = 10_000 }: { log?: Log; timeoutMs?: number } = {}) {
  return actionJob("analytics.flags.refresh", z.object({}), async ({ clock, run }) => {
    const token = process.env.POSTHOG_PROJECT_TOKEN;
    const key = flagsKey();
    if (!token || !key) return; // no key: every decision is its safe default
    const host = postHogHost().replace(/\/$/, "");
    const kept = (fields: Record<string, string | number>) => log.error("flag definitions kept", fields);
    let body: unknown;
    try {
      const response = await fetch(`${host}/flags/definitions?token=${encodeURIComponent(token)}&send_cohorts`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return kept({ reason: "status", status: response.status });
      }
      body = await response.json();
    } catch (error) {
      return kept({ reason: "failed", ...errorFields(error) });
    }
    const definitions = parseDefinitions(body);
    if (definitions === null) return kept({ reason: "invalid" });
    const fetchedAt = clock.now();
    const replaced = await run.mutation("analytics.flags.store", (ctx) => storeDefinitions(ctx, definitions, fetchedAt));
    log.info("flag definitions refreshed", { flags: definitions.flags.length, replaced });
  });
}

export const flagsRefresh = createFlagsRefresh();
