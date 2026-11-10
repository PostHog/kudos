// The module map's skeleton of convex/feedback/dmLinks.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type VisitSource } from "../website/visitSource.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type DmLinks = { book: string; quests: string };

export type ReplyLinks = DmLinks & { home: string };

export async function dmLinksFor(ctx: QueryContext, workspace: string, member: MemberId, source: VisitSource): Promise<DmLinks | null> {
  throw notPorted("feedback.dmLinks.dmLinksFor");
}

export async function replyLinksFor(ctx: QueryContext, workspace: string, member: MemberId): Promise<ReplyLinks | null> {
  throw notPorted("feedback.dmLinks.replyLinksFor");
}
