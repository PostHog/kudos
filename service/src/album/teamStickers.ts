// The module map's skeleton of convex/album/teamStickers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Instants } from "./packs.ts";
import type { TeamSticker } from "./records.ts";
import { type ShownEmoji } from "./earnedEmojis.ts";
import { type PageOwner, type TeamPage } from "./teamPages.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export async function unlockTeamStickerOf(ctx: MutationContext, owner: PageOwner, team: string, at: number): Promise<TeamSticker | null> {
  throw notPorted("album.teamStickers.unlockTeamStickerOf");
}

export async function unlockReadyTeamsAmong(ctx: MutationContext, owner: PageOwner, pages: TeamPage[], at: number): Promise<TeamSticker[]> {
  throw notPorted("album.teamStickers.unlockReadyTeamsAmong");
}

export type UnlockedTeam = Pick<TeamSticker, "name"> & { count: number; emoji: ShownEmoji | null };

export async function teamsUnlockedIn(ctx: QueryContext, workspace: string, week: Instants, most: number): Promise<UnlockedTeam[]> {
  throw notPorted("album.teamStickers.teamsUnlockedIn");
}
