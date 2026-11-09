// The flags' definitions refresh, the one place that fetches them: an action job outside every operation, run every
// minute by its cron as today's PostHog component runs its refresh loop. It answers each status as the component's
// refreshFlagDefinitions does (@posthog/convex 2.1.5, src/component/lib.ts): a valid 200 replaces the row; a 402, over
// quota, clears it; PostHog's empty-cache 503, which is also what it answers once every flag is deleted, clears it when
// no good answer came in the last five minutes; anything else, a timeout or an invalid body keeps the last good row.
// Each is logged without the key or the body.
import { z } from "zod";
import { actionJob } from "../jobs/define.ts";
import { errorFields, jsonLog, type Log } from "../log.ts";
import { flagsKey, postHogHost } from "./capture.ts";
import { lastRefreshed, noDefinitions, parseDefinitions, refreshDefinitions } from "./definitions.ts";

/** How long the component keeps definitions while PostHog answers that its cache is empty. */
export const staleAfterMs = 5 * 60 * 1000;

export function createFlagsRefresh({ log = jsonLog(), timeoutMs = 10_000 }: { log?: Log; timeoutMs?: number } = {}) {
  return actionJob("analytics.flags.refresh", z.object({}), async ({ run }) => {
    const token = process.env.POSTHOG_PROJECT_TOKEN;
    const key = flagsKey();
    if (!token || !key) return; // no key: every decision is its safe default
    const host = postHogHost().replace(/\/$/, "");
    const kept = (fields: Record<string, string | number>) => log.error("flag definitions kept", fields);
    // What PostHog answered: a body to check, or an answer that clears the definitions.
    let answer: { body: unknown } | { clears: "quota" | "empty cache"; status: number };
    try {
      const response = await fetch(`${host}/flags/definitions?token=${encodeURIComponent(token)}&send_cohorts`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const { status } = response;
      if (status === 200) answer = { body: await response.json() };
      else if (status === 503 && (await response.text()).toLowerCase().includes("required data not found in cache")) answer = { clears: "empty cache", status };
      else {
        await response.body?.cancel().catch(() => {});
        if (status !== 402) return kept({ reason: "status", status });
        answer = { clears: "quota", status };
      }
    } catch (error) {
      return kept({ reason: "failed", ...errorFields(error) });
    }
    if ("clears" in answer) {
      const { clears, status } = answer;
      const clearedNow = await run.mutation("analytics.flags.clear", async (ctx) => {
        if (clears === "empty cache") {
          const last = await lastRefreshed(ctx);
          if (last !== null && ctx.now - last <= staleAfterMs) return false; // recent ones stay while PostHog's cache warms
        }
        await refreshDefinitions(ctx, noDefinitions);
        return true;
      });
      return clearedNow ? log.info("flag definitions cleared", { reason: clears, status }) : kept({ reason: "status", status });
    }
    const definitions = parseDefinitions(answer.body);
    if (definitions === null) return kept({ reason: "invalid" });
    const replaced = await run.mutation("analytics.flags.store", (ctx) => refreshDefinitions(ctx, definitions));
    log.info("flag definitions refreshed", { flags: definitions.flags.length, replaced });
  });
}

export const flagsRefresh = createFlagsRefresh();
