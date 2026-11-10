// The workspace domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { joinCreatedChannelJob, joinPublicChannelsJob, receiveChannelCreated } from "../slack/channelJoins.ts";
import { leaveIfOffLimitsJob, leaveOffLimitsChannelsJob, receiveChannelEvent } from "../slack/channelLeaves.ts";
import { checkDirectoryJob, listSlackMembersJob, receiveMemberEvent, recheckStrandedJob, refreshPersonJob } from "../slack/directory.ts";
import { verifyMemberJob, retryStrandedJob as retryStrandedVerificationsJob } from "../slack/verifyMember.ts";
import { fillWorkspaceUrlJob } from "../slack/workspaceUrl.ts";
import { fillEntryJob } from "./directory.ts";

export const registration: Registration = {
  // recheckStranded, listSlackMembers and verifyMember's retryStranded are crons as well, named by their job.
  // joinPublicChannels and leaveOffLimitsChannels are an operator's one-offs: nothing in the app enqueues them.
  jobs: [
    fillWorkspaceUrlJob,
    checkDirectoryJob,
    recheckStrandedJob,
    refreshPersonJob,
    listSlackMembersJob,
    fillEntryJob,
    verifyMemberJob,
    retryStrandedVerificationsJob,
    joinPublicChannelsJob,
    joinCreatedChannelJob,
    leaveOffLimitsChannelsJob,
    leaveIfOffLimitsJob,
  ],
  slack: { events: { memberChanged: receiveMemberEvent, channelCreated: receiveChannelCreated, channelEvent: receiveChannelEvent } },
};
