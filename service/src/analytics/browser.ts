// The module map's skeleton of convex/analytics/browser.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { Environment } from "./capture.ts";
import type { Flag } from "./flags.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const websiteAnalyticsFlag = { key: "website-analytics", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type BrowserIdentity = { token: string; host: string; distinctId: string; environment: Environment };

export async function browserIdentityOf(ctx: QueryContext, member: MemberId): Promise<BrowserIdentity | null> {
  throw notPorted("analytics.browser.browserIdentityOf");
}

export function configuredHost(): string | null {
  const host = (process.env.POSTHOG_HOST ?? "").trim();
  return isWebUrl(host) ? host : null;
}

function isWebUrl(text: string): boolean {
  if (!URL.canParse(text)) return false;
  const { protocol } = new URL(text);
  return protocol === "https:" || protocol === "http:";
}
