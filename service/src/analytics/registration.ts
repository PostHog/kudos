// The analytics domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { cleanUpJob, recoverJob } from "./drain.ts";
import { flagsRefresh } from "./refresh.ts";
import { drainJob } from "./send.ts";

export const registration: Registration = { jobs: [flagsRefresh, drainJob, recoverJob, cleanUpJob] };
