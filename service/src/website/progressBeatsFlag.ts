// The module map's skeleton of convex/website/progressBeatsFlag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const progressBeatsFlag = { key: "progress-beats", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function progressBeatsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("website.progressBeatsFlag.progressBeatsShownTo");
}
