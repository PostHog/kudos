// The feedback domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { UnlockOpenedEvent } from "../bus/events.ts";
import type { Registration } from "../registration.ts";
import { refreshHomeOnXpJob, republishAdminsInJob } from "./homes.ts";
import { releaseUnreleasedJob } from "./replies.ts";
import { tellBatchSummariesJob, tellOpeningSummaryJob } from "./tierNotices.ts";

// The book a member opens themselves, not one a launch opened for everyone, tells the tiers it held back.
const bookOpened = { event: "unlockOpened", job: tellOpeningSummaryJob, only: ({ feature, byLaunch }: UnlockOpenedEvent) => byLaunch !== true && feature === "book" };

export const registration: Registration = {
  jobs: [releaseUnreleasedJob, republishAdminsInJob, tellBatchSummariesJob],
  subscribers: [{ event: "xpRecorded", job: refreshHomeOnXpJob }, bookOpened],
};
