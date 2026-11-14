// A member's one preview of a moment, such as unlocks before their workspace's launch.
// Today's convex/unlocks/previewMoments.ts over the service's transaction.
import { and, eq } from "drizzle-orm";
import { toDocument } from "../db/documents.ts";
import { indexOrder } from "../db/indexOrder.ts";
import { previewMoments, type Doc } from "../db/schema/index.ts";
import { unique } from "../db/unique.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export type PreviewedMoment = Doc<"previewMoments">["moment"];

const byMemberMoment = indexOrder(previewMoments, ["member", "moment"]);

/** The member's preview of the moment, or `null`; two fail, as `.unique()` did. */
export async function previewMomentOf(ctx: QueryContext, member: MemberId, moment: PreviewedMoment): Promise<null | Doc<"previewMoments">> {
  const row = unique("previewMoments", await ctx.tx.select().from(previewMoments).where(and(eq(previewMoments.member, member), eq(previewMoments.moment, moment))).orderBy(...byMemberMoment.orderBy()).limit(2));
  return row === null ? null : toDocument<Doc<"previewMoments">>(previewMoments, row);
}
