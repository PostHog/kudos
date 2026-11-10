// The album domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { HoggieDroppedEvent } from "../bus/events.ts";
import type { Registration } from "../registration.ts";
import { giveEmojiASecondNameJob, reserveSharedEmojiNamesJob, reserveTeamNamesAfterTheSyncJob } from "./emojiNames.ts";
import { crateKindOf } from "./hoggies/crateKey.ts";
import { recordAlbumHistoryJob, startAlbumHistoryJob } from "./history.ts";
import { keepHypeReactionJob } from "./hypeReactions.ts";
import {
  recordMilestonesAfterAHoggieDropJob,
  recordMilestonesAfterTheMatchesJob,
  recordMilestonesInWorkspaceJob,
  recordMilestonesOfStickerHoldersJob,
} from "./milestones.ts";
import { tallyHugGivenJob, tallyHugJob, tallyKudosGivenJob } from "./tallies.ts";

export const registration: Registration = {
  jobs: [startAlbumHistoryJob, recordAlbumHistoryJob, tallyHugJob, recordMilestonesInWorkspaceJob, recordMilestonesOfStickerHoldersJob, giveEmojiASecondNameJob, reserveSharedEmojiNamesJob],
  subscribers: [
    { event: "kudosGiven", job: tallyKudosGivenJob },
    { event: "hugGiven", job: tallyHugGivenJob },
    { event: "hoggieDropped", job: recordMilestonesAfterAHoggieDropJob, only: ({ crate }: HoggieDroppedEvent) => crateKindOf(crate) !== "thoughtful" },
    { event: "companyMatchesKept", job: recordMilestonesAfterTheMatchesJob },
    { event: "companyTeamsReplaced", job: reserveTeamNamesAfterTheSyncJob },
    { event: "hypeReacted", job: keepHypeReactionJob },
  ],
};
