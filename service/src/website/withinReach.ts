// The module map's skeleton of convex/website/withinReach.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { EmojiProgress, ShownEmoji } from "../album/earnedEmojis.ts";
import type { Nudge } from "../album/hypeReactions.ts";
import type { PageOwner } from "../album/teamPages.ts";
import type { AlbumPersonFace } from "./albumPages.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type ReachableEmoji = { emoji: ShownEmoji; progress: EmojiProgress };

export type WithinReach = { hype: (ReachableEmoji & { person: AlbumPersonFace }) | null; team: (ReachableEmoji & { teamName: string }) | null; level: (ReachableEmoji & { level: number }) | null };

export async function withinReachOf(ctx: QueryContext, owner: PageOwner, nudge: Nudge | null): Promise<WithinReach> {
  throw notPorted("website.withinReach.withinReachOf");
}
