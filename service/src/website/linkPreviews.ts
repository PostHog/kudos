// The module map's skeleton of convex/website/linkPreviews.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import { type Medal } from "../profileCard/profileCard.ts";
import { type MemberId } from "../workspace/directory.ts";
import { type PersonStats, type TeamStats } from "./linkCardStats.ts";
import { linkFrom, visitSourceValidator, type VisitSource } from "./visitSource.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const linkPreviewsFlag = { key: "link-previews", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const richLinkCardsFlag = { key: "rich-link-cards", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type PersonPreview = { kind: "person"; url: string; page: string; name: string; picture: string | null; teams: string[]; level: number | null; medals: Medal[]; stats?: PersonStats };

export type TeamPreview = { kind: "team"; url: string; page: string; name: string; picture: string | null; people: number; stats?: TeamStats };

export type LinkPreview = PersonPreview | TeamPreview;

const bookPath = "/book";

export function linkPreviewsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("website.linkPreviews.linkPreviewsShownTo");
}

export const linkPreviewsOfArgs = z.strictObject({ workspace: z.string(), sharer: z.string(), links: z.array(z.string()) });
export async function linkPreviewsOf(ctx: QueryContext, args: z.infer<typeof linkPreviewsOfArgs>): Promise<(PersonPreview | TeamPreview)[]> {
  throw notPorted("website.linkPreviews.linkPreviewsOf");
}

export const personCardOfArgs = z.strictObject({ workspace: z.string(), person: zv.id("members"), source: visitSourceValidator });
export async function personCardOf(ctx: QueryContext, args: z.infer<typeof personCardOfArgs>): Promise<null | PersonPreview> {
  throw notPorted("website.linkPreviews.personCardOf");
}

export function personPageOf(origin: string, person: MemberId, source: VisitSource) {
  return pageUrlOf(origin, "people", person, source);
}

export const emojisUnlockedOfArgs = z.strictObject({ workspace: z.string(), person: zv.id("members") });
export async function emojisUnlockedOf(ctx: QueryContext, args: z.infer<typeof emojisUnlockedOfArgs>): Promise<number> {
  throw notPorted("website.linkPreviews.emojisUnlockedOf");
}

function pageUrlOf(origin: string, section: "people" | "teams", key: string, source: VisitSource) {
  return linkFrom(source, `${origin}${bookPath}#${section}/${encodeURIComponent(key)}`);
}
