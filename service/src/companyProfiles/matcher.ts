// The module map's skeleton of convex/companyProfiles/matcher.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId, type MemberRows } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type MatchedBy = "name" | "self" | "admin";

export type CompanyProfile = { profile: number; firstName: string; lastName: string; image?: string; colour: string; teams: string[]; role?: string };

export type ProfileMatch = { profile: CompanyProfile; by: MatchedBy } | { profile: null; by: "admin" };

export type CompanyProfiles = { profiles: CompanyProfile[]; matches: Map<MemberId, ProfileMatch>; holders: Map<number, MemberId> };

export function publicNameOf({ firstName, lastName }: CompanyProfile) {
  return `${firstName.trim()} ${lastName.trim()}`;
}

export async function companyProfileOf(ctx: QueryContext, member: MemberId): Promise<ProfileMatch | null> {
  throw notPorted("companyProfiles.matcher.companyProfileOf");
}

export async function companyProfilesIn(ctx: QueryContext, workspace: string, members?: MemberRows): Promise<CompanyProfiles> {
  throw notPorted("companyProfiles.matcher.companyProfilesIn");
}

export async function currentProfiles(ctx: QueryContext): Promise<CompanyProfile[]> {
  throw notPorted("companyProfiles.matcher.currentProfiles");
}
