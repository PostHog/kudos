// The module map's skeleton of convex/feedback/deepLinks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { listed, urlOf, type Page } from "../website/routes.ts";
import { type VisitSource, type Website } from "../website/visitSource.ts";
import { openTheWebsite } from "./naming.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type DeepLink = { url: string; label: string };

type Destination = { page: Page; label: string };

const home: Page = { page: "home" };

export const deepLinks = {
  successReply: { page: home, label: "See your progress on the web" },
  welcome: { page: home, label: "See your progress" },
  levelReached: { page: home, label: "See your level on the web" },
  featuresShipped: { page: home, label: "See what's ready on the web" },
  tiersEarned: { page: { page: "bookEarned" }, label: "See what you earned on the web" },
} satisfies Record<string, Destination>;

export function levelUpRevealOf(level: number): Destination {
  return { page: { page: "levelUp", level }, label: "Reveal your three new hoggies" };
}

export async function deepLinkOf(ctx: QueryContext, workspace: string, destination: Destination, source: VisitSource): Promise<DeepLink | null> {
  throw notPorted("feedback.deepLinks.deepLinkOf");
}

export function deepLinkFrom(website: Website | null, { page, label }: Destination): DeepLink | null {
  if (website === null) return null;
  return { url: urlOf(website.origin, page, website.source), label: listed(page) ? label : openTheWebsite };
}
