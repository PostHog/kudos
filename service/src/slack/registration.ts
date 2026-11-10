// The slack domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
// S13 adds the custom emoji sync, its daily cron's job, and the custom kudos emoji picker's options, the Slack files it owns.
import type { Registration } from "../registration.ts";
import { customEmojiOptions, emojiChanged, syncCustomEmojiJob } from "./customEmoji.ts";
import { customEmojiPickerAction } from "./customEmojiPicker.ts";
import { deliverIndicatorJob, deliverPrivateReplyJob } from "./delivery.ts";
import { deliverDirectMessageJob, deliverPurchaseReplyJob } from "./directMessages.ts";
import { deliverPublicReplyJob } from "./publicReplies.ts";

export const registration: Registration = {
  jobs: [
    deliverIndicatorJob,
    deliverPrivateReplyJob,
    deliverDirectMessageJob,
    deliverPurchaseReplyJob,
    deliverPublicReplyJob,
    // S13: the cron `slack.customEmoji.syncCustomEmoji` runs this job by its ID, daily at 04:30 UTC.
    syncCustomEmojiJob,
  ],
  slack: {
    events: { emojiChanged },
    options: { [customEmojiPickerAction]: customEmojiOptions },
  },
};
