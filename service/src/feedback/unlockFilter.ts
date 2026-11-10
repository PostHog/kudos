// What a member is told about a feature that unlocks: only once it is open or shipped to them, and the reply to a
// command for one that isn't open yet. Ported from convex/feedback/unlockFilter.ts.
import { xpLevelsShownIn } from "../progression/xpLevels.ts";
import { featureValidator, type Feature } from "../unlocks/feature.ts";
import { unlocksLiveIn, unlocksShownTo } from "../unlocks/launch.ts";
import { storeShownAndExposedTo } from "../store/visibility.ts";
import { namedFor, scheduled, shippedIn, withoutTheStore, type ScheduledFeature, type StoreNaming } from "../unlocks/schedule.ts";
import { stateOf, type UnlockState } from "../unlocks/unlocks.ts";
import { lookup, type MemberId } from "../workspace/directory.ts";
import type { Line } from "./segments.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";

export async function whenOpened<T>(ctx: QueryContext, member: MemberId, feature: Feature, told: T): Promise<T | null> {
  return (await isOpened(ctx, member, feature)) ? told : null;
}

export async function whenShipped<T>(ctx: QueryContext, member: MemberId, feature: Feature, told: T): Promise<T | null> {
  return (await stateOf(ctx, member, feature)) === "unshipped" ? null : told;
}

export async function isOpened(ctx: QueryContext, member: MemberId, feature: Feature): Promise<boolean> {
  return (await stateOf(ctx, member, feature)) === "open";
}

export type UnopenedReply = { lines: Line[] | null; shownToUnknownViewer: boolean | null };

export const unopenedReplyOfArgs = z.strictObject({ workspace: z.string(), user: z.string(), feature: featureValidator });
export async function unopenedReplyOf(ctx: MutationContext, { workspace, user, feature }: z.infer<typeof unopenedReplyOfArgs>): Promise<UnopenedReply> {
  const person = await lookup(ctx, workspace, user);
  if (person?.kind === "member") return { lines: await memberReplyOf(ctx, person.member, feature), shownToUnknownViewer: null };
  if (person !== undefined || !(await xpLevelsShownIn(ctx, workspace))) return { lines: null, shownToUnknownViewer: null };
  const shown = await unlocksLiveIn(ctx, workspace);
  const lines = shown ? replyOf(feature, await strangerStateOf(ctx, workspace, feature), withoutTheStore) : null;
  return { lines, shownToUnknownViewer: shown };
}

export function renderUnopenedReply(feature: ScheduledFeature, state: "ready" | "locked"): Line[] {
  return [[{ text: unopenedTextOf(feature, state) }]];
}

export function unopenedTextOf({ name, level }: ScheduledFeature, state: "ready" | "locked") {
  return state === "ready" ? `${name} is ready for you. Open it in App Home.` : `${name} opens at level ${level}.`;
}

async function memberReplyOf(ctx: MutationContext, member: MemberId, feature: Feature) {
  if (!(await unlocksShownTo(ctx, member))) return null;
  const storeShown = feature === "coins" && (await storeShownAndExposedTo(ctx, member));
  return replyOf(feature, await stateOf(ctx, member, feature), { storeShown });
}

function replyOf(feature: Feature, state: UnlockState, naming: StoreNaming): Line[] | null {
  return state === "ready" || state === "locked" ? renderUnopenedReply(namedFor(scheduled(feature), naming), state) : null;
}

async function strangerStateOf(ctx: QueryContext, workspace: string, feature: Feature): Promise<UnlockState> {
  const shipped = (await shippedIn(ctx, workspace)).some((entry) => entry.feature === feature);
  return shipped ? "locked" : "unshipped";
}
