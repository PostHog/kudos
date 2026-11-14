// The unlocks domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
// The hourly sweep is the cron `unlocks.sweep.sweep`; the Slack `unlocks` command enqueues exposeUnlocks.
import type { Registration } from "../registration.ts";
import { exposeUnlocksJob } from "./launch.ts";
import { sweepJob } from "./sweep.ts";
import { makeReadyJob } from "./unlocks.ts";

export const registration: Registration = {
  jobs: [sweepJob, exposeUnlocksJob],
  subscribers: [{ event: "levelReached", job: makeReadyJob }],
};
