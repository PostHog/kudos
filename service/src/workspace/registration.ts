// The workspace domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { fillWorkspaceUrlJob } from "../slack/workspaceUrl.ts";

export const registration: Registration = {
  jobs: [fillWorkspaceUrlJob],
};
