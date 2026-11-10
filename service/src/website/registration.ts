// The website domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration, Routes } from "../registration.ts";
import { websiteRoutes } from "./api/table.ts";
import { apiTransport } from "./api/transport.ts";
import type { Route } from "./api/route.ts";
import { enter } from "./entry.ts";
import { identifyByEmail } from "./identity.ts";
import { admittedMember } from "./memberMutation.ts";
import { verifiedMember } from "./memberQuery.ts";

/** The website's API over `routes`, for whoever the edge signed in, through today's member check. */
export function websiteApi(routes: readonly Route[]): Routes {
  return ({ operations, log }) =>
    apiTransport({ operations, log, routes, identify: identifyByEmail({ operations, log }), check: { read: verifiedMember, command: admittedMember }, enter });
}

export const registration: Registration = { routes: websiteApi(websiteRoutes) };
