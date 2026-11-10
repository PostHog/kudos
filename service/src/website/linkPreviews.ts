// Link previews: the cards Slack unfurls for links to a person's or a team's page in the book, plain or rich by the
// sharer's flags, and a person's card for the profile card command. Today's convex/website/linkPreviews.ts; its internal
// queries are plain query bodies here.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { memberDecisionWithoutWriting, workspaceDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import { earnedEmojiCountOf } from "../album/earnedEmojis.ts";
import { personTeamsOf } from "../album/personPage.ts";
import { storedCompanyFaceOf } from "../companyProfiles/storedFaces.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { companyTeams, type Doc } from "../db/schema/index.ts";
import { profileCardOf, type Medal } from "../profileCard/profileCard.ts";
import { isAPersonOf, lookup, nameAndPictureOf, type MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { zv } from "../values.ts";
import { cardReadsOf, personStatsOf, teamStatsOf, type CardReads, type PersonStats, type TeamStats } from "./linkCardStats.ts";
import { siteOriginFor } from "./link.ts";
import { linkFrom, visitSourceValidator, type VisitSource } from "./visitSource.ts";

export const linkPreviewsFlag = { key: "link-previews", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export const richLinkCardsFlag = { key: "rich-link-cards", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export type PersonPreview = { kind: "person"; url: string; page: string; name: string; picture: string | null; teams: string[]; level: number | null; medals: Medal[]; stats?: PersonStats };

export type TeamPreview = { kind: "team"; url: string; page: string; name: string; picture: string | null; people: number; stats?: TeamStats };

export type LinkPreview = PersonPreview | TeamPreview;

type LinkedPage = { kind: "person"; person: string } | { kind: "team"; team: string };

type Unfolding = CardReads & { rich: boolean; source: VisitSource };

const bookPath = "/book";

export function linkPreviewsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return memberDecisionWithoutWriting(ctx, linkPreviewsFlag, member);
}

export const linkPreviewsOfArgs = z.strictObject({ workspace: z.string(), sharer: z.string(), links: z.array(z.string()) });
export async function linkPreviewsOf(ctx: QueryContext, { workspace, sharer, links }: z.infer<typeof linkPreviewsOfArgs>): Promise<LinkPreview[]> {
  const origin = siteOriginFor(workspace);
  if (origin === null || !(await sharerDecisionOf(ctx, workspace, sharer, linkPreviewsFlag))) return [];
  const unfolding = { ...cardReadsOf(ctx, workspace, origin), rich: await sharerDecisionOf(ctx, workspace, sharer, richLinkCardsFlag), source: "link-card" as const };
  const previews: LinkPreview[] = [];
  for (const url of links) {
    const preview = await previewOf(ctx, unfolding, url);
    if (preview !== null) previews.push(preview);
  }
  return previews;
}

export const personCardOfArgs = z.strictObject({ workspace: z.string(), person: zv.id("members"), source: visitSourceValidator });
export async function personCardOf(ctx: QueryContext, { workspace, person, source }: z.infer<typeof personCardOfArgs>): Promise<PersonPreview | null> {
  const origin = siteOriginFor(workspace);
  if (origin === null) return null;
  return personPreviewOf(ctx, { ...cardReadsOf(ctx, workspace, origin), rich: true, source }, personPageOf(origin, person, source), person);
}

export function personPageOf(origin: string, person: MemberId, source: VisitSource) {
  return pageUrlOf(origin, "people", person, source);
}

export const emojisUnlockedOfArgs = z.strictObject({ workspace: z.string(), person: zv.id("members") });
export async function emojisUnlockedOf(ctx: QueryContext, { workspace, person }: z.infer<typeof emojisUnlockedOfArgs>): Promise<number> {
  return earnedEmojiCountOf(ctx, workspace, person);
}

async function sharerDecisionOf(ctx: QueryContext, workspace: string, user: string, flag: Flag<boolean>) {
  const sharer = await lookup(ctx, workspace, user);
  if (sharer?.kind === "member") return memberDecisionWithoutWriting(ctx, flag, sharer.member);
  return workspaceDecisionWithoutWriting(ctx, flag, workspace);
}

async function previewOf(ctx: QueryContext, unfolding: Unfolding, url: string): Promise<LinkPreview | null> {
  const linked = pageLinkedBy(url, unfolding.origin);
  if (linked === null) return null;
  return linked.kind === "person" ? personPreviewOf(ctx, unfolding, url, linked.person) : teamPreviewOf(ctx, unfolding, url, linked.team);
}

function pageLinkedBy(url: string, origin: string): LinkedPage | null {
  const address = addressOrNull(url);
  if (address === null || address.origin !== new URL(origin).origin || address.pathname !== bookPath) return null;
  const [section, key, ...rest] = address.hash.replace(/^#/, "").split("/");
  const decoded = key === undefined || rest.length > 0 ? null : decodedOrNull(key);
  if (!decoded) return null;
  if (section === "people") return { kind: "person", person: decoded };
  return section === "teams" ? { kind: "team", team: decoded } : null;
}

async function personPreviewOf(ctx: QueryContext, unfolding: Unfolding, url: string, key: string): Promise<PersonPreview | null> {
  const { workspace, origin, rich, source } = unfolding;
  // Convex's `normalizeId` refused a key that was no members ID; one no member has is no person of the workspace here.
  const person = key as MemberId;
  if (!(await isAPersonOf(ctx, workspace, person))) return null;
  const { name, level, medals } = await profileCardOf(ctx, person, { own: false, viewer: null });
  const teams = await personTeamsOf(ctx, workspace, person);
  const preview: PersonPreview = { kind: "person", url, page: pageUrlOf(origin, "people", person, source), name, picture: await pictureOf(ctx, workspace, person), teams: teams.map((team) => team.name), level, medals };
  return rich ? { ...preview, stats: await personStatsOf(ctx, unfolding, person, level, teams) } : preview;
}

async function pictureOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<string | null> {
  const companyFace = await storedCompanyFaceOf(ctx, workspace, person);
  return companyFace?.image ?? (await nameAndPictureOf(ctx, person)).picture;
}

async function teamPreviewOf(ctx: QueryContext, unfolding: Unfolding, url: string, key: string): Promise<TeamPreview | null> {
  const team = await companyTeamOf(ctx, key);
  if (team === null) return null;
  const { origin, rich, source } = unfolding;
  const preview: TeamPreview = { kind: "team", url, page: pageUrlOf(origin, "teams", team.team, source), name: team.name, picture: team.crestImage ?? null, people: team.people.length };
  return rich ? { ...preview, stats: await teamStatsOf(unfolding, team) } : preview;
}

const byTeam = indexOrder(companyTeams, ["team"]);

/** The first `companyTeams` row of the team, as `.first()` on `by_team` read it. */
async function companyTeamOf(ctx: QueryContext, team: string) {
  const [row] = await ctx.tx.select().from(companyTeams).where(eq(companyTeams.team, team)).orderBy(...byTeam.orderBy()).limit(1);
  return row === undefined ? null : toDocument<Doc<"companyTeams">>(companyTeams, row);
}

function pageUrlOf(origin: string, section: "people" | "teams", key: string, source: VisitSource) {
  return linkFrom(source, `${origin}${bookPath}#${section}/${encodeURIComponent(key)}`);
}

function addressOrNull(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function decodedOrNull(key: string) {
  try {
    return decodeURIComponent(key);
  } catch {
    return null;
  }
}
