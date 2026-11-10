// The website domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import { notPorted } from "../notPorted.ts";
import type { Registration } from "../registration.ts";
import { websiteRoutes } from "./api/table.ts";
import { apiTransport, type Identify, type MemberCheck } from "./api/transport.ts";

// Who a request is and today's member check arrive with the identity mapping (S15's 15.2); until then every route
// fails by name.
const identify: Identify = async () => {
  throw notPorted("website.memberQuery.verifiedMember");
};
const check: MemberCheck = {
  read: async () => {
    throw notPorted("website.memberQuery.verifiedMember");
  },
  command: async () => {
    throw notPorted("website.memberMutation.memberMutation");
  },
};

export const registration: Registration = {
  routes: ({ operations, log }) => apiTransport({ operations, log, routes: websiteRoutes, identify, check }),
};
