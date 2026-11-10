// The directory of the workspace's people: who each one is, whether a member, their name, time zone, admin flag and
// profile. Today's convex/workspace/directory.ts; the member reads are ported, and the stubs left throw notPorted until
// the directory sync (S3 3.2) and the keyset paging they wait on land.
import { and, eq } from "drizzle-orm";
import { ReportableError } from "../analytics/exceptions.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { members } from "../db/schema/index.ts";
import { rowById, uniqueRow } from "./rows.ts";
import type { ChatUserId } from "../engine/messageEvent.ts";
import { directoryEntryValidator } from "./directoryEntry.ts";
import { memberProfileFieldNames, memberProfileFields, type MemberProfile } from "./memberProfile.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export type MemberId = Id<"members">;

export type MemberFacts =
  | { kind: "member"; member: MemberId; timeZone: string | undefined; admin: boolean }
  | { kind: "bot" }
  | { kind: "not-a-member" };

export { directoryEntryValidator, type DirectoryEntry } from "./directoryEntry.ts";

export async function lookup(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<MemberFacts | undefined> {
  const row = await memberRow(ctx, workspace, user);
  if (row === null) return undefined;
  if (row.kind === "member") return { kind: "member", member: row._id, timeZone: row.timeZone, admin: row.admin ?? false };
  return { kind: row.kind };
}

export async function chatUserOf(ctx: QueryContext, member: MemberId): Promise<{ workspace: string; user: ChatUserId }> {
  const row = await memberById(ctx, member);
  if (row === null) throw new ReportableError("no such member in the directory");
  return { workspace: row.workspace, user: row.user };
}

export async function emailOf(ctx: QueryContext, member: MemberId): Promise<string | undefined> {
  const row = await memberById(ctx, member);
  return row?.kind === "member" ? row.email : undefined;
}

export async function isMember(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await memberById(ctx, member))?.kind === "member";
}

export type NameAndPicture = { name: string | undefined; picture: string | null };

export async function nameAndPictureOf(ctx: QueryContext, member: MemberId): Promise<NameAndPicture> {
  return (await currentNameAndPictureOf(ctx, member)) ?? { name: undefined, picture: null };
}

export async function currentNameAndPictureOf(ctx: QueryContext, member: MemberId): Promise<NameAndPicture | null> {
  const row = await memberById(ctx, member);
  return row?.kind === "member" ? { name: row.name, picture: row.picture ?? null } : null;
}

export async function isAPersonOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<boolean> {
  const row = await memberById(ctx, member);
  return row !== null && row.workspace === workspace && row.kind !== "bot";
}

export async function timeZoneOf(ctx: QueryContext, member: MemberId): Promise<string | null> {
  const row = await memberById(ctx, member);
  return row?.kind === "member" ? (row.timeZone ?? null) : null;
}

export async function currentMemberOfUser(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<{ member: MemberId; name: string | undefined } | undefined> {
  const row = await memberRow(ctx, workspace, user);
  return row?.kind === "member" ? { member: row._id, name: row.name } : undefined;
}

export async function displayNameOf(ctx: QueryContext, member: MemberId): Promise<string | undefined> {
  const row = await memberById(ctx, member);
  return row?.kind === "member" ? row.name : undefined;
}

export async function profileNameOf(ctx: QueryContext, member: MemberId): Promise<string | undefined> {
  const row = await memberById(ctx, member);
  return row?.kind === "member" ? (row.displayName ?? row.realName) : undefined;
}

export type PersonFacts = { workspace: string; user: ChatUserId; admin: boolean } & MemberProfile;

export async function personFactsOf(ctx: QueryContext, member: MemberId): Promise<PersonFacts | null> {
  const row = await memberById(ctx, member);
  if (row?.kind !== "member") return null;
  return { workspace: row.workspace, user: row.user, admin: row.admin ?? false, ...profileOf(row) };
}

export async function adminsPageIn(ctx: QueryContext, workspace: string, cursor: string | null, numItems: number): Promise<{ admins: string[]; continueCursor: null | string }> {
  throw notPorted("workspace.directory.adminsPageIn");
}

export async function membersPageIn(ctx: QueryContext, workspace: string, cursor: string | null, numItems: number): Promise<{ members: Id<"members">[]; continueCursor: null | string }> {
  throw notPorted("workspace.directory.membersPageIn");
}

export const directoryRecordArgs = { workspace: z.string(), user: z.string(), entry: directoryEntryValidator, asOf: zv.number() };

export type DirectoryRecord = z.infer<z.ZodObject<typeof directoryRecordArgs>>;

export const fillEntryArgs = z.strictObject(directoryRecordArgs);
export async function fillEntry(ctx: MutationContext, args: z.infer<typeof fillEntryArgs>): Promise<void> {
  throw notPorted("workspace.directory.fillEntry");
}
export const fillEntryJob = mutationJob("workspace.directory.fillEntry", fillEntryArgs, fillEntry);

export async function recordIfUnknown(ctx: MutationContext, directoryRecord: DirectoryRecord): Promise<void> {
  throw notPorted("workspace.directory.recordIfUnknown");
}

export const nameMembersWithoutNameArgs = z.strictObject({ names: z.array(z.strictObject({ workspace: z.string(), user: z.string(), name: z.string() })) });
export async function nameMembersWithoutName(ctx: MutationContext, args: z.infer<typeof nameMembersWithoutNameArgs>): Promise<void> {
  throw notPorted("workspace.directory.nameMembersWithoutName");
}

export const fillProfilesArgs = z.strictObject({ profiles: z.array(z.strictObject({ workspace: z.string(), user: z.string(), profile: z.strictObject(memberProfileFields), asOf: zv.number() })) });
export async function fillProfiles(ctx: MutationContext, args: z.infer<typeof fillProfilesArgs>): Promise<void> {
  throw notPorted("workspace.directory.fillProfiles");
}

export async function record(ctx: MutationContext, { workspace, user, entry, asOf }: DirectoryRecord): Promise<void> {
  throw notPorted("workspace.directory.record");
}

export async function currentMembersOf(ctx: QueryContext, workspace: string): Promise<MemberId[]> {
  return (await currentMemberRowsIn(ctx, workspace)).map(({ _id }) => _id);
}

export type NamedMember = { member: MemberId; fullName: string };

export async function currentMembersNamedIn(ctx: QueryContext, workspace: string): Promise<NamedMember[]> {
  return (await currentMemberRowsIn(ctx, workspace)).map((row) => ({ member: row._id, fullName: fullNameIn(row) }));
}

export async function fullNameOf(ctx: QueryContext, member: MemberId): Promise<string> {
  const row = await memberById(ctx, member);
  return row?.kind === "member" ? fullNameIn(row) : "";
}

export type Person = { user: ChatUserId; name: string | undefined; picture: string | null; former: boolean };

export type People = Map<MemberId, Person>;

export type MemberRows = Doc<"members">[];

export function memberRowsIn(ctx: QueryContext, workspace: string): Promise<MemberRows> {
  return ctx.tx
    .select()
    .from(members)
    .where(eq(members.workspace, workspace))
    .orderBy(...byUser.orderBy())
    .then((rows) => rows.map((row) => toDocument<Doc<"members">>(members, row)));
}

export async function peopleIn(ctx: QueryContext, workspace: string): Promise<People> {
  return peopleOf(await memberRowsIn(ctx, workspace));
}

export function peopleOf(rows: MemberRows): People {
  return new Map(rows.map((row) => [row._id, { user: row.user, ...(row.kind === "member" ? { name: row.name, picture: row.picture ?? null, former: false } : { name: undefined, picture: null, former: true }) }]));
}

export async function teammatesOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<MemberId[]> {
  return (await currentMembersOf(ctx, workspace)).filter((teammate) => teammate !== member);
}

export function isOlder(asOf: number, known: number | undefined) {
  return known !== undefined && asOf < known;
}

function fullNameIn(row: Doc<"members">): string {
  return row.realName ?? row.name ?? "";
}

async function currentMemberRowsIn(ctx: QueryContext, workspace: string): Promise<MemberRows> {
  return (await memberRowsIn(ctx, workspace)).filter(({ kind }) => kind === "member");
}

function profileOf(row: Doc<"members">): MemberProfile {
  return Object.fromEntries(memberProfileFieldNames.flatMap((field) => (row[field] === undefined ? [] : [[field, row[field]]])));
}

const byUser = indexOrder(members, ["workspace", "user"]);

function memberById(ctx: QueryContext, member: MemberId): Promise<Doc<"members"> | null> {
  return rowById<Doc<"members">>(ctx, members, member);
}

function memberRow(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<Doc<"members"> | null> {
  return uniqueRow<Doc<"members">>(ctx, members, and(eq(members.workspace, workspace), eq(members.user, user)), byUser);
}
