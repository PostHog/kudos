// The hugs domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
// It also carries the custom emoji its stack (S13) ports into slack/: a hug is given with the kudos emoji, and a
// workspace's custom kudos emoji comes from the custom emoji the sync keeps, so slack/registration.ts stays S5's.
import type { Registration } from "../registration.ts";
import { customEmojiOptions, emojiChanged, syncCustomEmojiJob } from "../slack/customEmoji.ts";
import { customEmojiPickerAction } from "../slack/customEmojiPicker.ts";
import { deliverFirstHugReplyJob } from "../slack/firstHugReply.ts";
import { lookUpHugPeopleJob } from "../slack/hugLookups.ts";
import { payHugPeopleJob } from "./people.ts";

export const registration: Registration = {
  // The cron `slack.customEmoji.syncCustomEmoji` runs syncCustomEmojiJob by its ID, daily at 04:30 UTC.
  jobs: [lookUpHugPeopleJob, deliverFirstHugReplyJob, syncCustomEmojiJob],
  subscribers: [{ event: "hugGiven", job: payHugPeopleJob }],
  slack: {
    events: { emojiChanged },
    options: { [customEmojiPickerAction]: customEmojiOptions },
  },
};
