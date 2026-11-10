// The engine domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { forgetAuthoredWordsJob, forgetWordsOfLeaverJob, forgetWorkspaceWordsJob } from "./kudosText.ts";
import { recomputeSpotlightOfJob, recomputeSpotlightOfMessageJob } from "./spotlight.ts";

export const registration: Registration = {
  jobs: [recomputeSpotlightOfMessageJob, recomputeSpotlightOfJob, forgetAuthoredWordsJob, forgetWorkspaceWordsJob],
  subscribers: [{ event: "memberLeft", job: forgetWordsOfLeaverJob }],
};
