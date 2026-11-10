// Links into the website: a page's URL for a workspace, the origin a member's link opens at (the page, or the sign-in
// entry while the website is open to them alone), and the front door's links for App Home. Today's
// convex/website/link.ts.
import { periodValidator } from "../leaderboard/periods.ts";
import { perkValidator } from "../progression/tree.ts";
import { signInWorkspace } from "../slack/signIn.ts";
import type { Feature } from "../unlocks/feature.ts";
import { scheduled } from "../unlocks/schedule.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import { websiteOpen, websiteOpenTo } from "./flag.ts";
import { settingsSectionsShownTo } from "./settings.ts";
import { crateTargetValidator, homePanelValidator, listedPageOf, settingsSectionValidator, signInEntry, urlOf, type Page } from "./routes.ts";
import { openFeaturesOf } from "./unlockPath.ts";
import { visitSourceValidator, type VisitSource } from "./visitSource.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { QueryContext } from "../operations.ts";

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
export async function websiteLinkOf(ctx: QueryContext, { workspace, page, source }: z.infer<typeof websiteLinkOfArgs>): Promise<null | string> {
  return websiteLink(ctx, workspace, page, source);
}

export async function websiteLink(ctx: QueryContext, workspace: string, page: Page, source: VisitSource): Promise<string | null> {
  const origin = await websiteOrigin(ctx, workspace);
  return origin === null ? null : urlOf(origin, page, source);
}

export const frontDoorLinksOfArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function frontDoorLinksOf(ctx: QueryContext, { workspace, user }: z.infer<typeof frontDoorLinksOfArgs>): Promise<FrontDoorLinks | null> {
  const person = await lookup(ctx, workspace, user);
  const me = person?.kind === "member" ? { workspace, user, member: person.member } : undefined;
  const origin = await websiteOriginFor(ctx, workspace, me?.member);
  if (origin === null) return null;
  const open = me === undefined ? [] : await openFeaturesOf(ctx, me);
  const pages = open.flatMap((feature) => listedLinkOf(origin, feature));
  const sections = me === undefined ? [] : await settingsSectionsShownTo(ctx, me);
  return { origin, pages, sections };
}

export async function websiteOriginFor(ctx: QueryContext, workspace: string, member: MemberId | undefined): Promise<string | null> {
  const site = siteOriginFor(workspace);
  if (site === null) return null;
  const door = await doorFor(ctx, member);
  if (door === null) return null;
  return door === "page" ? site : `${site}${signInEntry}`;
}

type Door = "page" | "sign-in";

async function doorFor(ctx: QueryContext, member: MemberId | undefined): Promise<Door | null> {
  const workspaceOpen = await websiteOpen(ctx);
  if (member === undefined) return workspaceOpen ? "page" : null;
  if (!(await websiteOpenTo(ctx, member))) return null;
  return workspaceOpen ? "page" : "sign-in";
}

function listedLinkOf(origin: string, feature: Feature) {
  const page = listedPageOf(feature);
  return page === null ? [] : [{ label: scheduled(feature).name, url: urlOf(origin, page, "app-home") }];
}

export async function websiteOrigin(ctx: QueryContext, workspace: string): Promise<string | null> {
  const origin = siteOriginFor(workspace);
  if (origin === null) return null;
  return (await websiteOpen(ctx)) ? origin : null;
}

export function siteOriginFor(workspace: string) {
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
  return site === "" || workspace !== signInWorkspace() ? null : site;
}
