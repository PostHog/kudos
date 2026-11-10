// The album domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { earnLevelUpHoggiesJob } from "./levelUpHoggies.ts";

export const registration: Registration = {
  subscribers: [{ event: "levelReached", job: earnLevelUpHoggiesJob }],
};
