// The module map's skeleton of convex/website/browserAnalytics.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type BrowserIdentity } from "../analytics/browser.ts";

export type BrowserAnalytics = { kind: "off" } | ({ kind: "capture" } & BrowserIdentity);
