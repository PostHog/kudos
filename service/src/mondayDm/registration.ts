// The mondayDm domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
// The week's domain: the weekly post's Slack jobs register here, beside the Monday DM, since S12 owns both.
import type { Registration } from "../registration.ts";
import { sendMondayDmJob, showMondayDmJob } from "../slack/mondayDm.ts";
import { checkPickedChannelJob, postMondayPostJob } from "../slack/mondayPost.ts";
import { ensureMondayDmsOfHugWeeksJob } from "./hugWeeks.ts";
import { ensureMondayDmsJob } from "./mondayDm.ts";

export const registration: Registration = {
  jobs: [checkPickedChannelJob, postMondayPostJob, ensureMondayDmsJob, ensureMondayDmsOfHugWeeksJob, sendMondayDmJob, showMondayDmJob],
};
