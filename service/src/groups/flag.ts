// The module map's skeleton of convex/groups/flag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const groupsFlag = { key: "groups", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function groupsApplyTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  throw notPorted("groups.flag.groupsApplyTo");
}

export const exposeGroupsArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function exposeGroups(ctx: MutationContext, args: z.infer<typeof exposeGroupsArgs>): Promise<void> {
  throw notPorted("groups.flag.exposeGroups");
}
