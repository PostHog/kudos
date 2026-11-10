// The module map's skeleton of convex/website/playerCard.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { EmojiStack } from "../album/earnedEmojis.ts";
import type { AlbumHoggie } from "../album/albumHoggies.ts";
import type { PersonTeam } from "../album/personPage.ts";
import type { MilestoneId, MilestoneTier } from "../album/records.ts";
import type { BoardPlace } from "../leaderboard/boards.ts";
import type { MemberId } from "../workspace/directory.ts";
import type { AlbumAnswer } from "./album.ts";
import type { AlbumIssue, AlbumPersonFace } from "./albumPages.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type CardHoggie = Pick<AlbumHoggie, "hoggie" | "name" | "rarity"> & { firstAt: number };

export type CardMedal = { milestone: MilestoneId; tier: MilestoneTier };

export type PlayerCard = AlbumPersonFace & {
  team: PersonTeam | null;
  level: AlbumAnswer["level"] | null;
  place: BoardPlace | null;
  people: { held: number; newest: AlbumPersonFace[] };
  hoggies: { found: number; total: number; rarest: CardHoggie | null } | null;
  medals: { count: number; best: CardMedal[] };
};

export type CardWeek = { days: number[]; thanked: number; thankedBy: number; packsOpened: number; hugs: number; kudosOfWeek: AlbumIssue["kudosOfWeek"] };

export type PlayerCardAnswer = { kind: "card"; card: PlayerCard; week?: CardWeek };

export type PlayerCardRead = PlayerCardAnswer | { kind: "off" } | { kind: "no-person" };

export type CardEmojisRead = ({ kind: "emojis" } & EmojiStack) | { kind: "off" } | { kind: "no-person" };

export const emojisOnTheCard = 4;

export async function playerCardOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<PlayerCard> {
  throw notPorted("website.playerCard.playerCardOf");
}
