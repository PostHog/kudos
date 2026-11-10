// The module map's skeleton of convex/companyProfiles/links.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import { type CompanyFace } from "./faces.ts";
import { type CompanyProfile, type MatchedBy } from "./matcher.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type ProfileChoice = { profile: number; name: string; role: string | null; teams: string[]; face: CompanyFace | null };

export type CompanyProfileSetting = { mine: ProfileChoice | null; by: MatchedBy | null; choices: ProfileChoice[] };

export type SelfLinkRefusal = "matched" | "taken" | "unknown";

export type SelfLinkOutcome = { kind: "linked"; profile: number | null } | { kind: "refused"; reason: SelfLinkRefusal; profile: number | null };

export async function companyProfileSettingOf(ctx: QueryContext, member: MemberId): Promise<CompanyProfileSetting> {
  throw notPorted("companyProfiles.links.companyProfileSettingOf");
}

export async function linkMyCompanyProfile(ctx: MutationContext, member: MemberId, profile: number | null): Promise<SelfLinkOutcome> {
  throw notPorted("companyProfiles.links.linkMyCompanyProfile");
}

export async function choicesFrom(ctx: QueryContext): Promise<(profile: CompanyProfile) => ProfileChoice> {
  throw notPorted("companyProfiles.links.choicesFrom");
}

export function byName(one: ProfileChoice, other: ProfileChoice) {
  return one.name.localeCompare(other.name) || one.profile - other.profile;
}
