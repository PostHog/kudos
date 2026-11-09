// The rewrite's data model: one table per Convex table, by the column rule in tools/rewrite/drizzle/generate.ts.
// Indexed fields stored as jsonb, which Postgres orders by its own jsonb rules: every query that orders on one says how.
//   analyticsIds.by_profile_fingerprint: profileFingerprint
//   flagExposures.by_member_flag_value: value
import type { AchievementsDocuments } from "./achievements.ts";
import type { AlbumDocuments } from "./album.ts";
import type { AnalyticsDocuments } from "./analytics.ts";
import type { BusDocuments } from "./bus.ts";
import type { CompanyProfilesDocuments } from "./companyProfiles.ts";
import type { EngineDocuments } from "./engine.ts";
import type { FeedbackDocuments } from "./feedback.ts";
import type { GroupsDocuments } from "./groups.ts";
import type { HugsDocuments } from "./hugs.ts";
import type { LeaderboardDocuments } from "./leaderboard.ts";
import type { MessageSettingsDocuments } from "./messageSettings.ts";
import type { MondayDmDocuments } from "./mondayDm.ts";
import type { ProgressionDocuments } from "./progression.ts";
import type { QuestsDocuments } from "./quests.ts";
import type { SlackDocuments } from "./slack.ts";
import type { StickersDocuments } from "./stickers.ts";
import type { StoreDocuments } from "./store.ts";
import type { UnlocksDocuments } from "./unlocks.ts";
import type { WalletDocuments } from "./wallet.ts";
import type { WebsiteDocuments } from "./website.ts";
import type { WelcomeDocuments } from "./welcome.ts";
import type { WorkspaceDocuments } from "./workspace.ts";

export * from "./achievements.ts";
export * from "./album.ts";
export * from "./analytics.ts";
export * from "./bus.ts";
export * from "./companyProfiles.ts";
export * from "./engine.ts";
export * from "./feedback.ts";
export * from "./groups.ts";
export * from "./hugs.ts";
export * from "./leaderboard.ts";
export * from "./messageSettings.ts";
export * from "./mondayDm.ts";
export * from "./progression.ts";
export * from "./quests.ts";
export * from "./slack.ts";
export * from "./stickers.ts";
export * from "./store.ts";
export * from "./unlocks.ts";
export * from "./wallet.ts";
export * from "./website.ts";
export * from "./welcome.ts";
export * from "./workspace.ts";
export * from "./service.ts";
export * from "./load.ts";

/** Every table's document type, by table name. */
export type Documents = AchievementsDocuments &
  AlbumDocuments &
  AnalyticsDocuments &
  BusDocuments &
  CompanyProfilesDocuments &
  EngineDocuments &
  FeedbackDocuments &
  GroupsDocuments &
  HugsDocuments &
  LeaderboardDocuments &
  MessageSettingsDocuments &
  MondayDmDocuments &
  ProgressionDocuments &
  QuestsDocuments &
  SlackDocuments &
  StickersDocuments &
  StoreDocuments &
  UnlocksDocuments &
  WalletDocuments &
  WebsiteDocuments &
  WelcomeDocuments &
  WorkspaceDocuments;
export type TableName = keyof Documents;
export type Doc<Table extends TableName> = Documents[Table];
