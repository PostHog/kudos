// The feedback domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { releaseUnreleasedJob } from "./replies.ts";

export const registration: Registration = {
  jobs: [releaseUnreleasedJob],
};
