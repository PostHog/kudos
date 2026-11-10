// The progression domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { recordEffectsJob } from "./progression.ts";

export const registration: Registration = {
  subscribers: [{ event: "kudosGiven", job: recordEffectsJob }],
};
