// The slack domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { deliverIndicatorJob, deliverPrivateReplyJob } from "./delivery.ts";
import { deliverDirectMessageJob, deliverPurchaseReplyJob } from "./directMessages.ts";
import { receiveMessage } from "./events.ts";
import { deliverPublicReplyJob } from "./publicReplies.ts";

export const registration: Registration = {
  jobs: [deliverIndicatorJob, deliverPrivateReplyJob, deliverDirectMessageJob, deliverPurchaseReplyJob, deliverPublicReplyJob],
  slack: { events: { message: receiveMessage } },
};
