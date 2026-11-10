// Attribution: each kudos message counted once for the giver's primary group at its spend instant, and each award for
// its recipient's, after reconciling everyone it names. Only ever inserted. Today's convex/groups/attribution.ts over
// the service's transaction; the paged read for backfills lands with the leaderboard's backfill (S11 11.3).
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { kudosGivenEventValidator, membersNamedIn, type AwardsAttributedEvent, type KudosGivenEvent } from "../bus/events.ts";
import type { Id } from "../db/columns.ts";
import { attributions } from "../db/schema/index.ts";
import type { MessageRef } from "../engine/messageEvent.ts";
import { mutationJob } from "../jobs/define.ts";
import { notPorted } from "../notPorted.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { gateDecisionOf } from "../progression/gate.ts";
import { zv } from "../values.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { GroupId } from "./groups.ts";
import { primaryGroupAt } from "./history.ts";
import { reconcilePageOf } from "./reconcile.ts";
import { insertDocument } from "./rows.ts";

export const attributeKudosGivenArgs = z.strictObject({ event: kudosGivenEventValidator, unreconciled: z.optional(z.array(zv.id("members"))) });
export async function attributeKudosGiven(ctx: MutationContext, { event, unreconciled }: z.infer<typeof attributeKudosGivenArgs>): Promise<void> {
  if (await wasAttributed(ctx, event.message)) return;
  const left = await reconcilePageOf(ctx, unreconciled ?? membersNamedIn(event));
  if (left.length > 0) {
    await ctx.jobs.enqueue(attributeKudosGivenJob, { event, unreconciled: left });
    return;
  }
  const people = membersNamedIn(event);
  const groupAtSpend = await primaryGroupsAt(ctx, people, event.at);
  const attribution = attributionOf(event, groupAtSpend);
  await insertDocument(ctx.tx, attributions, { ...ctx.newRow(), ...attribution.message, ...attribution.facts });
  const attributed: AwardsAttributedEvent = { type: "awardsAttributed", message: attribution.message, ...attribution.facts };
  await ctx.publish(attributed);
}
export const attributeKudosGivenJob = mutationJob("groups.attribution.attributeKudosGiven", attributeKudosGivenArgs, attributeKudosGiven);

function attributionOf({ workspace, message, giver, awards, annotations, day, at }: KudosGivenEvent, groupAtSpend: Map<MemberId, GroupId | null>) {
  const saysWhy = gateDecisionOf(annotations)?.thoughtful === true;
  const attributed = awards.map(({ award, recipient, kudos }) => ({ award, recipient, kudos, saysWhy, recipientGroup: groupAtSpend.get(recipient) ?? null }));
  const kudos = awards.reduce((sum, award) => sum + award.kudos, 0);
  return { message, facts: { workspace, giver, group: groupAtSpend.get(giver) ?? null, kudos, day, at, awards: attributed } };
}

export async function attributedToGroupPage(ctx: QueryContext, group: GroupId, { from, to }: { from: number; to: number }, cursor: string | null, numItems: number): Promise<{ events: { fact?: string; type: "awardsAttributed"; workspace: string; at: number; group: null | Id<"userGroups">; message: { workspace: string; conversation: string; message: string }; giver: Id<"members">; kudos: number; day: string; awards: { kudos: number; award: Id<"awards">; recipient: Id<"members">; saysWhy: boolean; recipientGroup: null | Id<"userGroups"> }[] }[]; isDone: boolean; continueCursor: string }> {
  throw notPorted("groups.attribution.attributedToGroupPage");
}

async function primaryGroupsAt(ctx: QueryContext, people: MemberId[], at: number) {
  const groups = new Map<MemberId, GroupId | null>();
  for (const member of people) groups.set(member, await primaryGroupAt(ctx, member, at));
  return groups;
}

async function wasAttributed(ctx: MutationContext, { workspace, conversation, message }: MessageRef): Promise<boolean> {
  const rows = await ctx.tx
    .select({ _id: attributions._id })
    .from(attributions)
    .where(and(eq(attributions.workspace, workspace), eq(attributions.conversation, conversation), eq(attributions.message, message)))
    .limit(2);
  if (rows.length > 1) throw new Error("More than one attributions row matched a read for one");
  return rows.length === 1;
}
