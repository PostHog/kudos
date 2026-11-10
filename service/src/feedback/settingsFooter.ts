// The module map's skeleton of convex/feedback/settingsFooter.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type SettingsFooter = { appHome: string; rest: string };

export async function settingsFooterFor(ctx: QueryContext, member: MemberId | null): Promise<SettingsFooter | null> {
  throw notPorted("feedback.settingsFooter.settingsFooterFor");
}
