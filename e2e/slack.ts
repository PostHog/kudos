import { createHmac, randomBytes } from "node:crypto";
import { directMessageWith } from "../testing/fakeSlack.ts";
import type { Target } from "./target.ts";

export type RichElement =
  | { type: "user"; user_id: string }
  | { type: "usergroup"; usergroup_id: string }
  | { type: "broadcast"; range: "here" | "channel" | "everyone" }
  | { type: "emoji"; name: string }
  | { type: "text"; text: string };

export const mention = (user: string): RichElement => ({ type: "user", user_id: user });
export const groupMention = (group: string): RichElement => ({ type: "usergroup", usergroup_id: group });
export const broadcast = (range: "here" | "channel" | "everyone"): RichElement => ({ type: "broadcast", range });
export const emoji = (name: string): RichElement => ({ type: "emoji", name });
export const text = (value: string): RichElement => ({ type: "text", text: value });

export type ChannelType = "channel" | "group" | "im" | "mpim";

export type PostOptions = { channel?: string; channelType?: ChannelType; threadTs?: string; fromBot?: boolean };

export type Posted = { channel: string; ts: string; channelType: ChannelType; user: string; elements: RichElement[]; threadTs?: string };

export type MemberOptions = { is_bot?: boolean; deleted?: boolean; is_admin?: boolean; real_name?: string };

export type ChannelKind = "public" | "private" | "shared" | "pending-shared";

export type SlackCall = Record<string, unknown>;

export type View = { type: string; blocks: Block[] };

// A message the app posted, as Slack shows it now: after any update, with the ts that names it.
export type Shown = { channel: string; ts: string; threadTs?: string; text: string; blocks?: Block[] };

export type Block = { type: string; text?: { text: string }; elements?: Element[]; accessory?: Element };

export type Element = { type: string; action_id?: string; value?: string; text?: { text: string }; options?: Array<{ text: { text: string }; value: string }>; initial_option?: { text: { text: string }; value: string } };

export type Action = { action_id: string; value?: string; type?: string; selected_option?: { value: string }; selected_channel?: string };

export class Slack {
  private readonly target: Target;

  constructor(target: Target) {
    this.target = target;
  }

  async member(options: MemberOptions = {}) {
    const id = uniqueId("U");
    await this.control("members", { id, team_id: this.target.workspace, tz: noonZone(), real_name: `Member ${id}`, ...options });
    return id;
  }

  // A channel only this journey uses, so what the app does in it is this journey's alone.
  async channel(kind: ChannelKind = "public", { name = `e2e-${uniqueId("").toLowerCase()}`, joined = false } = {}) {
    const id = uniqueId("C");
    await this.control("channels", { id, name, kind, joined });
    return { id, name };
  }

  // Someone creates a public channel: Slack tells the app with channel_created. `name` lets a journey name it like a
  // customer channel or one meant to be shared.
  async createChannel({ name = `e2e-${uniqueId("").toLowerCase()}` } = {}) {
    const channel = await this.channel("public", { name });
    await this.sendEvent({ type: "channel_created", channel: { id: channel.id, name, created: Math.floor(Date.now() / 1000), creator: uniqueId("U") }, event_ts: uniqueTs() });
    return channel;
  }

  // A channel the app is in becomes shared with another organization, as Slack tells it.
  async shareChannel({ id }: { id: string }) {
    await this.control("share-channel", { id });
    await this.sendEvent({ type: "channel_shared", connected_team_id: uniqueId("T"), channel: id, event_ts: uniqueTs() });
  }

  // A channel is renamed, as Slack tells it.
  async renameChannel({ id }: { id: string }, name: string) {
    await this.control("rename-channel", { id, name });
    await this.sendEvent({ type: "channel_rename", channel: { id, name, created: Math.floor(Date.now() / 1000) }, event_ts: uniqueTs() });
    return { id, name };
  }

  // Someone creates a user group of `users` in Slack, which tells the app with subteam_created.
  async userGroup(users: string[]) {
    const id = uniqueId("S");
    const handle = `e2e-${id.toLowerCase()}`;
    await this.control("user-groups", { id, teamId: this.target.workspace, handle, name: `Group ${id}`, users });
    await this.sendEvent({ type: "subteam_created", subteam: { id, team_id: this.target.workspace, handle, name: `Group ${id}` }, event_ts: uniqueTs() });
    return id;
  }

  // A direct message between members: a D… conversation the app is no part of, so Slack answers its lookups with
  // channel_not_found and refuses a join, and commands name it as below.
  async directMessage() {
    const id = uniqueId("D");
    await this.control("channels", { id, name: id, kind: "private", joined: false });
    return { id, name: "directmessage" };
  }

  async post(user: string, elements: RichElement[], { channel = "C_E2E_GENERAL", channelType = "channel", threadTs, fromBot = false }: PostOptions = {}): Promise<Posted> {
    const ts = uniqueTs();
    await this.sendEvent({
      type: "message",
      channel,
      channel_type: channelType,
      user,
      ts,
      team: this.target.workspace,
      ...(threadTs !== undefined && { thread_ts: threadTs }),
      ...(fromBot && { bot_id: "B_E2E" }),
      ...content(elements),
    });
    return { channel, ts, channelType, user, elements, ...(threadTs !== undefined && { threadTs }) };
  }

  // Slack sends an edit as a message_changed event that carries the whole new message and when it was edited.
  async edit(posted: Posted, elements: RichElement[]): Promise<Posted> {
    const editedTs = uniqueTs();
    const { user, ts, threadTs } = posted;
    const message = { type: "message", user, ts, team: this.target.workspace, ...(threadTs !== undefined && { thread_ts: threadTs }) };
    await this.sendEvent({
      type: "message",
      subtype: "message_changed",
      hidden: true,
      channel: posted.channel,
      channel_type: posted.channelType,
      ts: editedTs,
      message: { ...message, edited: { user, ts: editedTs }, ...content(elements) },
      previous_message: { ...message, ...content(posted.elements) },
    });
    return { ...posted, elements };
  }

  // A member adds a reaction to someone's message.
  async react(user: string, { channel, ts, user: author }: Posted, reaction: string) {
    const eventTs = uniqueTs();
    await this.sendEvent({ type: "reaction_added", user, reaction, item_user: author, item: { type: "message", channel, ts }, event_ts: eventTs });
  }

  // A member opens the app's Home tab.
  async openHome(user: string) {
    await this.sendEvent({ type: "app_home_opened", user, channel: uniqueId("D"), tab: "home", event_ts: uniqueTs() });
  }

  // A member clicks a button or picks an option on App Home, as Slack posts it: a form with one JSON payload.
  async click(user: string, action: Action, state: Record<string, unknown> = {}) {
    const payload = {
      type: "block_actions",
      team: { id: this.target.workspace },
      user: { id: user },
      api_app_id: this.target.appId,
      trigger_id: uniqueId("T"),
      container: { type: "view" },
      view: { type: "home" },
      state: { values: state },
      actions: [{ type: "button", ...action }],
    };
    const response = await this.signed("/slack/interactivity", new URLSearchParams({ payload: JSON.stringify(payload) }).toString(), "application/x-www-form-urlencoded");
    if (response.status !== 200) throw await this.failure(`the app answered a click with ${response.status}`);
  }

  // Slack delivers an event again when it saw no answer in time: the same envelope, event id and all.
  async redeliverLast() {
    if (this.lastEnvelope === undefined) throw new Error("no event to deliver again");
    await this.deliver(this.lastEnvelope);
  }

  // Runs a slash command. Slack shows the app's answer from the request's own response or from posts to the
  // command's response URL; `responsesTo(reply)` reads both.
  async command(user: string, channel: { id: string; name: string }, text = "") {
    const reply = uniqueId("R");
    const form = new URLSearchParams({
      team_id: this.target.workspace,
      channel_id: channel.id,
      channel_name: channel.name,
      user_id: user,
      command: "/hedgehug",
      text,
      response_url: `${this.target.fakesUrl}/responses/${reply}`,
      trigger_id: uniqueId("T"),
      api_app_id: this.target.appId,
    });
    const response = await this.signed("/slack/commands", form.toString(), "application/x-www-form-urlencoded");
    if (response.status !== 200) throw await this.failure(`the app answered the command with ${response.status}`);
    const body = await response.text();
    if (body === "") return reply;
    const isJson = response.headers.get("content-type")?.startsWith("application/json") === true;
    this.immediateResponses.set(reply, isJson ? (JSON.parse(body) as Record<string, unknown>) : { text: body });
    return reply;
  }

  // What Slack shows for a command, in order; a reply that names no response_type shows only to its member.
  async responsesTo(reply: string) {
    const immediate = this.immediateResponses.get(reply);
    const posted = await this.read<Record<string, unknown>[]>("responses", { reply });
    return [...(immediate === undefined ? [] : [immediate]), ...posted].map((shown): Record<string, unknown> => ({ response_type: "ephemeral", ...shown }));
  }

  // Asks with the command, then watches that one command's answers until one is accepted, since an app may answer
  // first with a placeholder and then with what was asked for, in the request or later at the response URL. When one
  // command's answers settle with none accepted, it asks again: what it asks about may not have happened yet.
  async askUntil(user: string, channel: { id: string; name: string }, text: string, accept: (answer: string) => boolean, { perAskMs = 5_000, withinMs = 15_000 } = {}) {
    const until = Date.now() + withinMs;
    let answers: string[] = [];
    while (Date.now() < until) {
      const reply = await this.command(user, channel, text);
      const askedUntil = Math.min(until, Date.now() + perAskMs);
      do {
        answers = (await this.responsesTo(reply)).map((shown) => String(shown.text));
        const accepted = answers.find(accept);
        if (accepted !== undefined) return accepted;
        await new Promise((resolve) => setTimeout(resolve, 250));
      } while (Date.now() < askedUntil);
    }
    throw new Error(`no answer to /hedgehug ${text} was accepted; the last command's answers were ${JSON.stringify(answers)}`);
  }

  hasJoined(channel: string) {
    return this.read<boolean>("joined", { channel });
  }

  // When Slack received each call of `method` in `channel`, in milliseconds.
  callTimes(method: string, channel: string) {
    return this.read<number[]>("call-times", { method, channel });
  }

  // Slack answers the next call of `method` in `channel` with a 429 that asks to wait `seconds`.
  rateLimitNext(method: string, channel: string, seconds: number) {
    return this.control("rate-limits", { method, channel, seconds });
  }

  reactionsOn({ channel, ts }: Posted) {
    return this.read<string[]>("reactions", { channel, ts });
  }

  async ephemeralsTo(user: string) {
    return (await this.callsTo("chat.postEphemeral")).filter((call) => call.user === user);
  }

  // Direct messages the app sent a member: to the member's id as the channel, or to the DM conversations.open gave it.
  async dmsTo(user: string) {
    return (await this.callsTo("chat.postMessage")).filter((call) => call.channel === user || call.channel === directMessageWith(user));
  }

  // The messages the app posted in a channel, oldest first, each as it shows now. A member's id names their DM.
  messagesIn(channel: string) {
    return this.read<Shown[]>("messages", { channel });
  }

  // The App Home views the app published for a member, oldest first.
  async homesOf(user: string) {
    return (await this.callsTo("views.publish")).filter((call) => call.user_id === user).map((call) => call.view as View);
  }

  callsTo(method: string) {
    return this.read<SlackCall[]>("calls", { method });
  }

  private lastEnvelope: string | undefined;
  private readonly immediateResponses = new Map<string, Record<string, unknown>>();

  private async sendEvent(event: Record<string, unknown>) {
    this.lastEnvelope = JSON.stringify({ type: "event_callback", team_id: this.target.workspace, event_id: uniqueId("Ev"), event_time: Math.floor(Date.now() / 1000), event });
    await this.deliver(this.lastEnvelope);
  }

  private async deliver(envelope: string) {
    const response = await this.signed("/slack/events", envelope);
    if (response.status !== 200) throw await this.failure(`the app answered an event with ${response.status}`);
  }

  // A failed request names the exceptions the app has reported to PostHog, which it does a moment after failing.
  private async failure(what: string) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const reported = await this.read<string[]>("exceptions", {}).catch(() => []);
    return new Error(reported.length === 0 ? what : `${what}; the app reported:\n${reported.join("\n")}`);
  }

  private signed(path: string, body: string, contentType = "application/json") {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", this.target.signingSecret).update(`v0:${timestamp}:${body}`).digest("hex");
    return fetch(`${this.target.appUrl}${path}`, {
      method: "POST",
      headers: { "content-type": contentType, "x-slack-request-timestamp": timestamp, "x-slack-signature": `v0=${signature}` },
      body,
    });
  }

  private async control(path: string, value: unknown) {
    const response = await fetch(`${this.target.fakesUrl}/_control/${path}`, { method: "POST", body: JSON.stringify(value) });
    if (!response.ok) throw new Error(`the fakes refused ${path}: ${response.status}`);
  }

  private async read<Value>(path: string, query: Record<string, string>) {
    const response = await fetch(`${this.target.fakesUrl}/_control/${path}?${new URLSearchParams(query)}`);
    if (!response.ok) throw new Error(`the fakes refused ${path}: ${response.status}`);
    return (await response.json()) as Value;
  }
}

function content(elements: RichElement[]) {
  return {
    text: elements.map(plainTextOf).join(""),
    blocks: [{ type: "rich_text", block_id: uniqueId("b"), elements: [{ type: "rich_text_section", elements }] }],
  };
}

function plainTextOf(element: RichElement) {
  if (element.type === "user") return `<@${element.user_id}>`;
  if (element.type === "usergroup") return `<!subteam^${element.usergroup_id}>`;
  if (element.type === "broadcast") return `<!${element.range}>`;
  if (element.type === "emoji") return `:${element.name}:`;
  return element.text;
}

function uniqueId(prefix: string) {
  return `${prefix}${randomBytes(6).toString("hex").toUpperCase()}`;
}

let lastTs = 0;

function uniqueTs() {
  lastTs = Math.max(lastTs + 1, Date.now() * 1000);
  return `${Math.floor(lastTs / 1_000_000)}.${String(lastTs % 1_000_000).padStart(6, "0")}`;
}

// A fixed-offset zone where it is now about noon, so a journey's messages never straddle the member's midnight and
// the daily allowance never refills mid-journey.
function noonZone() {
  const offset = 12 - new Date().getUTCHours();
  return offset === 0 ? "Etc/GMT" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}
