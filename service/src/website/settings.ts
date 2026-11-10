// The module map's skeleton of convex/website/settings.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { type CompanyProfileSetting, type ProfileChoice } from "../companyProfiles/links.ts";
import type { MatchedBy } from "../companyProfiles/matcher.ts";
import { type GroupChoice } from "../groups/pick.ts";
import { type WeeklyPostSwitch } from "../leaderboard/mondayPost.ts";
import { type MessageSetting } from "../messageSettings/messageSettings.ts";
import { type WorkspaceSettingsPart } from "../workspace/workspaceSettings.ts";
import { type VerifiedMember } from "./memberQuery.ts";
import { type SettingsSection } from "./routes.ts";
import { type FeaturePage } from "./unlockPath.ts";
import type { QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";

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

export async function settingsShownTo(ctx: QueryContext, me: VerifiedMember, leaderboard: FeaturePage): Promise<boolean> {
  throw notPorted("website.settings.settingsShownTo");
}

export async function settingsSectionsShownTo(ctx: QueryContext, me: VerifiedMember): Promise<SettingsSection[]> {
  throw notPorted("website.settings.settingsSectionsShownTo");
}
