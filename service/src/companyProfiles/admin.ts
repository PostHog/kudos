// An admin's matching of members to company profiles, as today's convex/companyProfiles/admin.ts.
import { and, asc, eq } from "drizzle-orm";
import { toDocument } from "../db/documents.ts";
import type { Doc } from "../db/schema/index.ts";
import { companyProfileLinks } from "../db/schema/companyProfiles.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { peopleIn, personFactsOf, type MemberId } from "../workspace/directory.ts";
import { byName, choicesFrom, deleteLink, insertLink, linkOf, writeLink, type ProfileChoice } from "./links.ts";
import { companyProfilesIn, currentProfiles, type MatchedBy } from "./matcher.ts";
import { keepCompanyFacesLater } from "./storedFaces.ts";

export type MemberMatch = { member: MemberId; name: string; profile: number | null; by: MatchedBy | null };

export type HeldProfile = ProfileChoice & { heldBy: MemberId | null; by: MatchedBy | null };

export type WorkspaceMatches = { members: MemberMatch[]; profiles: HeldProfile[] };

export type AdminLinkTarget = number | "none" | null;

export type AdminLinkRefusal = "not-admin" | "unknown";

export type AdminLinkOutcome = { kind: "linked"; member: MemberId } | { kind: "refused"; reason: AdminLinkRefusal; member: MemberId | null };

type Caller = { member: MemberId; admin: boolean };

export async function workspaceMatchesOf(ctx: QueryContext, workspace: string): Promise<WorkspaceMatches> {
  const { profiles, matches, holders } = await companyProfilesIn(ctx, workspace);
  const people = await peopleIn(ctx, workspace);
  const choiceOf = await choicesFrom(ctx);
  const members = [...people].flatMap(([member, { name, former }]) => {
    if (former) return [];
    const match = matches.get(member);
    return [{ member, name: name ?? "", profile: match?.profile?.profile ?? null, by: match?.by ?? null }];
  });
  const held = profiles.map((profile) => {
    const holder = holders.get(profile.profile) ?? null;
    return { ...choiceOf(profile), heldBy: holder, by: holder === null ? null : matches.get(holder)!.by };
  });
  return { members: members.sort(memberByName), profiles: held.sort(byName) };
}

export async function linkCompanyProfile(ctx: MutationContext, workspace: string, caller: Caller, member: MemberId | null, profile: AdminLinkTarget): Promise<AdminLinkOutcome> {
  if (!caller.admin) return { kind: "refused", reason: "not-admin", member };
  if (member === null || !(await isCurrentMemberOf(ctx, workspace, member)) || !(await isKnownProfile(ctx, profile))) return { kind: "refused", reason: "unknown", member };
  const link = await adminLinkOf(ctx, workspace, member);
  if (profile === null) {
    if (link !== null) await deleteLink(ctx, link);
    await keepCompanyFacesLater(ctx, workspace);
    return { kind: "linked", member };
  }
  const linked = profile === "none" ? null : profile;
  if (linked !== null) await deleteOtherAdminLinksTo(ctx, workspace, linked, member);
  const change = { profile: linked, setBy: caller.member, at: ctx.now };
  if (link === null) await insertLink(ctx, { workspace, member, by: "admin", ...change });
  else if (link.profile !== linked) await writeLink(ctx, { ...link, ...change });
  await keepCompanyFacesLater(ctx, workspace);
  return { kind: "linked", member };
}

async function isCurrentMemberOf(ctx: QueryContext, workspace: string, member: MemberId) {
  return (await personFactsOf(ctx, member))?.workspace === workspace;
}

async function isKnownProfile(ctx: QueryContext, profile: AdminLinkTarget) {
  if (typeof profile !== "number") return true;
  return (await currentProfiles(ctx)).some((each) => each.profile === profile);
}

function adminLinkOf(ctx: QueryContext, workspace: string, member: MemberId) {
  return linkOf(ctx, workspace, member, "admin");
}

async function deleteOtherAdminLinksTo(ctx: MutationContext, workspace: string, profile: number, member: MemberId) {
  const rows = await ctx.tx
    .select()
    .from(companyProfileLinks)
    .where(and(eq(companyProfileLinks.workspace, workspace), eq(companyProfileLinks.profile, profile)))
    .orderBy(asc(companyProfileLinks._creationTime), asc(companyProfileLinks._id));
  const links = rows.map((row) => toDocument<Doc<"companyProfileLinks">>(companyProfileLinks, row));
  for (const link of links) if (link.by === "admin" && link.member !== member) await deleteLink(ctx, link);
}

function memberByName(one: MemberMatch, other: MemberMatch) {
  return one.name.localeCompare(other.name) || one.member.localeCompare(other.member);
}
