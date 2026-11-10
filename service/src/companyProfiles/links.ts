// A member's own link to their company profile, as today's convex/companyProfiles/links.ts.
import { and, eq } from "drizzle-orm";
import { fromDocument, toDocument } from "../db/documents.ts";
import type { Doc } from "../db/schema/index.ts";
import { companyProfileLinks } from "../db/schema/companyProfiles.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { chatUserOf, type MemberId } from "../workspace/directory.ts";
import { companyFaceOfProfile, type CompanyFace } from "./faces.ts";
import { companyProfilesIn, publicNameOf, type CompanyProfile, type CompanyProfiles, type MatchedBy } from "./matcher.ts";
import { keepCompanyFacesLater } from "./storedFaces.ts";
import { companyTeamsOf } from "./teams.ts";
import { unique } from "../db/unique.ts";

export type ProfileChoice = { profile: number; name: string; role: string | null; teams: string[]; face: CompanyFace | null };

export type CompanyProfileSetting = { mine: ProfileChoice | null; by: MatchedBy | null; choices: ProfileChoice[] };

export type SelfLinkRefusal = "matched" | "taken" | "unknown";

export type SelfLinkOutcome = { kind: "linked"; profile: number | null } | { kind: "refused"; reason: SelfLinkRefusal; profile: number | null };

export async function companyProfileSettingOf(ctx: QueryContext, member: MemberId): Promise<CompanyProfileSetting> {
  const { workspace } = await chatUserOf(ctx, member);
  const { profiles, matches, holders } = await companyProfilesIn(ctx, workspace);
  const choiceOf = await choicesFrom(ctx);
  const mine = matches.get(member);
  const free = profiles.filter(({ profile }) => (holders.get(profile) ?? member) === member);
  return { mine: mine?.profile ? choiceOf(mine.profile) : null, by: mine?.by ?? null, choices: free.map(choiceOf).sort(byName) };
}

export async function linkMyCompanyProfile(ctx: MutationContext, member: MemberId, profile: number | null): Promise<SelfLinkOutcome> {
  const { workspace } = await chatUserOf(ctx, member);
  const link = await linkOf(ctx, workspace, member, "self");
  const clearsOwnLink = profile === null && link !== null;
  const refusal = clearsOwnLink ? null : refusalOf(await companyProfilesIn(ctx, workspace), member, profile);
  if (refusal !== null) return { kind: "refused", reason: refusal, profile };
  if (profile === null && link !== null) await deleteLink(ctx, link);
  else if (profile !== null && link === null) await insertLink(ctx, { workspace, member, profile, by: "self", setBy: member, at: ctx.now });
  else if (profile !== null && link !== null && link.profile !== profile) await writeLink(ctx, { ...link, profile, at: ctx.now });
  await keepCompanyFacesLater(ctx, workspace);
  return { kind: "linked", profile };
}

function refusalOf({ profiles, matches, holders }: CompanyProfiles, member: MemberId, profile: number | null): SelfLinkRefusal | null {
  const mine = matches.get(member);
  if (mine !== undefined && mine.by !== "self") return "matched";
  if (profile === null) return null;
  if (!profiles.some((each) => each.profile === profile)) return "unknown";
  return (holders.get(profile) ?? member) === member ? null : "taken";
}

export async function choicesFrom(ctx: QueryContext): Promise<(profile: CompanyProfile) => ProfileChoice> {
  const teamNames = new Map((await companyTeamsOf(ctx)).map(({ team, name }) => [team, name]));
  return (companyProfile) => ({
    profile: companyProfile.profile,
    name: publicNameOf(companyProfile),
    role: companyProfile.role ?? null,
    teams: companyProfile.teams.flatMap((team) => teamNames.get(team) ?? []),
    face: companyFaceOfProfile(companyProfile),
  });
}

export function byName(one: ProfileChoice, other: ProfileChoice) {
  return one.name.localeCompare(other.name) || one.profile - other.profile;
}

type Link = Doc<"companyProfileLinks">;

/** The member's link of one kind, one at most, as Convex's `unique()` asked. */
export async function linkOf(ctx: QueryContext, workspace: string, member: MemberId, by: Link["by"]): Promise<Link | null> {
  const rows = await ctx.tx
    .select()
    .from(companyProfileLinks)
    .where(and(eq(companyProfileLinks.workspace, workspace), eq(companyProfileLinks.member, member), eq(companyProfileLinks.by, by)))
    .limit(2);
  const row = unique("companyProfileLinks", rows);
  return row ? toDocument<Link>(companyProfileLinks, row) : null;
}

export async function insertLink(ctx: MutationContext, link: Omit<Link, "_id" | "_creationTime">): Promise<void> {
  await ctx.tx.insert(companyProfileLinks).values(fromDocument(companyProfileLinks, { ...ctx.newRow(), ...link }) as typeof companyProfileLinks.$inferInsert);
}

/** Writes the whole link back, as Convex's patch kept every other field. */
export async function writeLink(ctx: MutationContext, link: Link): Promise<void> {
  await ctx.tx.update(companyProfileLinks).set(fromDocument(companyProfileLinks, link)).where(eq(companyProfileLinks._id, link._id));
}

export async function deleteLink(ctx: MutationContext, link: Link): Promise<void> {
  await ctx.tx.delete(companyProfileLinks).where(eq(companyProfileLinks._id, link._id));
}
