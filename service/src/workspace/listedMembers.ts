// The members Slack's users.list names each day, kept apart from the directory so the hype picker can offer a member
// Kudos hasn't met yet. Today's convex/workspace/listedMembers.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import type { Doc } from "../db/schema/index.ts";
import { listedMembers } from "../db/schema/index.ts";
import type { ChatUserId } from "../engine/messageEvent.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { currentMemberOfUser, directoryRecordArgs, isOlder, memberRowsIn, recordIfUnknown, type DirectoryRecord, type MemberId } from "./directory.ts";
import { insertRow, patchRow, uniqueRow } from "./rows.ts";

export type ListedMember = { user: ChatUserId; name: string | undefined };

export const keepListedMembersArgs = z.strictObject({ listings: z.array(z.strictObject(directoryRecordArgs)) });
export async function keepListedMembers(ctx: MutationContext, { listings }: z.infer<typeof keepListedMembersArgs>): Promise<void> {
  for (const listing of listings) await keepListing(ctx, listing);
}

export async function unknownListedMembersIn(ctx: QueryContext, workspace: string): Promise<ListedMember[]> {
  const known = new Set((await memberRowsIn(ctx, workspace)).map(({ user }) => user));
  return (await listedMembersIn(ctx, workspace)).filter(({ user }) => !known.has(user));
}

export async function listedMembersIn(ctx: QueryContext, workspace: string): Promise<ListedMember[]> {
  const listed = (await ctx.tx.select().from(listedMembers).where(eq(listedMembers.workspace, workspace)).orderBy(...byUser.orderBy())).map((row) =>
    toDocument<Doc<"listedMembers">>(listedMembers, row),
  );
  return listed.flatMap(({ user, entry }) => (entry.kind === "member" ? [{ user, name: entry.name }] : []));
}

export async function recordListedMember(ctx: MutationContext, workspace: string, user: ChatUserId): Promise<MemberId | null> {
  const listed = await listedRow(ctx, workspace, user);
  if (listed?.entry.kind !== "member") return null;
  await recordIfUnknown(ctx, { workspace, user, entry: listed.entry, asOf: listed.asOf });
  return (await currentMemberOfUser(ctx, workspace, user))?.member ?? null;
}

async function keepListing(ctx: MutationContext, { workspace, user, entry, asOf }: DirectoryRecord) {
  const existing = await listedRow(ctx, workspace, user);
  if (existing === null) await insertRow(ctx, listedMembers, { workspace, user, entry, asOf });
  else if (!isOlder(asOf, existing.asOf)) await patchRow(ctx, listedMembers, existing._id, { entry, asOf });
}

const byUser = indexOrder(listedMembers, ["workspace", "user"]);

function listedRow(ctx: QueryContext, workspace: string, user: ChatUserId) {
  return uniqueRow<Doc<"listedMembers">>(ctx, listedMembers, and(eq(listedMembers.workspace, workspace), eq(listedMembers.user, user)), byUser);
}
