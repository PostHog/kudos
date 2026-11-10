// The module map's skeleton of convex/website/album.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import type { Rarity } from "../album/hoggies/catalogue.ts";
import { type EarnedEmoji, type SharedEmoji } from "../album/earnedEmojis.ts";
import { type BoardTeam, type Standing } from "../album/boards.ts";
import { type EmojiInPlace } from "../album/emojiWizard.ts";
import { type AlbumHoggies } from "../album/albumHoggies.ts";
import { type LevelUpAnswer } from "../album/levelUp.ts";
import { type MilestoneAnswer } from "../album/milestones.ts";
import { type Opening, type TrayItem } from "../album/opening.ts";
import { type WaitingPack } from "../album/packs.ts";
import { type PutIn } from "../album/putIn.ts";
import type { TeamSticker } from "../album/records.ts";
import { type TeamPage } from "../album/teamPages.ts";
import { type Pet } from "../album/hoggies/pet.ts";
import { type FaceDown } from "../album/items/ledger.ts";
import type { ItemReason } from "../album/items/records.ts";
import { type Turned, type TurnedFace } from "../album/items/turn.ts";
import { type LoopLesson, type Taught } from "../album/items/welcome.ts";
import { type MemberId } from "../workspace/directory.ts";
import { type AlbumPersonAnswer, type AlbumProfileAnswer, type AlbumWeekAnswer } from "./albumPages.ts";
import { type Face } from "./faces.ts";
import { type Onboarding } from "./onboarding.ts";
import type { Id } from "../db/columns.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

export type AlbumAnswer = {
  kind: "album";
  me: { name: string; face: Face; person: MemberId };
  level: { level: number; xp: number; startsAt: number; nextAt: number };
  teams: AlbumTeam[];
  people: AlbumPerson[];
  morePeople: boolean;
  packs: AlbumPack[];
  morePacks: boolean;
  tray: AlbumTrayItem[];
  moreTray: boolean;
  milestones: MilestoneAnswer[];
  emojis: EarnedEmoji[];
  moreEmojis: boolean;
  kudosEmojiPicks?: string[];
  sharedEmojis: SharedEmoji[] | null;
  emojiPage: string | null;
  emojiWizard: boolean;
  emojiInPlace: EmojiInPlace;
  board?: ItemBoard;
  pets?: Pet[];
  lastVisit?: number | null;
  shareableUrls?: true;
  linkPreviews?: true;
  personPageD?: true;
  bookNext?: BookNext;
  leaderboardHugs?: true;
} & Onboarding;

export type BookNext = { chatUrl: string; rarityCaps: boolean };

export const mostPeopleShown = 500;

export type AlbumTeam = Omit<TeamPage, "unmatched"> & { unmatched: string[] };

export type AlbumPerson = { person: MemberId; name: string; face: Face; held: boolean; at?: number };

export type Thanked = { name: string | null; face: Face };

export type AlbumPack = WaitingPack & { thanked: Thanked };

export type AlbumTrayItem = Exclude<TrayItem, { kind: "sticker" }> | (Extract<TrayItem, { kind: "sticker" }> & { thanked: Thanked });

export type AlbumRead = { kind: "off" } | AlbumAnswer;

export type BoardReason = { kind: "thanks"; person: MemberId; thanked: Thanked } | Exclude<ItemReason, { kind: "thanks" }>;

export type BoardItem = Omit<FaceDown, "reason"> & { reason: BoardReason };

export type ItemBoard = { items: BoardItem[]; more: boolean };

export type { LoopLesson };

export type TurnedFaceShown = Exclude<TurnedFace, { kind: "sticker" }> | (Extract<TurnedFace, { kind: "sticker" }> & { thanked: Thanked });

export type TurnAnswer = ({ kind: "turned" } & Omit<Turned, "face"> & { face: TurnedFaceShown } & Taught) | { kind: "refused" };

export type OpenAnswer = { kind: "opened"; items: AlbumTrayItem[]; applied: Opening["applied"] } | { kind: "refused" };

export type UnlockAnswer = { kind: "unlocked"; sticker: TeamSticker } | { kind: "refused" };

export type PutInAnswer = { kind: "placed"; item: AlbumTrayItem } | { kind: "refused" };

export type SeenAnswer = { kind: "seen"; ids: string[] } | { kind: "refused" };

export type PutAllInAnswer = { kind: "placed"; items: AlbumTrayItem[]; more: PutIn["more"] } | { kind: "refused" };

export type BoardPersonRow = { person: MemberId; name: string; face: Face; teams: string[]; thoughtful: number; you: boolean } & Standing;

export type BoardTeamRow = BoardTeam & Standing;

export type ThoughtfulBoardsAnswer = {
  kind: "boards";
  people: BoardPersonRow[];
  teams: BoardTeamRow[];
  pinned: { me: BoardPersonRow | null; teams: BoardTeamRow[] };
  onTheBoards: boolean;
};

export type ThoughtfulBoardsRead = { kind: "off" } | ThoughtfulBoardsAnswer;

export type AlbumPersonRead = { kind: "off" } | { kind: "no-person" } | AlbumPersonAnswer;

export type AlbumWeekRead = { kind: "off" } | AlbumWeekAnswer;

export type AlbumProfileRead = { kind: "off" } | AlbumProfileAnswer;

export type AlbumHoggiesAnswer = { kind: "hoggies" } & AlbumHoggies & { pet?: string | null; forge?: ForgeOffered };

export type ForgeOffered = { upTo: Rarity };

export type PetAnswer = { kind: "picked"; pet: string } | { kind: "refused" };

export type ForgeAnswer = { kind: "forged"; item: Id<"items"> } | { kind: "refused" };

export type AlbumHoggiesRead = { kind: "off" } | AlbumHoggiesAnswer;

export type LevelUpRead = { kind: "off" } | { kind: "none" } | LevelUpAnswer;

export type LeaderboardViewAnswer = { kind: "viewed" } | { kind: "refused" };

export async function levelOf(ctx: QueryContext, member: MemberId): Promise<AlbumAnswer["level"]> {
  throw notPorted("website.album.levelOf");
}
