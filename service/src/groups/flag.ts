// The `groups` flag: who sees groups, recording the exposure where a member meets them.
// Today's convex/groups/flag.ts over the service's transaction.
import { z } from "zod";
import { exposed, memberDecision, type Flag } from "../analytics/flags.ts";
import type { MutationContext } from "../operations.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";

export const groupsFlag = { key: "groups", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function groupsApplyTo(ctx: MutationContext, member: MemberId): Promise<boolean> {
  const applies = await memberDecision(ctx, groupsFlag, member);
  await exposed(ctx, groupsFlag, member, applies);
  return applies;
}

export const exposeGroupsArgs = z.strictObject({ workspace: z.string(), user: z.string() });
export async function exposeGroups(ctx: MutationContext, { workspace, user }: z.infer<typeof exposeGroupsArgs>): Promise<void> {
  const person = await lookup(ctx, workspace, user);
  if (person?.kind === "member") await groupsApplyTo(ctx, person.member);
}
