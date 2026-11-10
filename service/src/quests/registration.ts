// The quests domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
// The hourly sweep's job is named by its cron ID, quests.newWeek.sweep, so registering it wires the cron. The bus
// subscribers are today's convex/bus/publish.ts's for Quests.
import type { Registration } from "../registration.ts";
import { recheckRejoinedJob, recheckSomeoneNewJob, recheckSomeoneNewOfJob } from "./journey.ts";
import { sweepJob } from "./newWeek.ts";
import { followHugGivenJob, followKudosGivenJob } from "./quests.ts";
import { drawNewWeekJob } from "./weekly.ts";

export const registration: Registration = {
  jobs: [sweepJob, drawNewWeekJob, recheckSomeoneNewOfJob],
  subscribers: [
    { event: "kudosGiven", job: followKudosGivenJob },
    { event: "hugGiven", job: followHugGivenJob },
    { event: "memberLeft", job: recheckSomeoneNewJob },
    { event: "memberRejoined", job: recheckRejoinedJob },
  ],
};
