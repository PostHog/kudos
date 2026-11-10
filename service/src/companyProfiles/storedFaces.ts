// Each workspace's matched company faces, kept as rows, as today's convex/companyProfiles/storedFaces.ts: reads answer
// from the rows, and a job matches the workspace's members again after a sync or a link changes and writes what moved.
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { CompanyMatchesKeptEvent } from "../bus/events.ts";
import { fromDocument, toDocument } from "../db/documents.ts";
import type { Doc } from "../db/schema/index.ts";
import { companyFaces } from "../db/schema/companyProfiles.ts";
import { workspaces } from "../db/schema/workspace.ts";
import { mutationJob } from "../jobs/define.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { memberRowsIn, type MemberId } from "../workspace/directory.ts";
import type { CompanyFace } from "./faces.ts";
import { companyProfilesIn } from "./matcher.ts";

export type StoredCompanyMatch = { face: CompanyFace | null; profile: number | null };

type FaceRow = Doc<"companyFaces">;

const byMember = [asc(companyFaces.workspace), asc(companyFaces.member), asc(companyFaces._creationTime), asc(companyFaces._id)];

export async function storedCompanyFaceOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<CompanyFace | null | undefined> {
  return (await storedCompanyMatchOf(ctx, workspace, member))?.face;
}

/** One row per member, as Convex's `unique()` asked. */
export async function storedCompanyMatchOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<StoredCompanyMatch | undefined> {
  const rows = await ctx.tx.select().from(companyFaces).where(and(eq(companyFaces.workspace, workspace), eq(companyFaces.member, member))).limit(2);
  if (rows.length > 1) throw new Error(`More than one company face is kept for ${member}`);
  const row = rows[0] ? toDocument<FaceRow>(companyFaces, rows[0]) : null;
  return row === null ? undefined : { face: row.face, profile: row.profile ?? null };
}

export type StoredHolder = { member: MemberId; face: CompanyFace | null };

export async function storedHoldersIn(ctx: QueryContext, workspace: string): Promise<Map<number, StoredHolder>> {
  const rows = await facesIn(ctx, workspace);
  return new Map(rows.flatMap(({ profile, member, face }) => (profile === undefined ? [] : [[profile, { member, face }] as const])));
}

async function keepCompanyFaces(ctx: MutationContext, workspace: string) {
  const matched = await matchesIn(ctx, workspace);
  const stored = await facesIn(ctx, workspace);
  for (const row of stored) {
    const match = matched.get(row.member);
    if (match === undefined) await ctx.tx.delete(companyFaces).where(eq(companyFaces._id, row._id));
    else if (!sameMatch(match, { face: row.face, profile: row.profile ?? null })) await writeFace(ctx, { ...row, ...storedFieldsOf(match) });
    matched.delete(row.member);
  }
  for (const [member, match] of matched) await ctx.tx.insert(companyFaces).values(fromDocument(companyFaces, { ...ctx.newRow(), workspace, member, ...storedFieldsOf(match) }) as typeof companyFaces.$inferInsert);
}

export const keepCompanyFacesInArgs = z.strictObject({ workspace: z.string() });
export async function keepCompanyFacesIn(ctx: MutationContext, { workspace }: z.infer<typeof keepCompanyFacesInArgs>): Promise<null> {
  await keepCompanyFaces(ctx, workspace);
  const kept: CompanyMatchesKeptEvent = { type: "companyMatchesKept", workspace, at: ctx.now };
  await ctx.publish(kept);
  return null;
}
export const keepCompanyFacesInJob = mutationJob("companyProfiles.storedFaces.keepCompanyFacesIn", keepCompanyFacesInArgs, keepCompanyFacesIn);

export async function keepCompanyFacesLater(ctx: MutationContext, workspace: string): Promise<void> {
  await ctx.jobs.enqueue(keepCompanyFacesInJob, { workspace }, { after: 0 });
}

export async function keepCompanyFacesInEveryWorkspaceLater(ctx: MutationContext): Promise<void> {
  for (const workspace of await workspacesWithFacesToKeep(ctx)) await keepCompanyFacesLater(ctx, workspace);
}

async function workspacesWithFacesToKeep(ctx: QueryContext) {
  const known = new Set((await ctx.tx.select({ workspace: workspaces.workspace }).from(workspaces).orderBy(asc(workspaces._creationTime), asc(workspaces._id))).map(({ workspace }) => workspace));
  for (let row = await firstFaceAfter(ctx, ""); row !== undefined; row = await firstFaceAfter(ctx, row.workspace)) known.add(row.workspace);
  return known;
}

// Convex's `.withIndex("by_member", (q) => q.gt("workspace", workspace)).first()`: the next workspace that keeps a face.
async function firstFaceAfter(ctx: QueryContext, workspace: string): Promise<{ workspace: string } | undefined> {
  const [row] = await ctx.tx.select({ workspace: companyFaces.workspace }).from(companyFaces).where(gt(companyFaces.workspace, workspace)).orderBy(...byMember).limit(1);
  return row;
}

async function facesIn(ctx: QueryContext, workspace: string): Promise<FaceRow[]> {
  const rows = await ctx.tx.select().from(companyFaces).where(eq(companyFaces.workspace, workspace)).orderBy(...byMember);
  return rows.map((row) => toDocument<FaceRow>(companyFaces, row));
}

async function writeFace(ctx: MutationContext, row: FaceRow): Promise<void> {
  await ctx.tx.update(companyFaces).set(fromDocument(companyFaces, row)).where(eq(companyFaces._id, row._id));
}

async function matchesIn(ctx: QueryContext, workspace: string): Promise<Map<MemberId, StoredCompanyMatch>> {
  const members = await memberRowsIn(ctx, workspace);
  const { matches } = await companyProfilesIn(ctx, workspace, members);
  const matchOf = (member: MemberId): StoredCompanyMatch => {
    const profile = matches.get(member)?.profile ?? null;
    return { face: profile?.image === undefined ? null : { image: profile.image, colour: profile.colour }, profile: profile?.profile ?? null };
  };
  return new Map(members.filter(({ kind }) => kind === "member").map(({ _id }) => [_id, matchOf(_id)]));
}

function storedFieldsOf({ face, profile }: StoredCompanyMatch) {
  return { face, profile: profile ?? undefined };
}

function sameMatch(one: StoredCompanyMatch, other: StoredCompanyMatch) {
  return one.face?.image === other.face?.image && one.face?.colour === other.face?.colour && one.profile === other.profile;
}
