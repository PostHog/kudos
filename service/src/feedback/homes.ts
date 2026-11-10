// The module map's skeleton of convex/feedback/homes.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// The member's App Home: which tabs it shows, what each tab holds, the tab and period it opens on, and when it is
// published again. Ported from convex/feedback/homes.ts; Slack's publishing is slack/appHome.ts.
import { bookFactsOf, type AchievementFacts } from "../achievements/achievements.ts";
import { achievementsApplyIn, achievementsShownTo } from "../achievements/flag.ts";
import { groupModeShownTo, type GroupModeFacts } from "../groups/groupMode.ts";
import { avatarChoiceOf, type AvatarChoice } from "../album/hoggies/avatar.ts";
import { crateStoreOf, waitingCratesOf, type CrateStore } from "../album/hoggies/boughtCrates.ts";
import { hoggiesOf, type HoggiesHome } from "../album/hoggies/collection.ts";
import { teamsCompletedBy } from "../stickers/completionRecords.ts";
import { teamSpiritShownTo } from "../stickers/flag.ts";
import { crateStoreShownTo, crestsShownTo, hoggiesShownTo } from "../album/hoggies/flag.ts";
import { xpRecordedEventValidator } from "../bus/events.ts";
import { groupsShownAndExposedTo, type GroupId } from "../groups/groups.ts";
import { groupChoiceOf, type GroupChoice } from "../groups/pick.ts";
import type { GroupsBoard } from "../leaderboard/groupsBoard.ts";
import type { MyGroupBoardView } from "../leaderboard/myGroupBoard.ts";
import { everyoneMeasureFor, isEveryoneBoardShownTo } from "../leaderboard/flag.ts";
import type { Period } from "../leaderboard/periods.ts";
import { mondayPostSwitchShownTo, type MondayPostSwitch } from "../leaderboard/mondayPost.ts";
import { welcomeNudgeSwitchOf } from "./welcomeNudge.ts";
import { celebrationsSwitchShownTo } from "../workspace/celebrationsSwitch.ts";
import { thoughtfulGiversShownTo } from "../album/thoughtfulGivers.ts";
import { teaserOf } from "./teaser.ts";
import { everyoneBoardOf, type EveryoneBoardView } from "../leaderboard/totals.ts";
import { isOnTheBoards } from "../leaderboard/visibility.ts";
import { messageSettingsShownTo } from "../messageSettings/flag.ts";
import { messageSettingsOf, notificationSwitchesOf, type MessageSetting, type ShownNotificationSwitches } from "../messageSettings/messageSettings.ts";
import { memberPerksOf, ownsEveryPerk, type MemberPerks } from "../progression/perks.ts";
import { skillTreeShownTo } from "../progression/skillTree.ts";
import { progressionHomeOf, type ProgressionHome } from "../progression/progression.ts";
import { xpLevelsOnFor, xpLevelsShownIn, xpLevelsShownTo } from "../progression/xpLevels.ts";
import { customKudosEmojiPickerFor, type CustomKudosEmojiPicker } from "../store/customKudosEmoji.ts";
import { inventoryHomeOf, type InventoryHome } from "../store/inventory.ts";
import type { ItemRefusal } from "../store/rows.ts";
import { homeRefusalValidator, type HomeRefusal } from "./homeRefusal.ts";
import { storeShownAndExposedTo } from "../store/visibility.ts";
import { unlocksShownTo } from "../unlocks/launch.ts";
import { namedFor, scheduled, type ScheduledFeature, type StoreNaming } from "../unlocks/schedule.ts";
import { unlocksHomeOf, type UnlocksHome } from "../unlocks/unlocks.ts";
import { coinsVisibleAndExposedTo } from "../wallet/visibility.ts";
import { balanceOf } from "../wallet/wallet.ts";
import { adminsPageIn, chatUserOf, lookup, type MemberFacts, type MemberId } from "../workspace/directory.ts";
import { settingsOf } from "../workspace/settings.ts";
import { isOpened, whenOpened, whenShipped } from "./unlockFilter.ts";
import { eq } from "drizzle-orm";
import { homeSelections } from "../db/schema/feedback.ts";
import { members } from "../db/schema/workspace.ts";
import { unique } from "../db/unique.ts";
import { publishHomeJob } from "../slack/appHome.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { mutationJob } from "../jobs/define.ts";

export const homeTabValidator = z.union([z.literal("profile"), z.literal("leaderboard"), z.literal("book"), z.literal("skillTree"), z.literal("inventory"), z.literal("settings"), z.literal("admin")]);

export type HomeTab = z.infer<typeof homeTabValidator>;

export type ShownTab =
  | {
      tab: "profile";
      progression: ToldProgression | null;
      unlocks: UnlocksHome | null;
      hoggies: HoggiesShown | null;
      boughtCrates: string[] | null;
      teaser: string | null;
      thoughtfulGivers: number | null;
    }
  | { tab: "leaderboard"; period: Period; board: EveryoneBoardView; groups: GroupsBoard<GroupId> | null; myGroup: MyGroupBoardView | null }
  | { tab: "book"; book: AchievementFacts; timeZone: string | undefined }
  | { tab: "skillTree"; perks: MemberPerks; coinsName: string }
  | { tab: "inventory"; balance: number; inventory: InventoryHome; kudosEmoji: string; refused: ItemRefusal | null }
  | { tab: "settings"; onTheBoards: boolean | null; progress: ShownNotificationSwitches | null; messages: MessageSetting[] | null; achievements: boolean; channelPicked: boolean; groups: GroupChoice | null }
  | { tab: "admin"; announcementChannel: string | null; achievements: boolean; publicCelebrations: boolean | null; groupMode: GroupModeFacts | null; mondayPost: MondayPostSwitch | null; welcomeNudge: boolean | null; customKudosEmoji: CustomKudosEmojiPicker | null };

export type ShownHome = { tabs: HomeTab[]; shown: ShownTab };

export type CrateStoreShown = CrateStore & { short: number | null };

export type HoggiesShown = HoggiesHome & { crateStore: CrateStoreShown | null; avatar: AvatarChoice | null };

export type ToldProgression = Omit<ProgressionHome, "skillPoints"> & { skillPoints: number | null; skillTreeTab: boolean; coins: number | null };

export type HomeMember = Extract<MemberFacts, { kind: "member" }>;

type Slices = {
  board: boolean;
  leaderboard: boolean;
  xp: boolean;
  unlocks: boolean;
  book: boolean;
  skillTree: boolean;
  coins: boolean;
  store: boolean;
  messages: boolean;
  admin: boolean;
  sharedSettings: boolean;
  groups: GroupChoice | null;
};

type HomeSelection = { tab: HomeTab; period: Period };

const adminsRepublishedPerPage = 100;
const opensOn: HomeSelection = { tab: "profile", period: "week" };

type Door = { frontDoor: boolean };

const tabsBesideProfile: Array<{ tab: HomeTab; shownWith: (slices: Slices & Door) => boolean }> = [
  { tab: "leaderboard", shownWith: ({ leaderboard, frontDoor }) => leaderboard && !frontDoor },
  { tab: "book", shownWith: ({ book, frontDoor }) => book && !frontDoor },
  { tab: "skillTree", shownWith: ({ skillTree, frontDoor }) => skillTree && !frontDoor },
  { tab: "inventory", shownWith: ({ coins, store }) => coins && store },
  { tab: "settings", shownWith: ({ board, xp, messages, groups }) => board || xp || messages || groups !== null },
  { tab: "admin", shownWith: ({ sharedSettings, admin }) => sharedSettings && admin },
];

export const shownHomeOfArgs = z.strictObject({ workspace: z.string(), user: z.string(), frontDoor: z.boolean(), refused: z.optional(homeRefusalValidator) });
/** The member's home as it shows now: its tabs, and the selected tab's content; null for a non-member or a home with one tab. */
export async function shownHomeOf(ctx: MutationContext, { workspace, user, frontDoor, refused }: z.infer<typeof shownHomeOfArgs>): Promise<null | ShownHome> {
  const person = await lookup(ctx, workspace, user);
  if (person?.kind !== "member") return null;
  const slices = await slicesShownTo(ctx, workspace, person);
  const tabs = tabsOf({ ...slices, frontDoor });
  if (tabs.length === 0) return null;
  const { tab, period } = await selectionOf(ctx, person.member);
  const viewer = { workspace, user, member: person.member, timeZone: person.timeZone, admin: person.admin };
  return { tabs, shown: await shownTabOf(ctx, viewer, slices, { tab: tabs.includes(tab) ? tab : "profile", period }, refused ?? null) };
}

/** Selects a tab the member's home shows, keeping the period; null for a tab it doesn't show. */
export async function showHomeTab(ctx: MutationContext, workspace: string, person: HomeMember, tab: HomeTab): Promise<HomeSelection | null> {
  if (!tabsOf({ ...(await slicesShownTo(ctx, workspace, person)), frontDoor: false }).includes(tab)) return null;
  const selection = { ...(await selectionOf(ctx, person.member)), tab };
  await select(ctx, person.member, selection);
  return selection;
}

export async function selectLeaderboardPeriod(ctx: MutationContext, member: MemberId, period: Period): Promise<void> {
  await select(ctx, member, { tab: "leaderboard", period });
}

export const refreshHomeOnXpArgs = z.strictObject({ event: xpRecordedEventValidator });
/** Publishes the member's home again when their XP was recorded, while levels are on for them. */
export async function refreshHomeOnXp(ctx: MutationContext, { event }: z.infer<typeof refreshHomeOnXpArgs>): Promise<void> {
  if (await xpLevelsOnFor(ctx, event.member)) await republish(ctx, event.member);
}
export const refreshHomeOnXpJob = mutationJob("feedback.homes.refreshHomeOnXp", refreshHomeOnXpArgs, refreshHomeOnXp);

export const republishAdminsInArgs = z.strictObject({ workspace: z.string(), cursor: z.optional(z.string()) });
/**
 * Publishes every admin's home in the workspace again, a page at a time. A restart without the cursor starts over,
 * which only publishes some homes twice: publishing a home is replaceable.
 */
export async function republishAdminsIn(ctx: MutationContext, { workspace, cursor }: z.infer<typeof republishAdminsInArgs>): Promise<void> {
  const { admins, continueCursor } = await adminsPageIn(ctx, workspace, cursor ?? null, adminsRepublishedPerPage);
  for (const user of admins) await ctx.jobs.enqueue(publishHomeJob, { workspace, user });
  if (continueCursor !== null) await ctx.jobs.enqueue(republishAdminsInJob, { workspace, cursor: continueCursor });
}
export const republishAdminsInJob = mutationJob("feedback.homes.republishAdminsIn", republishAdminsInArgs, republishAdminsIn);

/** Publishes the home again when a person's role changed: member, admin, or neither. */
export async function republishOnRoleChange(ctx: MutationContext, before: MemberFacts | undefined, after: MemberFacts | undefined): Promise<void> {
  if (before === undefined || after === undefined || roleOf(before) === roleOf(after)) return;
  const member = before.kind === "member" ? before.member : after.kind === "member" ? after.member : null;
  if (member === null) return;
  if (await xpLevelsOnFor(ctx, member)) await republish(ctx, member);
}

/** Publishes the member's home again, with what it refused when it refused something. */
export async function republish(ctx: MutationContext, member: MemberId, refused?: HomeRefusal): Promise<void> {
  await ctx.jobs.enqueue(publishHomeJob, { ...(await chatUserOf(ctx, member)), ...(refused !== undefined && { refused }) });
}

export async function isLeaderboardShownTo(ctx: MutationContext, workspace: string, member: MemberId): Promise<boolean> {
  return (await isEveryoneBoardShownTo(ctx, workspace, member)) && (await isLeaderboardOpenTo(ctx, member, await unlocksShownTo(ctx, member)));
}

async function slicesShownTo(ctx: MutationContext, workspace: string, person: HomeMember): Promise<Slices> {
  const board = await isEveryoneBoardShownTo(ctx, workspace, person.member);
  const xp = await xpLevelsShownTo(ctx, person.member);
  const unlocks = await unlocksShownTo(ctx, person.member);
  const book = unlocks && (await achievementsShownTo(ctx, person.member)) && (await isOpened(ctx, person.member, "book"));
  const skillTree = (await skillTreeShownTo(ctx, person.member)) && (await isOpened(ctx, person.member, "skillTree"));
  const coins = unlocks && (await coinsVisibleAndExposedTo(ctx, person.member));
  const store = unlocks && (await storeShownAndExposedTo(ctx, person.member));
  const messages = await messageSettingsShownTo(ctx, person.member);
  const sharedSettings = await xpLevelsShownIn(ctx, workspace);
  const groups = (await groupsShownAndExposedTo(ctx, person.member)) ? await groupChoiceOf(ctx, person.member) : null;
  return { board, leaderboard: board && (await isLeaderboardOpenTo(ctx, person.member, unlocks)), xp, unlocks, book, skillTree, coins, store, messages, admin: person.admin, sharedSettings, groups };
}

async function isLeaderboardOpenTo(ctx: QueryContext, member: MemberId, unlocksShown: boolean) {
  return !unlocksShown || (await isOpened(ctx, member, "leaderboard"));
}

function tabsOf(slices: Slices & Door): HomeTab[] {
  const besideProfile = tabsBesideProfile.filter(({ shownWith }) => shownWith(slices)).map(({ tab }) => tab);
  return besideProfile.length === 0 ? [] : ["profile", ...besideProfile];
}

type Viewer = { workspace: string; user: string; member: MemberId; timeZone: string | undefined; admin: boolean };

async function shownTabOf(ctx: MutationContext, viewer: Viewer, slices: Slices, { tab, period }: HomeSelection, refused: HomeRefusal | null): Promise<ShownTab> {
  switch (tab) {
    case "profile": {
      const reads = { teaser: await teaserOf(ctx, viewer.member), thoughtfulGivers: await thoughtfulGiversShownTo(ctx, viewer) };
      if (!slices.xp) return { tab, progression: null, unlocks: null, hoggies: null, boughtCrates: null, ...reads };
      if (!slices.unlocks) return { tab, progression: await levelsOnlyProgressionOf(ctx, viewer.member), unlocks: null, hoggies: null, boughtCrates: null, ...reads };
      return {
        tab,
        progression: await toldProgressionOf(ctx, viewer.member, slices),
        unlocks: namedForStore(await unlocksHomeOf(ctx, viewer.member), storeNamingOf(slices)),
        hoggies: await hoggiesInTheBookOf(ctx, viewer.member, slices, refused),
        boughtCrates: (await hoggiesShownTo(ctx, viewer.member)) ? await waitingCratesOf(ctx, viewer.member) : null,
        ...reads,
      };
    }
    case "leaderboard":
      return { tab, period, board: await everyoneBoardOf(ctx, viewer.workspace, viewer.user, period, await everyoneMeasureFor(ctx, viewer.member)), groups: null, myGroup: null };
    case "book":
      return { tab, book: await bookFactsOf(ctx, viewer.member), timeZone: await timeZoneOf(ctx, viewer.member) };
    case "skillTree":
      return { tab, perks: await memberPerksOf(ctx, viewer.member), coinsName: namedFor(scheduled("coins"), storeNamingOf(slices)).name };
    case "inventory":
      return { tab, balance: await balanceOf(ctx, viewer.member), inventory: await inventoryHomeOf(ctx, viewer.member), kudosEmoji: (await settingsOf(ctx, viewer.workspace)).kudosEmoji, refused: itemRefusalIn(refused) };
    case "settings":
      return {
        tab,
        onTheBoards: slices.board ? await isOnTheBoards(ctx, viewer.member) : null,
        progress: slices.xp && !slices.messages ? await notificationSwitchesOf(ctx, viewer.member) : null,
        messages: slices.messages ? await applyingMessageSettingsOf(ctx, viewer.member) : null,
        achievements: await achievementsApplyIn(ctx, viewer.workspace),
        groups: slices.groups,
        channelPicked: (await settingsOf(ctx, viewer.workspace)).announcementChannel !== null,
      };
    case "admin":
      return {
        tab,
        announcementChannel: (await settingsOf(ctx, viewer.workspace)).announcementChannel,
        achievements: await achievementsApplyIn(ctx, viewer.workspace),
        publicCelebrations: await celebrationsSwitchShownTo(ctx, viewer.workspace, viewer),
        groupMode: await groupModeShownTo(ctx, viewer.workspace, viewer),
        mondayPost: await mondayPostSwitchShownTo(ctx, viewer.workspace, viewer),
        welcomeNudge: await welcomeNudgeSwitchOf(ctx, viewer),
        customKudosEmoji: await customKudosEmojiPickerFor(ctx, viewer.workspace, viewer),
      };
  }
}

async function timeZoneOf({ tx }: QueryContext, member: MemberId): Promise<string | undefined> {
  const [row] = await tx.select({ timeZone: members.timeZone }).from(members).where(eq(members._id, member));
  return row?.timeZone ?? undefined;
}

function storeNamingOf({ store }: Slices): StoreNaming {
  return { storeShown: store };
}

function namedForStore({ ready, next }: UnlocksHome, naming: StoreNaming): UnlocksHome {
  const named = (entry: ScheduledFeature) => namedFor(entry, naming);
  return { ready: ready.map(named), next: next === null ? null : named(next) };
}

async function hoggiesInTheBookOf(ctx: QueryContext, member: MemberId, { book, coins }: Slices, refused: HomeRefusal | null): Promise<HoggiesShown | null> {
  if (!book || !(await hoggiesShownTo(ctx, member))) return null;
  const hoggies = await hoggiesOf(ctx, member, { crests: await crestsShownTo(ctx, member) }, await crestsOfCompletedPages(ctx, member));
  return { ...hoggies, crateStore: coins && (await crateStoreShownTo(ctx, member)) ? await crateStoreToldTo(ctx, member, refused) : null, avatar: await avatarChoiceOf(ctx, member) };
}

async function crestsOfCompletedPages(ctx: QueryContext, member: MemberId): Promise<string[]> {
  return (await teamSpiritShownTo(ctx, member)) ? teamsCompletedBy(ctx, member) : [];
}

async function crateStoreToldTo(ctx: QueryContext, member: MemberId, refused: HomeRefusal | null): Promise<CrateStoreShown | null> {
  const store = await crateStoreOf(ctx, member);
  if (store === null) return null;
  const refusedForCoins = refused !== null && "crate" in refused && refused.reason === "no-coins";
  return { ...store, short: refusedForCoins ? store.price - (await balanceOf(ctx, member)) : null };
}

function itemRefusalIn(refused: HomeRefusal | null): ItemRefusal | null {
  return refused !== null && "item" in refused ? refused : null;
}

async function applyingMessageSettingsOf(ctx: QueryContext, member: MemberId) {
  return (await messageSettingsOf(ctx, member)).filter(({ applies }) => applies);
}

async function levelsOnlyProgressionOf(ctx: QueryContext, member: MemberId): Promise<ToldProgression> {
  const progression = await progressionHomeOf(ctx, member);
  return { ...progression, skillPoints: await whenShipped(ctx, member, "skillTree", progression.skillPoints), skillTreeTab: false, coins: null };
}

async function toldProgressionOf(ctx: QueryContext, member: MemberId, { skillTree: skillTreeTab, coins }: Slices): Promise<ToldProgression> {
  const progression = await progressionHomeOf(ctx, member);
  const nothingToBuy = skillTreeTab && ownsEveryPerk(await memberPerksOf(ctx, member));
  const skillPoints = nothingToBuy ? null : await whenOpened(ctx, member, "skillTree", progression.skillPoints);
  return { ...progression, skillPoints, skillTreeTab, coins: coins ? await balanceOf(ctx, member) : null };
}

function roleOf(person: MemberFacts) {
  return person.kind === "member" && person.admin ? "admin" : person.kind;
}

async function selectionOf(ctx: QueryContext, member: MemberId): Promise<HomeSelection> {
  const row = await selectionRow(ctx, member);
  return row === null ? opensOn : { tab: row.tab, period: row.period };
}

async function select(ctx: MutationContext, member: MemberId, selection: HomeSelection) {
  const row = await selectionRow(ctx, member);
  if (row === null) await ctx.tx.insert(homeSelections).values({ ...ctx.newRow(), member, ...selection });
  else if (row.tab !== selection.tab || row.period !== selection.period) await ctx.tx.update(homeSelections).set(selection).where(eq(homeSelections._id, row._id));
}

async function selectionRow({ tx }: QueryContext, member: MemberId) {
  return unique("homeSelections", await tx.select().from(homeSelections).where(eq(homeSelections.member, member)).limit(2));
}
