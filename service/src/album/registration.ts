// The album domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { HoggieDroppedEvent } from "../bus/events.ts";
import type { Registration } from "../registration.ts";
import { crateKindOf } from "./hoggies/crateKey.ts";
import { recordAlbumHistoryJob, startAlbumHistoryJob } from "./history.ts";
import {
  recordMilestonesAfterAHoggieDropJob,
  recordMilestonesAfterTheMatchesJob,
  recordMilestonesInWorkspaceJob,
  recordMilestonesOfStickerHoldersJob,
} from "./milestones.ts";
import { grantThoughtfulPacksJob } from "./packs.ts";
import { tallyHugGivenJob, tallyHugJob, tallyKudosGivenJob } from "./tallies.ts";

export const registration: Registration = {
  jobs: [startAlbumHistoryJob, recordAlbumHistoryJob, tallyHugJob, recordMilestonesInWorkspaceJob, recordMilestonesOfStickerHoldersJob],
  subscribers: [
    { event: "kudosGiven", job: grantThoughtfulPacksJob },
    { event: "kudosGiven", job: tallyKudosGivenJob },
    { event: "hugGiven", job: tallyHugGivenJob },
    { event: "hoggieDropped", job: recordMilestonesAfterAHoggieDropJob, only: ({ crate }: HoggieDroppedEvent) => crateKindOf(crate) !== "thoughtful" },
    { event: "companyMatchesKept", job: recordMilestonesAfterTheMatchesJob },
  ],
};
