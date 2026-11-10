// The album domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { fillItemsJob } from "./items/fill.ts";
import { findOnHugJob } from "./items/hugFinds.ts";
import { earnQuestHoggieJob } from "./items/questHoggies.ts";
import { earnWelcomeItemOnGreetingJob } from "./items/welcome.ts";
import { grantThoughtfulPacksJob } from "./packs.ts";

export const registration: Registration = {
  // Jobs no event starts: the item fill schedules itself page by page, and the move restarts it (S18).
  jobs: [fillItemsJob],
  subscribers: [
    { event: "kudosGiven", job: grantThoughtfulPacksJob },
    { event: "memberGreeted", job: earnWelcomeItemOnGreetingJob },
    { event: "questFinished", job: earnQuestHoggieJob },
    { event: "hugGiven", job: findOnHugJob },
  ],
};
