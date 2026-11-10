// The groups domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { attributeKudosGivenJob } from "./attribution.ts";
import { reconcileUsersJob, reconcileWorkspaceJob } from "./reconcile.ts";

export const registration: Registration = {
  jobs: [reconcileUsersJob, reconcileWorkspaceJob],
  subscribers: [{ event: "kudosGiven", job: attributeKudosGivenJob }],
};
