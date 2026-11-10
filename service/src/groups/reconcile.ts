// The module map's skeleton of convex/groups/reconcile.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { ChatUserId } from "../engine/messageEvent.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export async function reconcileLater(ctx: MutationContext, workspace: string, users: ChatUserId[]): Promise<void> {
  throw notPorted("groups.reconcile.reconcileLater");
}

export const reconcileUsersArgs = z.strictObject({ workspace: z.string(), users: z.array(z.string()) });
export async function reconcileUsers(ctx: MutationContext, args: z.infer<typeof reconcileUsersArgs>): Promise<void> {
  throw notPorted("groups.reconcile.reconcileUsers");
}
export const reconcileUsersJob = mutationJob("groups.reconcile.reconcileUsers", reconcileUsersArgs, reconcileUsers);

export async function reconcileEveryMemberLater(ctx: MutationContext, workspace: string): Promise<void> {
  throw notPorted("groups.reconcile.reconcileEveryMemberLater");
}

export const reconcileWorkspaceArgs = z.strictObject({ workspace: z.string(), after: z.optional(z.string()) });
export async function reconcileWorkspace(ctx: MutationContext, args: z.infer<typeof reconcileWorkspaceArgs>): Promise<void> {
  throw notPorted("groups.reconcile.reconcileWorkspace");
}
export const reconcileWorkspaceJob = mutationJob("groups.reconcile.reconcileWorkspace", reconcileWorkspaceArgs, reconcileWorkspace);

export async function reconcileUser(ctx: MutationContext, workspace: string, user: ChatUserId, recordedAt?: number): Promise<void> {
  throw notPorted("groups.reconcile.reconcileUser");
}

export async function reconcileMember(ctx: MutationContext, member: MemberId, recordedAt?: number): Promise<void> {
  throw notPorted("groups.reconcile.reconcileMember");
}

export async function reconcilePageOf(ctx: MutationContext, members: MemberId[]): Promise<MemberId[]> {
  throw notPorted("groups.reconcile.reconcilePageOf");
}
