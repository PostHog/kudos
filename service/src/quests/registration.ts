// The quests domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
// memberLeft's recheck (journey.recheckSomeoneNew) joins once it is ported: it pages the workspace's members.
import type { Registration } from "../registration.ts";
import { recheckRejoinedJob, recheckSomeoneNewOfJob } from "./journey.ts";
import { followHugGivenJob, followKudosGivenJob } from "./quests.ts";

export const registration: Registration = {
  jobs: [recheckSomeoneNewOfJob],
  subscribers: [
    { event: "kudosGiven", job: followKudosGivenJob },
    { event: "hugGiven", job: followHugGivenJob },
    { event: "memberRejoined", job: recheckRejoinedJob },
  ],
};
