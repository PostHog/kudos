// The module map's skeleton of convex/website/questBeatsFlag.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type Flag } from "../analytics/flags.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export const questBeatsFlag = { key: "quest-beats", safeDefault: false, values: [false, true] } as const satisfies Flag<boolean>;

export function questBeatsShownTo(ctx: QueryContext, member: MemberId): Promise<boolean> {
  throw notPorted("website.questBeatsFlag.questBeatsShownTo");
}
