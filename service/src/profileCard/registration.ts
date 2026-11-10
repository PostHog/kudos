// The profileCard domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { linkShared, unfoldLinksJob } from "../slack/linkPreviews.ts";
import { answerUnknownTargetJob, profileCardCommand, reportProfileCardViewedJob } from "../slack/profileCardCommand.ts";
import { exposeProfileCardJob } from "./flag.ts";

export const registration: Registration = {
  jobs: [unfoldLinksJob, answerUnknownTargetJob, reportProfileCardViewedJob, exposeProfileCardJob],
  slack: { events: { linkShared }, commands: { profileCard: profileCardCommand } },
};
