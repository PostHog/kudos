// The module map's skeleton of convex/companyProfiles/admin.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import { type ProfileChoice } from "./links.ts";
import { type MatchedBy } from "./matcher.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type MemberMatch = { member: MemberId; name: string; profile: number | null; by: MatchedBy | null };

export type HeldProfile = ProfileChoice & { heldBy: MemberId | null; by: MatchedBy | null };

export type WorkspaceMatches = { members: MemberMatch[]; profiles: HeldProfile[] };

export type AdminLinkTarget = number | "none" | null;

export type AdminLinkRefusal = "not-admin" | "unknown";

export type AdminLinkOutcome = { kind: "linked"; member: MemberId } | { kind: "refused"; reason: AdminLinkRefusal; member: MemberId | null };

type Caller = { member: MemberId; admin: boolean };

export async function workspaceMatchesOf(ctx: QueryContext, workspace: string): Promise<WorkspaceMatches> {
  throw notPorted("companyProfiles.admin.workspaceMatchesOf");
}

export async function linkCompanyProfile(ctx: MutationContext, workspace: string, caller: Caller, member: MemberId | null, profile: AdminLinkTarget): Promise<AdminLinkOutcome> {
  throw notPorted("companyProfiles.admin.linkCompanyProfile");
}
