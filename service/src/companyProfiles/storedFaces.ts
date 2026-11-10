// The module map's skeleton of convex/companyProfiles/storedFaces.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type MemberId } from "../workspace/directory.ts";
import type { CompanyFace } from "./faces.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type StoredCompanyMatch = { face: CompanyFace | null; profile: number | null };

export async function storedCompanyFaceOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<CompanyFace | null | undefined> {
  throw notPorted("companyProfiles.storedFaces.storedCompanyFaceOf");
}

export async function storedCompanyMatchOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<StoredCompanyMatch | undefined> {
  throw notPorted("companyProfiles.storedFaces.storedCompanyMatchOf");
}

export type StoredHolder = { member: MemberId; face: CompanyFace | null };

export async function storedHoldersIn(ctx: QueryContext, workspace: string): Promise<Map<number, StoredHolder>> {
  throw notPorted("companyProfiles.storedFaces.storedHoldersIn");
}

export const keepCompanyFacesInArgs = z.strictObject({ workspace: z.string() });
export async function keepCompanyFacesIn(ctx: MutationContext, args: z.infer<typeof keepCompanyFacesInArgs>): Promise<null> {
  throw notPorted("companyProfiles.storedFaces.keepCompanyFacesIn");
}
export const keepCompanyFacesInJob = mutationJob("companyProfiles.storedFaces.keepCompanyFacesIn", keepCompanyFacesInArgs, keepCompanyFacesIn);

export async function keepCompanyFacesLater(ctx: MutationContext, workspace: string): Promise<void> {
  throw notPorted("companyProfiles.storedFaces.keepCompanyFacesLater");
}

export async function keepCompanyFacesInEveryWorkspaceLater(ctx: MutationContext): Promise<void> {
  throw notPorted("companyProfiles.storedFaces.keepCompanyFacesInEveryWorkspaceLater");
}
