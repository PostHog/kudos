// The slack domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { deliverIndicatorJob, deliverPrivateReplyJob } from "./delivery.ts";

export const registration: Registration = {
  jobs: [deliverIndicatorJob, deliverPrivateReplyJob],
};
