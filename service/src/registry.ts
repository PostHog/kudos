// The service's one registry: every domain folder's registration module, and the front door's own receipts cron.
// A domain stack fills its own module and never edits this file.
import { registration as achievements } from "./achievements/registration.ts";
import { registration as activity } from "./activity/registration.ts";
import { registration as album } from "./album/registration.ts";
import { registration as analytics } from "./analytics/registration.ts";
import { registration as bus } from "./bus/registration.ts";
import { registration as commands } from "./commands/registration.ts";
import { registration as companyProfiles } from "./companyProfiles/registration.ts";
import { registration as engine } from "./engine/registration.ts";
import { registration as feedback } from "./feedback/registration.ts";
import { registration as groups } from "./groups/registration.ts";
import { registration as hugs } from "./hugs/registration.ts";
import { registration as leaderboard } from "./leaderboard/registration.ts";
import { registration as messageSettings } from "./messageSettings/registration.ts";
import { registration as mondayDm } from "./mondayDm/registration.ts";
import { registration as parser } from "./parser/registration.ts";
import { registration as profileCard } from "./profileCard/registration.ts";
import { registration as progression } from "./progression/registration.ts";
import { registration as quests } from "./quests/registration.ts";
import { registration as slack } from "./slack/registration.ts";
import { registration as stickers } from "./stickers/registration.ts";
import { registration as store } from "./store/registration.ts";
import { registration as unlocks } from "./unlocks/registration.ts";
import { registration as wallet } from "./wallet/registration.ts";
import { registration as website } from "./website/registration.ts";
import { registration as welcome } from "./welcome/registration.ts";
import { registration as workspace } from "./workspace/registration.ts";
import { createRegistry } from "./registration.ts";
import { deleteExpiredReceipts } from "./slack/receipts.ts";

export const domains = {
  achievements,
  activity,
  album,
  analytics,
  bus,
  commands,
  companyProfiles,
  engine,
  feedback,
  groups,
  hugs,
  leaderboard,
  messageSettings,
  mondayDm,
  parser,
  profileCard,
  progression,
  quests,
  slack,
  stickers,
  store,
  unlocks,
  wallet,
  website,
  welcome,
  workspace,
};

export const serviceRegistry = createRegistry({ ...domains, frontDoor: { jobs: [deleteExpiredReceipts] } });
