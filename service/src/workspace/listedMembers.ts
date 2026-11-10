// The module map's skeleton of convex/workspace/listedMembers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ChatUserId } from "../engine/messageEvent.ts";
import { directoryRecordArgs, type MemberId } from "./directory.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type ListedMember = { user: ChatUserId; name: string | undefined };

export const keepListedMembersArgs = z.strictObject({ listings: z.array(z.strictObject(directoryRecordArgs)) });
export async function keepListedMembers(ctx: MutationContext, args: z.infer<typeof keepListedMembersArgs>): Promise<void> {
  throw notPorted("workspace.listedMembers.keepListedMembers");
}

export async function unknownListedMembersIn(ctx: QueryContext, workspace: string): Promise<ListedMember[]> {
  throw notPorted("workspace.listedMembers.unknownListedMembersIn");
}

export async function listedMembersIn(ctx: QueryContext, workspace: string): Promise<ListedMember[]> {
  throw notPorted("workspace.listedMembers.listedMembersIn");
}

export async function recordListedMember(ctx: MutationContext, workspace: string, user: ChatUserId): Promise<MemberId | null> {
  throw notPorted("workspace.listedMembers.recordListedMember");
}
