// The workspace domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { checkDirectoryJob, listSlackMembersJob, receiveMemberEvent, recheckStrandedJob, refreshPersonJob } from "../slack/directory.ts";
import { verifyMemberJob, retryStrandedJob as retryStrandedVerificationsJob } from "../slack/verifyMember.ts";
import { fillWorkspaceUrlJob } from "../slack/workspaceUrl.ts";
import { fillEntryJob } from "./directory.ts";

export const registration: Registration = {
  // recheckStranded, listSlackMembers and verifyMember's retryStranded are crons as well, named by their job.
  jobs: [fillWorkspaceUrlJob, checkDirectoryJob, recheckStrandedJob, refreshPersonJob, listSlackMembersJob, fillEntryJob, verifyMemberJob, retryStrandedVerificationsJob],
  slack: { events: { memberChanged: receiveMemberEvent } },
};
