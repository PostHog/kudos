// The website's browser analytics, as today's convex/website/browserAnalytics.ts: `getBrowserAnalytics` is today's member
// query `website.browserAnalytics.getBrowserAnalytics`, a plain read handler `(ctx, me, args)` with its argument shape.
import { browserIdentityOf, websiteAnalyticsFlag, type BrowserIdentity } from "../analytics/browser.ts";
import { memberDecisionWithoutWriting } from "../analytics/flags.ts";
import type { QueryContext } from "../operations.ts";
import type { VerifiedMember } from "./memberQuery.ts";

export type BrowserAnalytics = { kind: "off" } | ({ kind: "capture" } & BrowserIdentity);

const off: BrowserAnalytics = { kind: "off" };

export const getBrowserAnalyticsArgs = {};

export async function getBrowserAnalytics(ctx: QueryContext, me: VerifiedMember): Promise<BrowserAnalytics> {
  if (!(await memberDecisionWithoutWriting(ctx, websiteAnalyticsFlag, me.member))) return off;
  const identity = await browserIdentityOf(ctx, me.member);
  return identity === null ? off : { kind: "capture", ...identity };
}
