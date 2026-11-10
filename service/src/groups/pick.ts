// A member picking their primary group among the groups they count in.
// Today's convex/groups/pick.ts over the service's transaction.
import { memberGroups, members, type Doc } from "../db/schema/index.ts";
import { eq } from "drizzle-orm";
import type { MutationContext, QueryContext } from "../operations.ts";
import type { MemberId } from "../workspace/directory.ts";
import { countingGroupsOf, memberGroupsOf, type GroupId, type GroupRef } from "./groups.ts";
import { recordChange } from "./history.ts";
import { reconcileMember } from "./reconcile.ts";
import { patchDocument, uniqueOf } from "./rows.ts";

export type PickOutcome = "picked" | "kept" | "refused";

export type GroupChoice = { primary: GroupRef; groups: GroupRef[] };

export async function pickPrimaryGroup(ctx: MutationContext, member: MemberId, group: GroupId): Promise<PickOutcome> {
  await reconcileMember(ctx, member);
  const row = await memberGroupsOf(ctx, member);
  const person = uniqueOf<Doc<"members">>(members, await ctx.tx.select().from(members).where(eq(members._id, member)));
  if (row === null || person === null || !row.groups.includes(group)) return "refused";
  if (row.primary === group) return "kept";
  await patchDocument(ctx.tx, memberGroups, row, { primary: group });
  await recordChange(ctx, person, row.primary, group, "picked", ctx.now);
  return "picked";
}

export async function groupChoiceOf(ctx: QueryContext, member: MemberId): Promise<GroupChoice | null> {
  const groups = await countingGroupsOf(ctx, member);
  const primaryId = (await memberGroupsOf(ctx, member))?.primary ?? null;
  const primary = groups.find(({ group }) => group === primaryId);
  return primary === undefined ? null : { primary, groups };
}
