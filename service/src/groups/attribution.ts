// The module map's skeleton of convex/groups/attribution.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { kudosGivenEventValidator } from "../bus/events.ts";
import type { GroupId } from "./groups.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

export const attributeKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator, unreconciled: z.optional(z.array(zv.id("members"))) });
export async function attributeKudosGiven(ctx: MutationContext, args: z.infer<typeof attributeKudosGivenArgs>): Promise<void> {
  throw notPorted("groups.attribution.attributeKudosGiven");
}
export const attributeKudosGivenJob = mutationJob("groups.attribution.attributeKudosGiven", attributeKudosGivenArgs, attributeKudosGiven);

export async function attributedToGroupPage(ctx: QueryContext, group: GroupId, { from, to }: { from: number; to: number }, cursor: string | null, numItems: number): Promise<{ events: { fact?: string; type: "awardsAttributed"; workspace: string; at: number; group: null | Id<"userGroups">; message: { workspace: string; conversation: string; message: string }; giver: Id<"members">; kudos: number; day: string; awards: { kudos: number; award: Id<"awards">; recipient: Id<"members">; saysWhy: boolean; recipientGroup: null | Id<"userGroups"> }[] }[]; isDone: boolean; continueCursor: string }> {
  throw notPorted("groups.attribution.attributedToGroupPage");
}
