export type RichElement =
  | { type: "user"; user_id: string; style?: Style }
  | { type: "usergroup"; usergroup_id: string }
  | { type: "broadcast"; range: "here" | "channel" | "everyone" }
  | { type: "emoji"; name: string; unicode?: string; skin_tone?: number; style?: Style }
  | { type: "text"; text: string; style?: Style }
  | { type: "link"; url: string; text?: string }
  | { type: "channel"; channel_id: string }
  | { type: "rich_text_section" | "rich_text_quote" | "rich_text_preformatted" | "rich_text_list"; elements: RichElement[] };

type Style = { strike?: boolean; code?: boolean; bold?: boolean; italic?: boolean };

export const mention = (user: string, style?: Style): RichElement => ({ type: "user", user_id: user, ...(style && { style }) });
export const userGroup = (id: string): RichElement => ({ type: "usergroup", usergroup_id: id });
export const broadcast = (range: "here" | "channel" | "everyone"): RichElement => ({ type: "broadcast", range });
export const emoji = (name: string, style?: Style): RichElement => ({ type: "emoji", name, ...(style && { style }) });
export const unicodeEmoji = (name: string, unicode: string): RichElement => ({ type: "emoji", name, unicode });
export const tonedEmoji = (name: string, skinTone: number, unicode?: string): RichElement => ({ type: "emoji", name, skin_tone: skinTone, ...(unicode && { unicode }) });
export const text = (value: string, style?: Style): RichElement => ({ type: "text", text: value, ...(style && { style }) });
export const link = (url: string, label?: string): RichElement => ({ type: "link", url, ...(label && { text: label }) });
export const channel = (id: string): RichElement => ({ type: "channel", channel_id: id });
export const section = (...elements: RichElement[]): RichElement => ({ type: "rich_text_section", elements });
export const list = (...items: RichElement[]): RichElement => ({ type: "rich_text_list", elements: items });
export const quote = (...elements: RichElement[]): RichElement => ({ type: "rich_text_quote", elements });
export const codeBlock = (...elements: RichElement[]): RichElement => ({ type: "rich_text_preformatted", elements });

export type MessageOptions = {
  team?: string;
  channel?: string;
  channelType?: "channel" | "group" | "im" | "mpim";
  user?: string;
  ts?: string;
  threadTs?: string;
  subtype?: string;
  botId?: string;
  extra?: Record<string, unknown>;
};

let eventCounter = 0;

export function messageEvent(blocks: RichElement[], options: MessageOptions = {}) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  return JSON.stringify({
    type: "event_callback",
    team_id: team,
    event_id: `Ev${eventCounter}`,
    event: {
      type: "message",
      channel: options.channel ?? "C1",
      channel_type: options.channelType ?? "channel",
      user: options.user ?? "U_ALICE",
      ts: options.ts ?? "1760349600.000100",
      text: "thanks for the help",
      team,
      blocks: [{ type: "rich_text", block_id: "b1", elements: blocks }],
      ...(options.threadTs && { thread_ts: options.threadTs }),
      ...(options.subtype && { subtype: options.subtype }),
      ...(options.botId && { bot_id: options.botId }),
      ...options.extra,
    },
  });
}

export type EditOptions = Omit<MessageOptions, "subtype" | "botId"> & { editedTs?: string | null };

export function messageChangedEvent(blocks: RichElement[], options: EditOptions = {}) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  const ts = options.ts ?? "1760349600.000100";
  const editedTs = options.editedTs === undefined ? "1760349660.000100" : options.editedTs;
  return JSON.stringify({
    type: "event_callback",
    team_id: team,
    event_id: `Ev${eventCounter}`,
    event: {
      type: "message",
      subtype: "message_changed",
      hidden: true,
      channel: options.channel ?? "C1",
      channel_type: options.channelType ?? "channel",
      ts: editedTs ?? "1760349900.000200",
      message: {
        type: "message",
        user: options.user ?? "U_ALICE",
        ts,
        text: "thanks for the help, edited",
        team,
        blocks: [{ type: "rich_text", block_id: "b1", elements: blocks }],
        ...(editedTs && { edited: { user: options.user ?? "U_ALICE", ts: editedTs } }),
        ...(options.threadTs && { thread_ts: options.threadTs }),
        ...options.extra,
      },
      previous_message: { type: "message", user: options.user ?? "U_ALICE", ts, text: "thanks for the help" },
    },
  });
}

export type ChannelMessageOptions = { user?: string; ts?: string; threadTs?: string; editedTs?: string; subtype?: string };

export type ChannelMessage = { ts: string; thread_ts?: string } & Record<string, unknown>;

export function channelMessage(blocks: RichElement[], options: ChannelMessageOptions = {}): ChannelMessage {
  const user = options.user ?? "U_ALICE";
  return {
    type: "message",
    user,
    ts: options.ts ?? "1760349600.000100",
    text: "thanks for the help",
    blocks: [{ type: "rich_text", block_id: "b1", elements: blocks }],
    ...(options.threadTs && { thread_ts: options.threadTs }),
    ...(options.editedTs && { edited: { user, ts: options.editedTs } }),
    ...(options.subtype && { subtype: options.subtype }),
  };
}

export type DeletionOptions = Pick<MessageOptions, "team" | "channel" | "ts" | "user"> & { previous?: RichElement[] };

export function messageDeletedEvent(options: DeletionOptions = {}) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  const ts = options.ts ?? "1760349600.000100";
  return JSON.stringify({
    type: "event_callback",
    team_id: team,
    event_id: `Ev${eventCounter}`,
    event: {
      type: "message",
      subtype: "message_deleted",
      hidden: true,
      channel: options.channel ?? "C1",
      ts: "1760349999.000300",
      deleted_ts: ts,
      event_ts: "1760349999.000300",
      previous_message: previousMessage(team, ts, options),
    },
  });
}

export function threadParentDeletedEvent(options: DeletionOptions = {}) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  const ts = options.ts ?? "1760349600.000100";
  return JSON.stringify({
    type: "event_callback",
    team_id: team,
    event_id: `Ev${eventCounter}`,
    event: {
      type: "message",
      subtype: "message_changed",
      hidden: true,
      channel: options.channel ?? "C1",
      ts: "1760349999.000300",
      event_ts: "1760349999.000300",
      message: { type: "message", subtype: "tombstone", hidden: true, user: "USLACKBOT", text: "This message was deleted.", ts, thread_ts: ts, reply_count: 1 },
      previous_message: { ...previousMessage(team, ts, options), thread_ts: ts, reply_count: 1 },
    },
  });
}

function previousMessage(team: string, ts: string, options: DeletionOptions) {
  return {
    type: "message",
    user: options.user ?? "U_ALICE",
    ts,
    text: "thanks for the help",
    team,
    ...(options.previous && { blocks: [{ type: "rich_text", block_id: "b1", elements: options.previous }] }),
  };
}

export function appHomeOpened(user: string, options: { team?: string; tab?: "home" | "messages"; eventTime?: Date } = {}) {
  eventCounter += 1;
  return JSON.stringify({
    type: "event_callback",
    team_id: options.team ?? "T1",
    event_id: `Ev${eventCounter}`,
    event_time: Math.floor((options.eventTime ?? new Date()).getTime() / 1000),
    event: { type: "app_home_opened", user, channel: "D_KUDOS", tab: options.tab ?? "home", event_ts: "1760349600.000200" },
  });
}

export type EmojiChange =
  | { subtype: "add"; name: string; value: string }
  | { subtype: "remove"; names: string[] }
  | { subtype: "rename"; old_name: string; new_name: string; value: string };

export function emojiChangedEvent(change: EmojiChange, options: { team?: string; eventId?: string } = {}) {
  eventCounter += 1;
  return JSON.stringify({
    type: "event_callback",
    team_id: options.team ?? "T1",
    event_id: options.eventId ?? `Ev${eventCounter}`,
    event: { type: "emoji_changed", ...change, event_ts: `${Date.now() / 1000}` },
    event_time: Math.floor(Date.now() / 1000),
  });
}

export function memberEvent(type: "team_join" | "user_change", user: Record<string, unknown>, options: { team?: string; eventTs?: string } = {}) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  return JSON.stringify({
    type: "event_callback",
    team_id: team,
    event_id: `Ev${eventCounter}`,
    event: { type, user: { team_id: team, ...user }, cache_ts: 1760349600, event_ts: options.eventTs ?? `${Date.now() / 1000}` },
  });
}

export function userGroupEvent(type: "subteam_created" | "subteam_updated" | "subteam_members_changed", group: string, options: { team?: string; eventId?: string } = {}) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  const event =
    type === "subteam_members_changed"
      ? { type, subteam_id: group, team_id: team, added_users: ["U_SOMEONE"], added_users_count: "1", removed_users: [], removed_users_count: "0" }
      : { type, subteam: { id: group, team_id: team, is_usergroup: true, handle: "from-the-event", name: "From the event" } };
  return JSON.stringify({ type: "event_callback", team_id: team, event_id: options.eventId ?? `Ev${eventCounter}`, event, event_time: Math.floor(Date.now() / 1000) });
}

export function channelCreatedEvent(channel: string, options: { team?: string; eventId?: string } = {}) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  const event = { type: "channel_created", channel: { id: channel, name: "fresh-channel", created: Math.floor(Date.now() / 1000), creator: "U_ALICE" } };
  return JSON.stringify({ type: "event_callback", team_id: team, event_id: options.eventId ?? `Ev${eventCounter}`, event, event_time: Math.floor(Date.now() / 1000) });
}

export function channelSharedEvent(channel: string, options: { team?: string; eventId?: string } = {}) {
  return channelEventCallback({ type: "channel_shared", connected_team_id: "T_PARTNER", channel, event_ts: "1760349600.000100" }, options);
}

export function channelRenameEvent(channel: string, name: string, options: { team?: string; eventId?: string; isPrivate?: boolean } = {}) {
  return channelEventCallback({ type: options.isPrivate === true ? "group_rename" : "channel_rename", channel: { id: channel, name, created: Math.floor(Date.now() / 1000) } }, options);
}

export function memberJoinedChannelEvent(channel: string, user: string, options: { team?: string; eventId?: string; isPrivate?: boolean } = {}) {
  return channelEventCallback({ type: "member_joined_channel", user, channel, channel_type: options.isPrivate === true ? "G" : "C", team: options.team ?? "T1", inviter: "U_ALICE" }, options);
}

function channelEventCallback(event: object, options: { team?: string; eventId?: string }) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  return JSON.stringify({ type: "event_callback", team_id: team, event_id: options.eventId ?? `Ev${eventCounter}`, event, event_time: Math.floor(Date.now() / 1000), authorizations: [{ team_id: team, user_id: kudosAppBotUser, is_bot: true }] });
}

export type LinkSharedOptions = { team?: string; user?: string; channel?: string; messageTs?: string; eventId?: string; source?: "conversations_history" | "composer"; unfurlId?: string; externallyShared?: boolean | "unsaid" };

export function linkSharedEvent(urls: string[], options: LinkSharedOptions = {}) {
  eventCounter += 1;
  const { team = "T1", user = "U_ALICE", channel = "C_GENERAL", messageTs = "1760349800.000100", source = "conversations_history", unfurlId = `${channel}.${messageTs}.${user}` } = options;
  const links = urls.map((url) => ({ domain: new URL(url).hostname, url }));
  const event = { type: "link_shared", channel: source === "composer" ? "COMPOSER" : channel, is_bot_user_member: true, user, message_ts: messageTs, unfurl_id: unfurlId, source, links, event_ts: messageTs };
  return JSON.stringify({ type: "event_callback", team_id: team, event_id: options.eventId ?? `Ev${eventCounter}`, event, event_time: Math.floor(Date.now() / 1000), ...(options.externallyShared !== "unsaid" && { is_ext_shared_channel: options.externallyShared ?? false }) });
}

export type Conversation = { channel_id: string; channel_name: string };

export type SlashCommandOptions = { command?: "/hedgehug" | "/kudos"; team?: string; user?: string; responseUrl?: string };

export const slashCommandResponseUrl = "https://hooks.slack.com/commands/T1/1/abc";

export function slashCommand(conversation: Conversation, options: SlashCommandOptions = {}) {
  return new URLSearchParams({
    token: "legacy-verification-token",
    team_id: options.team ?? "T1",
    team_domain: "acme",
    ...conversation,
    user_id: options.user ?? "U1",
    user_name: "ann",
    command: options.command ?? "/hedgehug",
    text: "",
    api_app_id: "A1",
    response_url: options.responseUrl ?? slashCommandResponseUrl,
    trigger_id: "1.2.3",
  }).toString();
}

export const kudosAppBotUser = "U_KUDOS_BOT";

export type ReactionOptions = {
  team?: string;
  user?: string;
  reaction?: string;
  itemUser?: string | null;
  channel?: string;
  ts?: string;
  itemType?: "message" | "file";
  eventTs?: string;
  eventId?: string;
  type?: "reaction_added" | "reaction_removed";
};

export function reactionEvent(options: ReactionOptions = {}) {
  eventCounter += 1;
  const team = options.team ?? "T1";
  const ts = options.ts ?? "1760349600.000100";
  const item = options.itemType === "file" ? { type: "file", file: "F1" } : { type: "message", channel: options.channel ?? "C1", ts };
  return JSON.stringify({
    type: "event_callback",
    team_id: team,
    event_id: options.eventId ?? `Ev${eventCounter}`,
    event_time: Math.floor(Date.now() / 1000),
    authorizations: [{ team_id: team, user_id: kudosAppBotUser, is_bot: true }],
    event: {
      type: options.type ?? "reaction_added",
      user: options.user ?? "U_BOB",
      reaction: options.reaction ?? "taco",
      ...(options.itemUser !== null && { item_user: options.itemUser ?? "U_ALICE" }),
      item,
      event_ts: options.eventTs ?? `${Math.floor(Date.now() / 1000)}.000200`,
    },
  });
}
