// The album's reads: the album page itself, a person's, week and profile pages, and a level's reveal, each for a member
// the website has already verified. Today's convex/website/album.ts over the service's transaction; its commands and
// the hoggie and board reads come in later slices of this stack.
import type { Rarity } from "../album/hoggies/catalogue.ts";
import { earnedEmojisOf, sharedEmojisOf, type EarnedEmoji, type SharedEmoji } from "../album/earnedEmojis.ts";
import { hypesHeldFor } from "../album/items/hypes.ts";
import { leaderboardHugsShownTo } from "../leaderboard/flag.ts";
import { kudosEmojiPicksOf } from "../album/kudosEmojis.ts";
import { type BoardTeam, type Standing } from "../album/boards.ts";
import { emojiInPlaceFor, type EmojiInPlace } from "../album/emojiWizard.ts";
import { albumShownTo, bookNextShownTo, emojiWizardShownTo, kudosEmojiPicksShownTo, personPageDShownTo, shareableUrlsShownTo } from "../album/flag.ts";
import { type AlbumHoggies } from "../album/albumHoggies.ts";
import { levelUpRevealOf, levelUpRevealShownTo, type LevelUpAnswer } from "../album/levelUp.ts";
import { milestonesOf, type MilestoneAnswer } from "../album/milestones.ts";
import { trayOf, type Opening, type TrayItem } from "../album/opening.ts";
import { waitingPacksOf, type WaitingPack } from "../album/packs.ts";
import { type PutIn } from "../album/putIn.ts";
import type { TeamSticker } from "../album/records.ts";
import { albumStickersOf } from "../album/stickers.ts";
import { teamPagesAndPeopleOf, type StoredMatch, type TeamPage, type TeamPagesAndPeople } from "../album/teamPages.ts";
import { currentProfiles, publicNameOf } from "../companyProfiles/matcher.ts";
import { storedCompanyFaceOf } from "../companyProfiles/storedFaces.ts";
import type { Id } from "../db/columns.ts";
import { rarityCapsShownTo } from "../album/hoggies/rarityCaps.ts";
import { petHoggieShownTo } from "../album/hoggies/flag.ts";
import { petsIn, type Pet } from "../album/hoggies/pet.ts";
import { hiddenItemsShownTo } from "../album/items/flag.ts";
import { boardOf, type FaceDown } from "../album/items/ledger.ts";
import { milestonesHeldForTheirTurn } from "../album/items/milestoneUnlocks.ts";
import type { ItemReason } from "../album/items/records.ts";
import { type Turned, type TurnedFace } from "../album/items/turn.ts";
import { type LoopLesson, type Taught } from "../album/items/welcome.ts";
import { xpToReach } from "../progression/levels.ts";
import { progressionHomeOf } from "../progression/progression.ts";
import { nameAndPictureOf, type MemberId } from "../workspace/directory.ts";
import { customEmojiPageOf } from "../workspace/url.ts";
import { workspaceLink } from "../slack/workspaceLink.ts";
import { albumPersonOf, albumProfileOf, albumWeekOf, type AlbumPersonAnswer, type AlbumProfileAnswer, type AlbumWeekAnswer } from "./albumPages.ts";
import { followTheClock } from "./clock.ts";
import { lastVisitOf } from "./lastVisit.ts";
import { linkPreviewsShownTo } from "./linkPreviews.ts";
import { companyTeammateOf, nameless, storedFaceOf, type Face } from "./faces.ts";
import { noLaunchWaitsFor } from "./flag.ts";
import { type VerifiedMember } from "./memberQuery.ts";
import { onboardingOf, type Onboarding } from "./onboarding.ts";
import type { QueryContext } from "../operations.ts";
import { z } from "zod";
import { zv } from "../values.ts";

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

/** The album page: today's `getAlbum`. */
export async function getAlbum(ctx: QueryContext, me: VerifiedMember): Promise<AlbumRead> {
  if (!(await albumShownTo(ctx, me.member))) return { kind: "off" };
  const thanked = thankedPeopleOf(ctx, me.workspace);
  const itemsShown = await hiddenItemsShownTo(ctx, me.member);
  const waiting = itemsShown ? await waitingItemsOf(ctx, me) : null;
  const { packs, more: morePacks } = itemsShown ? noPacks : await packsToOpenOf(ctx, me, thanked);
  const { people: held, morePeople } = await peopleHeldBy(ctx, me, { withInstants: itemsShown });
  const { tray, more: moreTray } = itemsShown ? noTray : await trayShownTo(ctx, me, thanked);
  const pagesAndPeople = await teamPagesAndPeopleOf(ctx, me);
  const { teams, unlisted } = await teamsOf(ctx, pagesAndPeople, new Set(held.map(({ person }) => person)));
  const level = await levelOf(ctx, me.member);
  const milestones = await milestonesShownTo(ctx, me, pagesAndPeople.pages, { itemsShown });
  const picks = await kudosEmojiPicksShownOf(ctx, me.member);
  const earned = await earnedEmojisOf(ctx, me, { pages: pagesAndPeople.pages, milestones, level, ...(waiting !== null && { hypesHeld: hypesHeldFor(waiting) }), picked: picks.kudosEmojiPicks });
  const emojiWizard = await emojiWizardShownTo(ctx, me.member);
  const sharedEmojis = emojiWizard ? null : await sharedEmojisOf(ctx, me.member, earned);
  const emojiPage = await customEmojiPageOf(ctx, me.workspace);
  return { kind: "album", me: await meIn(ctx, me), level, teams, people: [...held, ...unlisted], morePeople, packs, morePacks, tray, moreTray, milestones, emojis: earned.emojis, moreEmojis: earned.more, ...picks, sharedEmojis, emojiPage, emojiWizard, emojiInPlace: await emojiInPlaceFor(ctx, me.member), ...(waiting !== null && { board: await boardShownOf(waiting, thanked) }), ...(await petsShownTo(ctx, me)), ...(itemsShown && { lastVisit: await lastVisitOf(ctx, me.member) }), ...(await shareableUrlsTo(ctx, me)), ...(await onboardingOf(ctx, me, level)), ...(await linkPreviewsOn(ctx, me)), ...(await personPageDOn(ctx, me)), ...(await bookNextOn(ctx, me)), ...(await leaderboardHugsOn(ctx, me)) };
}

async function kudosEmojiPicksShownOf(ctx: QueryContext, member: MemberId): Promise<Pick<AlbumAnswer, "kudosEmojiPicks">> {
  return (await kudosEmojiPicksShownTo(ctx, member)) ? { kudosEmojiPicks: await kudosEmojiPicksOf(ctx, member) } : {};
}

async function shareableUrlsTo(ctx: QueryContext, me: VerifiedMember): Promise<Pick<AlbumAnswer, "shareableUrls">> {
  return (await shareableUrlsShownTo(ctx, me.member)) ? { shareableUrls: true } : {};
}

async function leaderboardHugsOn(ctx: QueryContext, me: VerifiedMember): Promise<Pick<AlbumAnswer, "leaderboardHugs">> {
  return (await leaderboardHugsShownTo(ctx, me.member)) ? { leaderboardHugs: true } : {};
}

async function personPageDOn(ctx: QueryContext, me: VerifiedMember): Promise<Pick<AlbumAnswer, "personPageD">> {
  return (await personPageDShownTo(ctx, me.member)) ? { personPageD: true } : {};
}

async function bookNextOn(ctx: QueryContext, me: VerifiedMember): Promise<Pick<AlbumAnswer, "bookNext">> {
  if (!(await bookNextShownTo(ctx, me.member))) return {};
  return { bookNext: { chatUrl: workspaceLink(me.workspace), rarityCaps: await rarityCapsShownTo(ctx, me.member) } };
}

async function linkPreviewsOn(ctx: QueryContext, me: VerifiedMember): Promise<Pick<AlbumAnswer, "linkPreviews">> {
  return (await linkPreviewsShownTo(ctx, me.member)) ? { linkPreviews: true } : {};
}

async function milestonesShownTo(ctx: QueryContext, me: VerifiedMember, pages: TeamPage[], { itemsShown }: { itemsShown: boolean }): Promise<MilestoneAnswer[]> {
  const milestones = await milestonesOf(ctx, me, pages);
  return itemsShown ? milestonesHeldForTheirTurn(ctx, me.member, milestones) : milestones;
}

const noPacks = { packs: [], more: false };

const noTray = { tray: [], more: false };

type Waiting = { items: FaceDown[]; more: boolean };

async function waitingItemsOf(ctx: QueryContext, me: VerifiedMember): Promise<Waiting> {
  return (await noLaunchWaitsFor(ctx, me)) ? boardOf(ctx, me.member) : { items: [], more: false };
}

async function boardShownOf({ items, more }: Waiting, thanked: ThankedPeople): Promise<ItemBoard> {
  const shown: BoardItem[] = [];
  for (const { reason, ...item } of items) shown.push({ ...item, reason: await boardReasonOf(reason, thanked) });
  return { items: shown, more };
}

async function boardReasonOf(reason: ItemReason, thanked: ThankedPeople): Promise<BoardReason> {
  return reason.kind === "thanks" ? { kind: "thanks", person: reason.person, thanked: await thanked(reason.person) } : reason;
}

async function petsShownTo(ctx: QueryContext, me: VerifiedMember): Promise<Pick<AlbumAnswer, "pets">> {
  return (await petHoggieShownTo(ctx, me.member)) ? { pets: await petsIn(ctx, me.workspace) } : {};
}

async function teamsOf(ctx: QueryContext, pagesAndPeople: TeamPagesAndPeople, listed: Set<MemberId>): Promise<{ teams: AlbumTeam[]; unlisted: AlbumPerson[] }> {
  const named = new Map((await currentProfiles(ctx)).map((profile) => [profile.profile, publicNameOf(profile)]));
  const teams = pagesAndPeople.pages.map(({ unmatched, ...page }) => ({ ...page, unmatched: unmatched.flatMap((profile) => named.get(profile) ?? []) }));
  return { teams, unlisted: await unlistedPeopleOn(ctx, pagesAndPeople, listed, named) };
}

async function unlistedPeopleOn(ctx: QueryContext, { pages, held, matchOf }: TeamPagesAndPeople, listed: Set<MemberId>, named: Map<number, string>): Promise<AlbumPerson[]> {
  const onAPage = new Set(pages.flatMap(({ people }) => people));
  const unlisted = [...onAPage].filter((person) => !listed.has(person));
  return Promise.all(unlisted.map((person) => unlistedPersonOf(ctx, person, held.has(person), matchOf.get(person), named)));
}

async function unlistedPersonOf(ctx: QueryContext, person: MemberId, isHeld: boolean, match: StoredMatch | undefined, named: Map<number, string>): Promise<AlbumPerson> {
  const name = match === undefined ? undefined : named.get(match.profile);
  const companyFace = match?.face ?? null;
  const picture = companyFace === null ? (await nameAndPictureOf(ctx, person)).picture : null;
  return { person, ...companyTeammateOf(name, picture, companyFace), held: isHeld };
}

async function packsToOpenOf(ctx: QueryContext, me: VerifiedMember, thanked: ThankedPeople): Promise<{ packs: AlbumPack[]; more: boolean }> {
  if (!(await noLaunchWaitsFor(ctx, me))) return { packs: [], more: false };
  const { packs, more } = await waitingPacksOf(ctx, me.member);
  const named: AlbumPack[] = [];
  for (const pack of packs) named.push({ ...pack, thanked: await thanked(pack.person) });
  return { packs: named, more };
}

async function trayShownTo(ctx: QueryContext, me: VerifiedMember, thanked: ThankedPeople): Promise<{ tray: AlbumTrayItem[]; more: boolean }> {
  const { tray, more } = await trayOf(ctx, me.member);
  return { tray: await shownItemsOf(tray, thanked), more };
}

async function shownItemsOf(items: TrayItem[], thanked: ThankedPeople): Promise<AlbumTrayItem[]> {
  const shown: AlbumTrayItem[] = [];
  for (const item of items) shown.push(await shownItemOf(item, thanked));
  return shown;
}

async function shownItemOf(item: TrayItem, thanked: ThankedPeople): Promise<AlbumTrayItem> {
  return item.kind === "sticker" ? { ...item, thanked: await thanked(item.person) } : item;
}

type ThankedPeople = (person: MemberId) => Promise<Thanked>;

function thankedPeopleOf(ctx: QueryContext, workspace: string): ThankedPeople {
  const known = new Map<MemberId, Promise<Thanked>>();
  return (person) => {
    if (!known.has(person)) known.set(person, storedPersonOf(ctx, workspace, person));
    return known.get(person)!;
  };
}

/** A level's reveal: today's `getLevelUp`. */
export const getLevelUpArgs = z.strictObject({ level: zv.number() });
export async function getLevelUp(ctx: QueryContext, me: VerifiedMember, { level }: z.infer<typeof getLevelUpArgs>): Promise<LevelUpRead> {
  if (!(await levelUpRevealShownTo(ctx, me.member))) return { kind: "off" };
  return (await levelUpRevealOf(ctx, me, level)) ?? { kind: "none" };
}

/** A person's page: today's `getAlbumPerson`. */
export const getAlbumPersonArgs = z.strictObject({ person: z.string() });
export async function getAlbumPerson(ctx: QueryContext, me: VerifiedMember, { person }: z.infer<typeof getAlbumPersonArgs>): Promise<AlbumPersonRead> {
  if (!(await albumShownTo(ctx, me.member))) return { kind: "off" };
  const member = memberIdIn(person);
  return member === null ? { kind: "no-person" } : albumPersonOf(ctx, me, member);
}

/**
 * The service's stand-in for Convex's `normalizeId("members", person)`. Its IDs carry no table, so any string Postgres
 * can hold as text passes on, and the page's read answers `no-person` when no such member exists. A null character
 * Postgres refuses as text, so that string is no member before any read, as `normalizeId` refused it.
 */
export function memberIdIn(person: string): MemberId | null {
  return person.includes("\u0000") ? null : (person as MemberId);
}

/** A week's issue: today's `getAlbumWeek`. */
export const getAlbumWeekArgs = z.strictObject({ week: z.optional(z.string()) });
export async function getAlbumWeek(ctx: QueryContext, me: VerifiedMember, { week }: z.infer<typeof getAlbumWeekArgs>): Promise<AlbumWeekRead> {
  if (!(await albumShownTo(ctx, me.member))) return { kind: "off" };
  await followTheClock(ctx);
  return albumWeekOf(ctx, me, week);
}

/** The profile page's album part: today's `getAlbumProfile`. */
export async function getAlbumProfile(ctx: QueryContext, me: VerifiedMember): Promise<AlbumProfileRead> {
  return (await albumShownTo(ctx, me.member)) ? albumProfileOf(ctx, me, mostPeopleShown) : { kind: "off" };
}

async function meIn(ctx: QueryContext, me: VerifiedMember): Promise<AlbumAnswer["me"]> {
  return { name: me.name ?? nameless, face: await storedFaceOf(ctx, me), person: me.member };
}

export async function levelOf(ctx: QueryContext, member: MemberId): Promise<AlbumAnswer["level"]> {
  const { level, xp } = await progressionHomeOf(ctx, member);
  return { level, xp, startsAt: xpToReach(level), nextAt: xpToReach(level + 1) };
}

async function peopleHeldBy(ctx: QueryContext, me: VerifiedMember, { withInstants }: { withInstants: boolean }): Promise<{ people: AlbumPerson[]; morePeople: boolean }> {
  const { stickers, more } = await albumStickersOf(ctx, me.member, mostPeopleShown);
  const people: AlbumPerson[] = [];
  for (const { person, at } of stickers) {
    const { name, face } = await storedPersonOf(ctx, me.workspace, person);
    people.push({ person, name: name ?? nameless, face, held: true, ...(withInstants && { at }) });
  }
  return { people, morePeople: more };
}

async function storedPersonOf(ctx: QueryContext, workspace: string, person: MemberId): Promise<Thanked> {
  const { name, picture } = await nameAndPictureOf(ctx, person);
  const { face } = companyTeammateOf(name, picture, (await storedCompanyFaceOf(ctx, workspace, person)) ?? null);
  return { name: name ?? null, face };
}
