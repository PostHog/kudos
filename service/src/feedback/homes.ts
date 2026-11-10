// The module map's skeleton of convex/feedback/homes.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type AchievementFacts } from "../achievements/achievements.ts";
import { type GroupModeFacts } from "../groups/groupMode.ts";
import { type AvatarChoice } from "../album/hoggies/avatar.ts";
import { type CrateStore } from "../album/hoggies/boughtCrates.ts";
import { type HoggiesHome } from "../album/hoggies/collection.ts";
import { xpRecordedEventValidator } from "../bus/events.ts";
import { type GroupId } from "../groups/groups.ts";
import { type GroupChoice } from "../groups/pick.ts";
import type { GroupsBoard } from "../leaderboard/groupsBoard.ts";
import type { MyGroupBoardView } from "../leaderboard/myGroupBoard.ts";
import type { Period } from "../leaderboard/periods.ts";
import { type MondayPostSwitch } from "../leaderboard/mondayPost.ts";
import { type EveryoneBoardView } from "../leaderboard/totals.ts";
import { type MessageSetting, type ShownNotificationSwitches } from "../messageSettings/messageSettings.ts";
import { type MemberPerks } from "../progression/perks.ts";
import { type ProgressionHome } from "../progression/progression.ts";
import { type CustomKudosEmojiPicker } from "../store/customKudosEmoji.ts";
import { type InventoryHome } from "../store/inventory.ts";
import { type ItemRefusal } from "../store/rows.ts";
import { homeRefusalValidator, type HomeRefusal } from "./homeRefusal.ts";
import { type UnlocksHome } from "../unlocks/unlocks.ts";
import { type MemberFacts, type MemberId } from "../workspace/directory.ts";
import { z } from "zod";
import type { MutationContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
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

type HomeSelection = { tab: HomeTab; period: Period };

export const shownHomeOfArgs = z.strictObject({ workspace: z.string(), user: z.string(), frontDoor: z.boolean(), refused: z.optional(homeRefusalValidator) });
export async function shownHomeOf(ctx: MutationContext, args: z.infer<typeof shownHomeOfArgs>): Promise<null | ShownHome> {
  throw notPorted("feedback.homes.shownHomeOf");
}

export async function showHomeTab(ctx: MutationContext, workspace: string, person: HomeMember, tab: HomeTab): Promise<HomeSelection | null> {
  throw notPorted("feedback.homes.showHomeTab");
}

export async function selectLeaderboardPeriod(ctx: MutationContext, member: MemberId, period: Period): Promise<void> {
  throw notPorted("feedback.homes.selectLeaderboardPeriod");
}

export const refreshHomeOnXpArgs = z.strictObject({ event: xpRecordedEventValidator });
export async function refreshHomeOnXp(ctx: MutationContext, args: z.infer<typeof refreshHomeOnXpArgs>): Promise<void> {
  throw notPorted("feedback.homes.refreshHomeOnXp");
}
export const refreshHomeOnXpJob = mutationJob("feedback.homes.refreshHomeOnXp", refreshHomeOnXpArgs, refreshHomeOnXp);

export const republishAdminsInArgs = z.strictObject({ workspace: z.string(), cursor: z.optional(z.string()) });
export async function republishAdminsIn(ctx: MutationContext, args: z.infer<typeof republishAdminsInArgs>): Promise<void> {
  throw notPorted("feedback.homes.republishAdminsIn");
}
export const republishAdminsInJob = mutationJob("feedback.homes.republishAdminsIn", republishAdminsInArgs, republishAdminsIn);

export async function republishOnRoleChange(ctx: MutationContext, before: MemberFacts | undefined, after: MemberFacts | undefined): Promise<void> {
  throw notPorted("feedback.homes.republishOnRoleChange");
}

export async function republish(ctx: MutationContext, member: MemberId, refused?: HomeRefusal): Promise<void> {
  throw notPorted("feedback.homes.republish");
}

export async function isLeaderboardShownTo(ctx: MutationContext, workspace: string, member: MemberId): Promise<boolean> {
  throw notPorted("feedback.homes.isLeaderboardShownTo");
}
