// The footer that points a member at their message settings, as today's convex/feedback/settingsFooter.ts: only where
// message settings are on for them.
import { messageSettingsOnFor } from "../messageSettings/flag.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { QueryContext } from "../operations.ts";

export type SettingsFooter = { appHome: string; rest: string };

const settingsFooter: SettingsFooter = { appHome: "Change what I send you", rest: " in App Home's Settings tab." };

export async function settingsFooterFor(ctx: QueryContext, member: MemberId | null): Promise<SettingsFooter | null> {
  return member !== null && (await messageSettingsOnFor(ctx, member)) ? settingsFooter : null;
}
