// Whether the album speaks in Slack, as today's convex/feedback/albumSlack.ts: only where the album shows and the
// album-slack flag is on.
import { memberDecisionWithoutWriting, workspaceDecisionWithoutWriting, type Flag } from "../analytics/flags.ts";
import { albumFlag, albumShownTo } from "../album/flag.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export const albumSlackFlag = { key: "album-slack", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function albumSlackAppliesTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  return (await albumShownTo(ctx, member)) && (await memberDecisionWithoutWriting(ctx, albumSlackFlag, member));
}

export async function albumSlackAppliesToWorkspace(ctx: QueryContext, workspace: string): Promise<boolean> {
  return (await workspaceDecisionWithoutWriting(ctx, albumFlag, workspace)) && (await workspaceDecisionWithoutWriting(ctx, albumSlackFlag, workspace));
}

export function publicPictureOf(picture: string, origin: string | null): string | null {
  if (!picture.startsWith("/")) return picture;
  return origin === null ? null : `${origin}${picture}`;
}
