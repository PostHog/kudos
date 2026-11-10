import { botName, slashCommand } from "./naming.ts";

export type KudosCommandResult = "joined" | "already-in" | "off-limits" | "private-channel" | "direct-message";

const replies: Record<KudosCommandResult, string> = {
  joined: "I'm in now. Mention teammates with a kudos emoji here and I'll pass the kudos on.",
  "already-in": "I'm already in this channel. Mention teammates with a kudos emoji to give kudos.",
  "off-limits": "I stay out of customer channels and channels shared with another organization, since I quote kudos.",
  "private-channel": `I can't join private channels by myself. Type \`/invite @${botName}\` here and I'll start counting kudos.`,
  "direct-message": `I only count kudos in channels. Run \`${slashCommand}\` in the channel you want me in.`,
};

export function renderKudosCommandReply(result: KudosCommandResult): string {
  return replies[result];
}
