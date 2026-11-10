// The stickers domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { backfillStickersJob } from "./backfill.ts";
import { checkTeamPagesJob } from "./completions.ts";
import { recordStickersJob } from "./stickers.ts";

export const registration: Registration = {
  jobs: [backfillStickersJob, checkTeamPagesJob],
  subscribers: [{ event: "kudosGiven", job: recordStickersJob }],
};
