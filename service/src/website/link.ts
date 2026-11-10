// The module map's skeleton of convex/website/link.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { periodValidator } from "../leaderboard/periods.ts";
import { perkValidator } from "../progression/tree.ts";
import { signInWorkspace } from "../slack/signIn.ts";
import type { MemberId } from "../workspace/directory.ts";
import { crateTargetValidator, homePanelValidator, settingsSectionValidator, type Page } from "./routes.ts";
import { visitSourceValidator, type VisitSource } from "./visitSource.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

const crate = z.optional(crateTargetValidator);

export const pageValidator = z.union([
  z.strictObject({ page: z.literal("home"), panel: z.optional(homePanelValidator), crate }),
  z.strictObject({ page: z.literal("leaderboard"), period: periodValidator, crate }),
  z.strictObject({ page: z.literal("quests"), quest: z.optional(zv.number()), crate }),
  z.strictObject({ page: z.literal("skillTree"), perk: z.optional(perkValidator), crate }),
  z.strictObject({ page: z.literal("book"), crate }),
  z.strictObject({ page: z.literal("bookEarned"), crate }),
  z.strictObject({ page: z.literal("bookCollection"), crate }),
  z.strictObject({ page: z.literal("settings"), section: z.optional(settingsSectionValidator) }),
  z.strictObject({ page: z.literal("levelUp"), level: zv.number() }),]
);

const frontDoorLinksValidator = z.strictObject({ origin: z.string(), pages: z.array(z.strictObject({ label: z.string(), url: z.string() })), sections: z.array(settingsSectionValidator) });

export type FrontDoorLinks = z.infer<typeof frontDoorLinksValidator>;

export const websiteLinkOfArgs = z.strictObject({ workspace: z.string(), page: pageValidator, source: visitSourceValidator });
export async function websiteLinkOf(ctx: QueryContext, args: z.infer<typeof websiteLinkOfArgs>): Promise<null | string> {
  throw notPorted("website.link.websiteLinkOf");
}

export async function websiteLink(ctx: QueryContext, workspace: string, page: Page, source: VisitSource): Promise<string | null> {
  throw notPorted("website.link.websiteLink");
}

export const frontDoorLinksOfArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function frontDoorLinksOf(ctx: QueryContext, args: z.infer<typeof frontDoorLinksOfArgs>): Promise<null | { sections: ("workspace" | "admin" | "group" | "visibility" | "messages" | "company-profile")[]; origin: string; pages: { url: string; label: string }[] }> {
  throw notPorted("website.link.frontDoorLinksOf");
}

export async function websiteOriginFor(ctx: QueryContext, workspace: string, member: MemberId | undefined): Promise<string | null> {
  throw notPorted("website.link.websiteOriginFor");
}

export async function websiteOrigin(ctx: QueryContext, workspace: string): Promise<string | null> {
  throw notPorted("website.link.websiteOrigin");
}

export function siteOriginFor(workspace: string) {
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
  return site === "" || workspace !== signInWorkspace() ? null : site;
}
