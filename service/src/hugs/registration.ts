// The hugs domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { deliverFirstHugReplyJob } from "../slack/firstHugReply.ts";
import { lookUpHugPeopleJob } from "../slack/hugLookups.ts";
import { payHugPeopleJob } from "./people.ts";

export const registration: Registration = {
  jobs: [lookUpHugPeopleJob, deliverFirstHugReplyJob],
  subscribers: [{ event: "hugGiven", job: payHugPeopleJob }],
};
