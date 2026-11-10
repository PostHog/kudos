// The module map's skeleton of convex/workspace/directory.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ChatUserId } from "../engine/messageEvent.ts";
import { directoryEntryValidator } from "./directoryEntry.ts";
import { memberProfileFields, type MemberProfile } from "./memberProfile.ts";
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
  throw notPorted("workspace.directory.lookup");
}

export async function chatUserOf(ctx: QueryContext, member: MemberId): Promise<{ workspace: string; user: ChatUserId }> {
  throw notPorted("workspace.directory.chatUserOf");
}

export async function emailOf(ctx: QueryContext, member: MemberId): Promise<string | undefined> {
  throw notPorted("workspace.directory.emailOf");
}

export async function isMember(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("workspace.directory.isMember");
}

export type NameAndPicture = { name: string | undefined; picture: string | null };

export async function nameAndPictureOf(ctx: QueryContext, member: MemberId): Promise<NameAndPicture> {
  throw notPorted("workspace.directory.nameAndPictureOf");
}

export async function currentNameAndPictureOf(ctx: QueryContext, member: MemberId): Promise<NameAndPicture | null> {
  throw notPorted("workspace.directory.currentNameAndPictureOf");
}

export async function isAPersonOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<boolean> {
  throw notPorted("workspace.directory.isAPersonOf");
}

export async function timeZoneOf(ctx: QueryContext, member: MemberId): Promise<string | null> {
  throw notPorted("workspace.directory.timeZoneOf");
}

export async function currentMemberOfUser(ctx: QueryContext, workspace: string, user: ChatUserId): Promise<{ member: MemberId; name: string | undefined } | undefined> {
  throw notPorted("workspace.directory.currentMemberOfUser");
}

export async function displayNameOf(ctx: QueryContext, member: MemberId): Promise<string | undefined> {
  throw notPorted("workspace.directory.displayNameOf");
}

export async function profileNameOf(ctx: QueryContext, member: MemberId): Promise<string | undefined> {
  throw notPorted("workspace.directory.profileNameOf");
}

export type PersonFacts = { workspace: string; user: ChatUserId; admin: boolean } & MemberProfile;

export async function personFactsOf(ctx: QueryContext, member: MemberId): Promise<PersonFacts | null> {
  throw notPorted("workspace.directory.personFactsOf");
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
  throw notPorted("workspace.directory.currentMembersOf");
}

export type NamedMember = { member: MemberId; fullName: string };

export async function currentMembersNamedIn(ctx: QueryContext, workspace: string): Promise<NamedMember[]> {
  throw notPorted("workspace.directory.currentMembersNamedIn");
}

export async function fullNameOf(ctx: QueryContext, member: MemberId): Promise<string> {
  throw notPorted("workspace.directory.fullNameOf");
}

export type Person = { user: ChatUserId; name: string | undefined; picture: string | null; former: boolean };

export type People = Map<MemberId, Person>;

export type MemberRows = Doc<"members">[];

export function memberRowsIn(ctx: QueryContext, workspace: string): Promise<MemberRows> {
  throw notPorted("workspace.directory.memberRowsIn");
}

export async function peopleIn(ctx: QueryContext, workspace: string): Promise<People> {
  throw notPorted("workspace.directory.peopleIn");
}

export function peopleOf(rows: MemberRows): People {
  return new Map(rows.map((row) => [row._id, { user: row.user, ...(row.kind === "member" ? { name: row.name, picture: row.picture ?? null, former: false } : { name: undefined, picture: null, former: true }) }]));
}

export async function teammatesOf(ctx: QueryContext, workspace: string, member: MemberId): Promise<MemberId[]> {
  throw notPorted("workspace.directory.teammatesOf");
}

export function isOlder(asOf: number, known: number | undefined) {
  return known !== undefined && asOf < known;
}
