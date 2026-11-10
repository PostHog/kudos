// The directory of the workspace's people: who each one is, whether a member, their name, time zone, admin flag and
// profile. Today's convex/workspace/directory.ts, with its pages on the service's keyset paging (../db/page.ts).
import { and, eq } from "drizzle-orm";
import { ReportableError } from "../analytics/exceptions.ts";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { paginate } from "../db/page.ts";
import { members } from "../db/schema/index.ts";
import { insertRow, patchRow, replaceRow, rowById, uniqueRow } from "./rows.ts";
import { followMembersLater } from "../analytics/person.ts";
import { keepCompanyFacesLater } from "../companyProfiles/storedFaces.ts";
import { reconcileMember, reconcileUser } from "../groups/reconcile.ts";
import type { ChatUserId } from "../engine/messageEvent.ts";
import { directoryEntryValidator } from "./directoryEntry.ts";
import { memberProfileFieldNames, memberProfileFields, type MemberProfile } from "./memberProfile.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
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
  const { page, isDone, continueCursor } = await paginate<Doc<"members">>(
    ctx.tx,
    { table: members, order: byAdmin, where: and(eq(members.workspace, workspace), eq(members.admin, true)) },
    { cursor, numItems },
  );
  const admins = page.filter(({ kind }) => kind === "member").map(({ user }) => user);
  return { admins, continueCursor: isDone ? null : continueCursor };
}

export async function membersPageIn(ctx: QueryContext, workspace: string, cursor: string | null, numItems: number): Promise<{ members: Id<"members">[]; continueCursor: null | string }> {
  const { page, isDone, continueCursor } = await paginate<Doc<"members">>(ctx.tx, { table: members, order: byUser, where: eq(members.workspace, workspace) }, { cursor, numItems });
  return { members: page.map(({ _id }) => _id), continueCursor: isDone ? null : continueCursor };
}

export const directoryRecordArgs = { workspace: z.string(), user: z.string(), entry: directoryEntryValidator, asOf: zv.number() };

export type DirectoryRecord = z.infer<z.ZodObject<typeof directoryRecordArgs>>;

export const fillEntryArgs = z.strictObject(directoryRecordArgs);
export async function fillEntry(ctx: MutationContext, args: z.infer<typeof fillEntryArgs>): Promise<void> {
  await recordIfUnknown(ctx, args);
}
export const fillEntryJob = mutationJob("workspace.directory.fillEntry", fillEntryArgs, fillEntry);

export async function recordIfUnknown(ctx: MutationContext, directoryRecord: DirectoryRecord): Promise<void> {
  if ((await memberRow(ctx, directoryRecord.workspace, directoryRecord.user)) === null) await record(ctx, directoryRecord);
}

export const nameMembersWithoutNameArgs = z.strictObject({ names: z.array(z.strictObject({ workspace: z.string(), user: z.string(), name: z.string() })) });
export async function nameMembersWithoutName(ctx: MutationContext, { names }: z.infer<typeof nameMembersWithoutNameArgs>): Promise<void> {
  const named = new Set<string>();
  for (const { workspace, user, name } of names) {
    const row = await memberRow(ctx, workspace, user);
    if (row?.kind !== "member" || row.name !== undefined) continue;
    await patchRow(ctx, members, row._id, { name });
    named.add(workspace);
  }
  for (const workspace of named) await keepCompanyFacesLater(ctx, workspace);
}

export const fillProfilesArgs = z.strictObject({ profiles: z.array(z.strictObject({ workspace: z.string(), user: z.string(), profile: z.strictObject(memberProfileFields), asOf: zv.number() })) });
export async function fillProfiles(ctx: MutationContext, { profiles }: z.infer<typeof fillProfilesArgs>): Promise<void> {
  const changed: MemberId[] = [];
  const renamed = new Set<string>();
  for (const { workspace, user, profile, asOf } of profiles) {
    const row = await memberRow(ctx, workspace, user);
    if (row?.kind !== "member" || isOlder(asOf, row.asOf) || isOlder(asOf, row.profileAsOf) || !differsFrom(row, profile)) continue;
    await patchRow(ctx, members, row._id, { ...profile, profileAsOf: asOf });
    changed.push(row._id);
    if (profile.realName !== undefined && profile.realName !== row.realName) renamed.add(workspace);
  }
  await followMembersLater(ctx, changed);
  for (const workspace of renamed) await keepCompanyFacesLater(ctx, workspace);
}

function differsFrom(row: Doc<"members">, profile: MemberProfile) {
  return memberProfileFieldNames.some((field) => profile[field] !== undefined && row[field] !== profile[field]);
}

export async function record(ctx: MutationContext, { workspace, user, entry, asOf }: DirectoryRecord): Promise<void> {
  const row = { workspace, user, timeZone: undefined, asOf, ...entry };
  const existing = await memberRow(ctx, workspace, user);
  if (existing === null) {
    await insertRow(ctx, members, row);
    await reconcileUser(ctx, workspace, user, ctx.now);
    await keepCompanyFacesLater(ctx, workspace);
  } else if (!isOlder(asOf, existing.asOf)) {
    const next = keepingNewerProfile(existing, row);
    if (changesNothingKept(existing, next)) return;
    await replace(ctx, existing, next);
    await followMembersLater(ctx, [existing._id]);
    if (changesItsMatch(existing, next)) await keepCompanyFacesLater(ctx, workspace);
  }
}

type MemberRow = Omit<Doc<"members">, "_id" | "_creationTime">;

const fieldsNotKept = new Set(["_id", "_creationTime", "asOf"]);

function changesNothingKept(existing: Doc<"members">, next: MemberRow) {
  const [before, after] = [keptFieldsOf(existing), keptFieldsOf(next)];
  return before.size === after.size && [...before].every(([field, value]) => after.get(field) === value);
}

function changesItsMatch(existing: Doc<"members">, next: MemberRow) {
  return existing.kind !== next.kind || existing.name !== next.name || existing.realName !== next.realName;
}

function keptFieldsOf(row: MemberRow | Doc<"members">) {
  return new Map(Object.entries(row).filter(([field, value]) => value !== undefined && !fieldsNotKept.has(field)));
}

function keepingNewerProfile(existing: Doc<"members">, row: MemberRow): MemberRow {
  if (existing.kind !== "member" || row.kind !== "member" || !isOlder(row.asOf ?? 0, existing.profileAsOf)) return row;
  return { ...withoutProfile(row), ...profileOf(existing), profileAsOf: existing.profileAsOf };
}

function withoutProfile(row: MemberRow): MemberRow {
  const isProfileField = (field: string) => (memberProfileFieldNames as string[]).includes(field);
  return Object.fromEntries(Object.entries(row).filter(([field]) => !isProfileField(field))) as MemberRow;
}

async function replace(ctx: MutationContext, existing: Doc<"members">, row: MemberRow) {
  await replaceRow(ctx, members, existing._id, row);
  const membership = { workspace: row.workspace, member: existing._id, at: ctx.now };
  if (existing.kind === "member" && row.kind !== "member") await ctx.publish({ type: "memberLeft", ...membership });
  if (existing.kind !== "member" && row.kind === "member") await ctx.publish({ type: "memberRejoined", ...membership });
  if ((existing.kind === "member") !== (row.kind === "member")) await reconcileMember(ctx, existing._id, ctx.now);
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
const byAdmin = indexOrder(members, ["workspace", "admin"]);

function memberById(ctx: QueryContext, member: MemberId): Promise<Doc<"members"> | null> {
  return rowById<Doc<"members">>(ctx, members, member);
}

function memberRow(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<Doc<"members"> | null> {
  return uniqueRow<Doc<"members">>(ctx, members, and(eq(members.workspace, workspace), eq(members.user, user)), byUser);
}
