// The module map's skeleton of convex/feedback/sentNotices.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import { zv } from "../values.ts";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const sentNoticeValidator = z.strictObject({ member: zv.id("members"), notice: z.union([z.literal("first-hug-reply"), z.literal("coins-opened")]) });

type Notice = z.infer<typeof sentNoticeValidator>["notice"];

export async function sendsOnce(ctx: MutationContext, member: MemberId, notice: Notice): Promise<boolean> {
  throw notPorted("feedback.sentNotices.sendsOnce");
}
