import type { ChannelMessage } from "./slackMessages.ts";

export type SlackUser = {
  id: string;
  team_id: string;
  name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  is_admin?: boolean;
  is_owner?: boolean;
  tz?: string;
  real_name?: string;
  profile?: { display_name?: string; real_name?: string; email?: string; title?: string; image_72?: string; image_192?: string };
};

export type SlackUserGroup = {
  id: string;
  team_id: string;
  handle: string;
  name: string;
  date_delete: number;
  auto_type: "admin" | "owner" | null;
  users: string[];
};

export type UserGroupOptions = { handle?: string; name?: string; users?: string[]; disabled?: boolean; autoType?: "admin" | "owner"; teamId?: string };

export type SlackChannel = { name: string; kind?: "public" | "private" | "archived" | "shared" | "pending-shared" | "private-shared"; joined?: boolean };

export type SlackArgs = Record<string, unknown>;

export type SlackCall = { method: string; args: SlackArgs };

export type PostedMessage = { channel: string; ts: string; threadTs?: string; text: string };

export type ScriptedAnswer = (answerAsSlackWould: () => Response) => Response | Promise<Response>;

export const slackError = (error: string): ScriptedAnswer => () => Response.json({ ok: false, error });
export const httpStatus = (status: number): ScriptedAnswer => () => new Response("upstream trouble", { status });
export const rateLimitedFor = (seconds: number): ScriptedAnswer => () =>
  Response.json({ ok: false, error: "ratelimited" }, { status: 429, headers: { "retry-after": String(seconds) } });
export const networkFailure: ScriptedAnswer = () => {
  throw new TypeError("fetch failed");
};
export const timesOut: ScriptedAnswer = () => {
  throw new DOMException("The operation timed out.", "TimeoutError");
};
export const landsButTimesOut: ScriptedAnswer = (answerAsSlackWould) => {
  answerAsSlackWould();
  return timesOut(answerAsSlackWould);
};

export class FakeSlack {
  readonly calls: SlackCall[] = [];
  private readonly users = new Map<string, SlackUser>();
  private readonly userGroups = new Map<string, SlackUserGroup>();
  private readonly joinTimes = new Map<string, number>();
  private readonly reactionsByMessage = new Map<string, string[]>();
  private readonly posted: PostedMessage[] = [];
  private readonly postedBlocks = new Map<PostedMessage, unknown>();
  private readonly homes = new Map<string, unknown>();
  private readonly scripted = new Map<string, ScriptedAnswer[]>();
  private readonly callTimes = new Map<SlackCall, number>();
  private readonly holds: Array<{ method: string; about: string; meanwhile: () => Promise<void> }> = [];
  private readonly channelMessages = new Map<string, ChannelMessage[]>();
  private readonly customEmoji = new Map<string, string>();
  private readonly channels = new Map<string, SlackChannel>();
  private workspaceUrl = "https://t1.slack.com/";
  private channelsPerPage = 200;

  withWorkspaceUrl(url: string) {
    this.workspaceUrl = url;
    return this;
  }

  withMember(id: string, options: Partial<SlackUser> = {}) {
    this.users.set(id, { id, team_id: "T1", ...options });
    return this;
  }

  withUserGroup(id: string, { handle = id.toLowerCase(), name = handle, users = [], disabled = false, autoType, teamId = "T1" }: UserGroupOptions = {}) {
    this.userGroups.set(id, { id, team_id: teamId, handle, name, date_delete: disabled ? 1760349600 : 0, auto_type: autoType ?? null, users });
    return this;
  }

  withoutUserGroup(id: string) {
    this.userGroups.delete(id);
    return this;
  }

  withChannel(id: string, channel: SlackChannel) {
    this.channels.set(id, channel);
    return this;
  }

  listingChannelsPerPage(count: number) {
    this.channelsPerPage = count;
    return this;
  }

  hasJoined(id: string) {
    return this.channels.get(id)?.joined === true;
  }

  renameChannel(id: string, name: string) {
    this.channels.get(id)!.name = name;
    return this;
  }

  shareChannel(id: string) {
    const channel = this.channels.get(id)!;
    channel.kind = isPrivate(channel) ? "private-shared" : "shared";
    return this;
  }

  withCustomEmoji(name: string, value: string) {
    this.customEmoji.set(name, value);
    return this;
  }

  withoutCustomEmoji(name: string) {
    this.customEmoji.delete(name);
    return this;
  }

  withMessage(channel: string, message: ChannelMessage) {
    this.channelMessages.set(channel, [...(this.channelMessages.get(channel) ?? []), message]);
    return this;
  }

  joiningAt(id: string, at: Date, options: Partial<SlackUser> = {}) {
    this.joinTimes.set(id, at.getTime());
    return this.withMember(id, options);
  }

  answering(method: string, ...answers: ScriptedAnswer[]) {
    this.scripted.set(method, [...(this.scripted.get(method) ?? []), ...answers]);
    return this;
  }

  answeringIn(method: string, channel: string, ...answers: ScriptedAnswer[]) {
    return this.answering(`${method} ${channel}`, ...answers);
  }

  holdingBack(method: string, about: string, meanwhile: () => Promise<void>) {
    this.holds.push({ method, about, meanwhile });
    return this;
  }

  holdNext(method: string) {
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    let signalReached = () => {};
    const reached = new Promise<void>((resolve) => (signalReached = resolve));
    this.answering(method, async (answerAsSlackWould) => {
      signalReached();
      await released;
      return answerAsSlackWould();
    });
    return { reached, release };
  }

  removeReaction(channel: string, ts: string, name: string) {
    this.setReactions(channel, ts, this.reactionsOn(channel, ts).filter((reaction) => reaction !== name));
  }

  reactionsOn(channel: string, ts: string) {
    return this.reactionsByMessage.get(`${channel}/${ts}`) ?? [];
  }

  messagesIn(channel: string) {
    return this.posted.filter((message) => message.channel === channel);
  }

  messagesShownIn(channel: string) {
    return this.messagesIn(channel).map((message) => ({ ...message, blocks: this.postedBlocks.get(message) }));
  }

  homeShownTo(user: string) {
    return this.homes.get(user);
  }

  ephemeralsTo(user: string) {
    return this.callsTo("chat.postEphemeral").filter((args) => args.user === user);
  }

  callsTo(method: string) {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  }

  timesOf(method: string, matching: (args: SlackArgs) => boolean = () => true) {
    return this.calls.filter((call) => call.method === method && matching(call.args)).map((call) => this.callTimes.get(call)!);
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = url.pathname.split("/").pop() ?? "";
    const args: SlackArgs = init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(url.searchParams);
    await this.releaseHold(method, args);
    const call = { method, args };
    this.calls.push(call);
    this.callTimes.set(call, Date.now());
    const answerAsSlackWould = () => Response.json(this.answer(method, args));
    const scripted = this.scripted.get(`${method} ${String(args.channel ?? "")}`)?.shift() ?? this.scripted.get(method)?.shift();
    return scripted ? scripted(answerAsSlackWould) : answerAsSlackWould();
  };

  private async releaseHold(method: string, args: SlackArgs) {
    const index = this.holds.findIndex((hold) => hold.method === method && (args.name ?? args.user ?? args.channel) === hold.about);
    if (index === -1) return;
    const [hold] = this.holds.splice(index, 1);
    await hold!.meanwhile();
  }

  private answer(method: string, args: SlackArgs) {
    const field = (name: string) => String(args[name] ?? "");
    if (method === "users.info") {
      const user = this.users.get(field("user"));
      const hasJoined = Date.now() >= (this.joinTimes.get(field("user")) ?? 0);
      return user && hasJoined ? { ok: true, user } : { ok: false, error: "user_not_found" };
    }
    if (method === "users.lookupByEmail") {
      const email = field("email").toLowerCase();
      const user = [...this.users.values()].find(({ id, profile }) => profile?.email?.toLowerCase() === email && Date.now() >= (this.joinTimes.get(id) ?? 0));
      return user ? { ok: true, user } : { ok: false, error: "users_not_found" };
    }
    if (method === "users.list") return { ok: true, members: [...this.users.values()], response_metadata: { next_cursor: "" } };
    if (method === "emoji.list") return { ok: true, emoji: Object.fromEntries(this.customEmoji), cache_ts: "1760349600.000000" };
    if (method === "usergroups.list") return { ok: true, usergroups: this.userGroupsListed(args) };
    if (method === "usergroups.users.list") {
      const group = this.userGroups.get(field("usergroup"));
      return group ? { ok: true, users: group.users } : { ok: false, error: "no_such_subteam" };
    }
    if (method === "reactions.add") {
      const reactions = this.reactionsOn(field("channel"), field("timestamp"));
      if (reactions.includes(field("name"))) return { ok: false, error: "already_reacted" };
      this.setReactions(field("channel"), field("timestamp"), [...reactions, field("name")]);
      return { ok: true };
    }
    if (method === "reactions.remove") {
      const reactions = this.reactionsOn(field("channel"), field("timestamp"));
      if (!reactions.includes(field("name"))) return { ok: false, error: "no_reaction" };
      this.removeReaction(field("channel"), field("timestamp"), field("name"));
      return { ok: true };
    }
    if (method === "chat.postEphemeral") return { ok: true, message_ts: "1760349700.000100" };
    if (method === "views.publish") {
      const refusal = unsupportedElementIn(args.view);
      if (refusal !== null) return { ok: false, error: "invalid_arguments", response_metadata: { messages: [refusal] } };
      this.homes.set(field("user_id"), args.view);
      return { ok: true };
    }
    if (method === "chat.postMessage") return this.postMessage(args);
    if (method === "chat.update") return this.updateMessage(args);
    if (method === "conversations.history") return this.history(args);
    if (method === "conversations.replies") return this.replies(args);
    if (method === "conversations.join") return this.join(field("channel"));
    if (method === "conversations.list") return this.listChannels(args);
    if (method === "users.conversations") return this.channelsJoined(args);
    if (method === "conversations.leave") return this.leave(field("channel"));
    if (method === "chat.unfurl") return unfurlAnswerTo(args);
    if (method === "conversations.info") return this.channelInfo(field("channel"));
    if (method === "conversations.open") return { ok: true, channel: { id: directMessageWith(field("users")) } };
    if (method === "auth.test") return { ok: true, url: this.workspaceUrl, team: "Kudos Test", team_id: "T1", user: "kudos", user_id: "U_KUDOS_BOT", bot_id: "B_KUDOS" };
    return { ok: false, error: "unknown_method" };
  }

  private join(id: string) {
    const channel = this.channels.get(id);
    if (channel === undefined) return { ok: true, channel: { id } };
    if (isPrivate(channel)) return { ok: false, error: "method_not_supported_for_channel_type" };
    if (channel.kind === "archived") return { ok: false, error: "is_archived" };
    const alreadyIn = channel.joined === true;
    channel.joined = true;
    const joined = { id, name: channel.name, is_channel: true, is_private: false, is_archived: false, is_ext_shared: channel.kind === "shared" };
    return { ok: true, ...(alreadyIn && { warning: "already_in_channel" }), channel: joined };
  }

  private channelInfo(id: string) {
    const channel = this.channels.get(id);
    if (channel === undefined || (isPrivate(channel) && channel.joined !== true)) return { ok: false, error: "channel_not_found" };
    return { ok: true, channel: describedChannel(id, channel) };
  }

  private channelsJoined(args: SlackArgs) {
    const types = String(args.types ?? "public_channel").split(",");
    const joined = [...this.channels.entries()].filter(([, channel]) => channel.joined === true && types.includes(isPrivate(channel) ? "private_channel" : "public_channel"));
    const from = Number(args.cursor ?? 0);
    const to = from + Math.min(Number(args.limit ?? 100), this.channelsPerPage);
    return { ok: true, channels: joined.slice(from, to).map(([id, channel]) => describedChannel(id, channel)), response_metadata: { next_cursor: to < joined.length ? String(to) : "" } };
  }

  private leave(id: string) {
    const channel = this.channels.get(id);
    if (channel === undefined) return { ok: false, error: "channel_not_found" };
    if (channel.joined !== true) return { ok: false, not_in_channel: true };
    channel.joined = false;
    return { ok: true };
  }

  private listChannels(args: SlackArgs) {
    if (args.types !== "public_channel") return { ok: false, error: "invalid_types" };
    const listed = [...this.channels.entries()].filter(([, channel]) => !isPrivate(channel) && !(args.exclude_archived === "true" && channel.kind === "archived"));
    const from = Number(args.cursor ?? 0);
    const to = from + Math.min(Number(args.limit ?? 100), this.channelsPerPage);
    const channels = listed.slice(from, to).map(([id, channel]) => ({
      id,
      name: channel.name,
      is_channel: true,
      is_private: false,
      is_archived: channel.kind === "archived",
      is_ext_shared: channel.kind === "shared",
      is_pending_ext_shared: channel.kind === "pending-shared",
      is_member: channel.joined === true,
    }));
    return { ok: true, channels, response_metadata: { next_cursor: to < listed.length ? String(to) : "" } };
  }

  private userGroupsListed(args: SlackArgs) {
    const groups = [...this.userGroups.values()].filter((group) => args.include_disabled === "true" || group.date_delete === 0);
    return groups.map(({ users, ...group }) => ({
      ...group,
      ...(args.include_users === "true" && { users }),
      ...(args.include_count === "true" && { user_count: users.length }),
    }));
  }

  private postMessage(args: SlackArgs) {
    const channel = String(args.channel);
    const ts = `1760349700.${String(100 + this.posted.length).padStart(6, "0")}`;
    const message = { channel, ts, ...(args.thread_ts !== undefined && { threadTs: String(args.thread_ts) }), text: String(args.text) };
    this.posted.push(message);
    this.postedBlocks.set(message, args.blocks);
    return { ok: true, channel, ts };
  }

  private updateMessage(args: SlackArgs) {
    const message = this.posted.find(({ channel, ts }) => channel === args.channel && ts === args.ts);
    if (message === undefined) return { ok: false, error: "message_not_found" };
    message.text = String(args.text);
    this.postedBlocks.set(message, args.blocks);
    return { ok: true, channel: message.channel, ts: message.ts };
  }

  private history(args: SlackArgs) {
    const topLevel = this.messagesOf(String(args.channel)).filter((message) => message.thread_ts === undefined || message.thread_ts === message.ts);
    const newestFirst = topLevel.filter((message) => isWithin(message.ts, args)).sort((a, b) => order(b.ts) - order(a.ts));
    return { ok: true, messages: newestFirst.slice(0, Number(args.limit ?? 100)), has_more: false };
  }

  private replies(args: SlackArgs) {
    const root = String(args.ts);
    const thread = this.messagesOf(String(args.channel)).filter((message) => message.ts === root || message.thread_ts === root);
    const parent = thread.find((message) => message.ts === root);
    if (parent === undefined) return { ok: false, error: "thread_not_found" };
    const replies = thread.filter((message) => message.ts !== root && isWithin(message.ts, args)).sort((a, b) => order(a.ts) - order(b.ts));
    return { ok: true, messages: [parent, ...replies], has_more: false };
  }

  private messagesOf(channel: string) {
    return this.channelMessages.get(channel) ?? [];
  }

  private setReactions(channel: string, ts: string, reactions: string[]) {
    this.reactionsByMessage.set(`${channel}/${ts}`, reactions);
  }
}

function isWithin(ts: string, { oldest, latest, inclusive }: SlackArgs) {
  const [from, to, at] = [order(String(oldest ?? "0")), order(String(latest ?? "9999999999.999999")), order(ts)];
  return inclusive === "true" ? from <= at && at <= to : from < at && at < to;
}

function order(ts: string) {
  const [seconds = "0", fraction = ""] = ts.split(".");
  return Number(seconds) * 1_000_000 + Number(fraction.padEnd(6, "0").slice(0, 6));
}

function unfurlAnswerTo({ channel, ts, unfurl_id, source, unfurls }: SlackArgs) {
  const addressed = (channel !== undefined && ts !== undefined) !== (unfurl_id !== undefined && source !== undefined);
  const cards = typeof unfurls === "object" && unfurls !== null ? Object.values(unfurls) : [];
  const shaped = cards.length > 0 && cards.every((card) => Array.isArray((card as { blocks?: unknown }).blocks));
  return addressed && shaped ? { ok: true } : { ok: false, error: "invalid_arguments" };
}

export function isWelcome(args: SlackArgs) {
  return String(args.text).includes("Welcome to HedgeHug");
}

const multiSelects = new Set(["multi_static_select", "multi_users_select", "multi_conversations_select", "multi_channels_select", "multi_external_select"]);

function unsupportedElementIn(view: unknown): string | null {
  const blocks = (view as { blocks?: Array<{ type: string; elements?: Array<{ type: string }> }> } | undefined)?.blocks ?? [];
  const index = blocks.findIndex((block) => block.type === "actions" && (block.elements ?? []).some((element) => multiSelects.has(element.type)));
  return index < 0 ? null : `[ERROR] unsupported element: multiselect [json-pointer:view/blocks/${index}]`;
}

function isPrivate(channel: SlackChannel) {
  return channel.kind === "private" || channel.kind === "private-shared";
}

function describedChannel(id: string, channel: SlackChannel) {
  const isShared = channel.kind === "shared" || channel.kind === "private-shared";
  return { id, name: channel.name, is_channel: true, is_private: isPrivate(channel), is_archived: channel.kind === "archived", is_ext_shared: isShared, is_pending_ext_shared: channel.kind === "pending-shared", is_member: channel.joined === true };
}

// The DM conversation conversations.open gives the app for a member, one per member as Slack keeps it.
export function directMessageWith(user: string) {
  return `D${user}`;
}
