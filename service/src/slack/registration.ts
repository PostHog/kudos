// The slack domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { cardRoutes } from "./cardRoutes.ts";
import { deliverIndicatorJob, deliverPrivateReplyJob } from "./delivery.ts";
import { deliverDirectMessageJob, deliverPurchaseReplyJob } from "./directMessages.ts";
import { deliverPublicReplyJob } from "./publicReplies.ts";

export const registration: Registration = {
  jobs: [deliverIndicatorJob, deliverPrivateReplyJob, deliverDirectMessageJob, deliverPurchaseReplyJob, deliverPublicReplyJob],
  routes: cardRoutes,
};
