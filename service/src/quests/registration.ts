// The quests domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { followHugGivenJob, followKudosGivenJob } from "./quests.ts";

export const registration: Registration = {
  subscribers: [
    { event: "kudosGiven", job: followKudosGivenJob },
    { event: "hugGiven", job: followHugGivenJob },
  ],
};
