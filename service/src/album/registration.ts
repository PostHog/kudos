// The album domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { recordAlbumHistoryJob, startAlbumHistoryJob } from "./history.ts";
import { tallyHugJob } from "./tallies.ts";

export const registration: Registration = {
  jobs: [startAlbumHistoryJob, recordAlbumHistoryJob, tallyHugJob],
};
