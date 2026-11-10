// The module map's skeleton of convex/feedback/albumSlack.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const albumSlackFlag = { key: "album-slack", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export async function albumSlackAppliesTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("feedback.albumSlack.albumSlackAppliesTo");
}

export async function albumSlackAppliesToWorkspace(ctx: QueryContext, workspace: string): Promise<boolean> {
  throw notPorted("feedback.albumSlack.albumSlackAppliesToWorkspace");
}

export function publicPictureOf(picture: string, origin: string | null): string | null {
  if (!picture.startsWith("/")) return picture;
  return origin === null ? null : `${origin}${picture}`;
}
