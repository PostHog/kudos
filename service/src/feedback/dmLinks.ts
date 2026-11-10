// The website links a direct message or a kudos reply carries, as today's convex/feedback/dmLinks.ts, each marked with
// where the visit came from. None where the member has no website to visit.
import { websiteOriginFor } from "../website/link.ts";
import { linkFrom, type VisitSource } from "../website/visitSource.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export type DmLinks = { book: string; quests: string };

export type ReplyLinks = DmLinks & { home: string };

export async function dmLinksFor(ctx: QueryContext, workspace: string, member: MemberId, source: VisitSource): Promise<DmLinks | null> {
  const origin = await websiteOriginFor(ctx, workspace, member);
  return origin === null ? null : dmLinksAt(origin, source);
}

export async function replyLinksFor(ctx: QueryContext, workspace: string, member: MemberId): Promise<ReplyLinks | null> {
  const origin = await websiteOriginFor(ctx, workspace, member);
  return origin === null ? null : { home: linkFrom("reply", `${origin}/`), ...dmLinksAt(origin, "reply") };
}

function dmLinksAt(origin: string, source: VisitSource): DmLinks {
  return { book: linkFrom(source, `${origin}/book`), quests: linkFrom(source, `${origin}/book#me/quests`) };
}
