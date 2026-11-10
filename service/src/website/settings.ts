// The settings page: the member's own switches, and an admin's company profiles and workspace settings, each only where
// its feature is shown to them. Today's convex/website/settings.ts; getSettings is a plain handler the website
// platform's route table runs after the member check.
import { workspaceMatchesOf } from "../companyProfiles/admin.ts";
import { teamPagesShownTo } from "../companyProfiles/flag.ts";
import { companyProfileSettingOf, type CompanyProfileSetting, type ProfileChoice } from "../companyProfiles/links.ts";
import type { MatchedBy } from "../companyProfiles/matcher.ts";
import { groupsShownTo } from "../groups/groups.ts";
import { groupChoiceOf, type GroupChoice } from "../groups/pick.ts";
import { mondayPostSwitchReadBy, type WeeklyPostSwitch } from "../leaderboard/mondayPost.ts";
import { isOnTheBoards } from "../leaderboard/visibility.ts";
import { messageSettingsOnFor } from "../messageSettings/flag.ts";
import { messageSettingsOf, type MessageSetting } from "../messageSettings/messageSettings.ts";
import { channelLinkOf } from "../slack/permalink.ts";
import { celebrationsSwitchReadIn } from "../workspace/celebrationsSwitch.ts";
import { personFactsOf, timeZoneOf } from "../workspace/directory.ts";
import { workspaceUrlOf } from "../workspace/url.ts";
import { workspaceSettingsPartOf, workspaceSettingsShownTo, type WorkspaceSettingsPart } from "../workspace/workspaceSettings.ts";
import { type VerifiedMember } from "./memberQuery.ts";
import { settingsSections, type SettingsSection } from "./routes.ts";
import { teammateKeyOf } from "./teammateKeys.ts";
import { leaderboardStateOf, unlockPathOf, type FeaturePage } from "./unlockPath.ts";
import type { QueryContext } from "../operations.ts";

export type { MessageSetting } from "../messageSettings/messageSettings.ts";
export type { MessageKind, MessagePlace } from "../messageSettings/kinds.ts";
export type { GroupChoice } from "../groups/pick.ts";
export type { CompanyProfileSetting, ProfileChoice } from "../companyProfiles/links.ts";
export type { WorkspaceSettingsPart } from "../workspace/workspaceSettings.ts";

type SectionSettings = { board: { onTheBoards: boolean } | null; messages: MessageSetting[] | null; group: GroupChoice | null };

export type AdminProfiles = {
  members: Array<{ key: string; name: string; profile: number | null; by: MatchedBy | null }>;
  profiles: Array<ProfileChoice & { heldBy: string | null; by: MatchedBy | null }>;
};

export type WeeklyPostSetting = Omit<WeeklyPostSwitch, "channel" | "channelPicked"> & { channelLink: string | null };

export type MySettings = { kind: "settings"; companyProfile?: CompanyProfileSetting; admin?: AdminProfiles; workspace?: WorkspaceSettingsPart; weeklyPost?: WeeklyPostSetting; publicCelebrations?: boolean } & SectionSettings;

export type SettingsAnswer = MySettings | { kind: "not-found" };

export const getSettingsArgs = {};

export async function getSettings(ctx: QueryContext, me: VerifiedMember): Promise<SettingsAnswer> {
  const settings = await settingsOf(ctx, me);
  return hasAny(settings) ? settings : { kind: "not-found" };
}

export async function settingsShownTo(ctx: QueryContext, me: VerifiedMember, leaderboard: FeaturePage): Promise<boolean> {
  if (leaderboard.kind === "open" || (await messageSettingsOnFor(ctx, me.member)) || (await teamPagesShownTo(ctx, me.member)) || (await workspaceSettingsShownTo(ctx, me.member))) return true;
  return (await groupPickOf(ctx, me)) !== null;
}

async function settingsOf(ctx: QueryContext, me: VerifiedMember): Promise<MySettings> {
  return { kind: "settings", ...(await sectionSettingsOf(ctx, me)), ...(await companyProfileSectionOf(ctx, me)), ...(await adminPartOf(ctx, me)), ...(await workspacePartOf(ctx, me)) };
}

async function workspacePartOf(ctx: QueryContext, me: VerifiedMember): Promise<{ workspace?: WorkspaceSettingsPart; weeklyPost?: WeeklyPostSetting; publicCelebrations?: boolean }> {
  if (!(await workspaceSettingsShownTo(ctx, me.member))) return {};
  const weeklyPost = await weeklyPostSettingOf(ctx, me);
  const publicCelebrations = await celebrationsSwitchReadIn(ctx, me.workspace);
  return { workspace: await workspaceSettingsPartOf(ctx, me.workspace), ...(weeklyPost !== null && { weeklyPost }), ...(publicCelebrations !== null && { publicCelebrations }) };
}

async function weeklyPostSettingOf(ctx: QueryContext, me: VerifiedMember): Promise<WeeklyPostSetting | null> {
  const shown = await mondayPostSwitchReadBy(ctx, me.workspace, { member: me.member, timeZone: (await timeZoneOf(ctx, me.member)) ?? undefined });
  if (shown === null) return null;
  const { channel, channelPicked: _, ...setting } = shown;
  const workspaceUrl = await workspaceUrlOf(ctx, me.workspace);
  return { ...setting, channelLink: workspaceUrl === null ? null : channelLinkOf(workspaceUrl, channel) };
}

async function sectionSettingsOf(ctx: QueryContext, me: VerifiedMember): Promise<SectionSettings> {
  return { board: await boardSettingOf(ctx, me), messages: await messagesOf(ctx, me), group: await groupPickOf(ctx, me) };
}

async function companyProfileSectionOf(ctx: QueryContext, me: VerifiedMember): Promise<{ companyProfile?: CompanyProfileSetting }> {
  return (await teamPagesShownTo(ctx, me.member)) ? { companyProfile: await companyProfileSettingOf(ctx, me.member) } : {};
}

async function adminPartOf(ctx: QueryContext, me: VerifiedMember): Promise<{ admin?: AdminProfiles }> {
  if (!(await adminPartShownTo(ctx, me))) return {};
  const { members, profiles } = await workspaceMatchesOf(ctx, me.workspace);
  return {
    admin: {
      members: await Promise.all(members.map(async ({ member, ...match }) => ({ key: await teammateKeyOf(me, member), ...match }))),
      profiles: await Promise.all(profiles.map(async ({ heldBy, ...profile }) => ({ ...profile, heldBy: heldBy === null ? null : await teammateKeyOf(me, heldBy) }))),
    },
  };
}

async function adminPartShownTo(ctx: QueryContext, me: VerifiedMember): Promise<boolean> {
  return (await personFactsOf(ctx, me.member))?.admin === true && (await teamPagesShownTo(ctx, me.member));
}

export async function settingsSectionsShownTo(ctx: QueryContext, me: VerifiedMember): Promise<SettingsSection[]> {
  const { board, messages, group } = await sectionSettingsOf(ctx, me);
  const shown: Record<SettingsSection, boolean> = { visibility: board !== null, messages: messages !== null, group: group !== null, "company-profile": await teamPagesShownTo(ctx, me.member), admin: await adminPartShownTo(ctx, me), workspace: await workspaceSettingsShownTo(ctx, me.member) };
  return settingsSections.filter((section) => shown[section]);
}

function hasAny({ board, messages, group, companyProfile, workspace }: MySettings) {
  return board !== null || messages !== null || group !== null || companyProfile !== undefined || workspace !== undefined;
}

async function boardSettingOf(ctx: QueryContext, me: VerifiedMember) {
  if ((await leaderboardStateOf(ctx, me, await unlockPathOf(ctx, me))).kind !== "open") return null;
  return { onTheBoards: await isOnTheBoards(ctx, me.member) };
}

async function messagesOf(ctx: QueryContext, me: VerifiedMember) {
  if (!(await messageSettingsOnFor(ctx, me.member))) return null;
  return (await messageSettingsOf(ctx, me.member)).filter(({ applies }) => applies);
}

async function groupPickOf(ctx: QueryContext, me: VerifiedMember) {
  if (!(await groupsShownTo(ctx, me.member))) return null;
  const choice = await groupChoiceOf(ctx, me.member);
  return choice !== null && choice.groups.length > 1 ? choice : null;
}
