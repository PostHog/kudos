import { createHmac, randomBytes } from "node:crypto";
import type { Target } from "./target.ts";
import { appTime } from "./time.ts";

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

export type MemberOptions = { is_bot?: boolean; deleted?: boolean; is_admin?: boolean };

export type ChannelKind = "public" | "private" | "shared" | "pending-shared";

export type SlackCall = Record<string, unknown>;

export type View = { type: string; blocks: Block[] };

export type Block = { type: string; text?: { text: string }; elements?: Element[]; accessory?: Element };

export type Element = {
  type: string;
  action_id?: string;
  value?: string;
  text?: { text: string };
  options?: Array<{ text: { text: string }; value: string }>;
  initial_option?: { text: { text: string }; value: string };
};

export type Action = { action_id: string; value?: string; type?: string; selected_option?: { value: string }; selected_channel?: string };

export class Slack {
  private readonly target: Target;

  constructor(target: Target) {
    this.target = target;
  }

  private offsetMs: number | undefined;

  // Slack's clock, which is the app's: a journey tagged @time moves both, so what Slack signs, stamps and sends keeps
  // the time the app expects, and a new member's day sits where the app says it does.
  async now() {
    if (this.offsetMs === undefined) {
      const { timeUrl, testSecret } = this.target;
      this.followClock(testSecret === undefined ? Date.now() : await appTime(timeUrl!, testSecret).now());
    }
    return Date.now() + this.offsetMs!;
  }

  followClock(appNow: number) {
    this.offsetMs = appNow - Date.now();
  }

  async member(options: MemberOptions = {}) {
    const id = uniqueId("U");
    await this.control("members", { id, team_id: this.target.workspace, tz: noonZone(await this.now()), real_name: `Member ${id}`, ...options });
    return id;
  }

  // Someone Slack doesn't know yet: it answers users.info about them with user_not_found until they join.
  stranger() {
    const id = uniqueId("U");
    return { id, join: async (options: MemberOptions = {}) => this.control("members", { id, team_id: this.target.workspace, tz: noonZone(await this.now()), real_name: `Member ${id}`, ...options }) };
  }

  // A user group in Slack, which the app reads only when it syncs them. Groups are workspace-wide, so a journey names
  // its own.
  async userGroup(name: string, users: string[]) {
    const id = uniqueId("S");
    await this.control("user-groups", { id, team_id: this.target.workspace, handle: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"), name, users });
    return id;
  }

  // A channel only this journey uses, so what the app does in it is this journey's alone.
  async channel(kind: ChannelKind = "public", { name = `e2e-${uniqueId("").toLowerCase()}`, joined = false } = {}) {
    const id = uniqueId("C");
    await this.control("channels", { id, name, kind, joined });
    return { id, name };
  }

  // A direct message between members: a D… conversation the app is no part of, so Slack answers its lookups with
  // channel_not_found and refuses a join, and commands name it as below.
  async directMessage() {
    const id = uniqueId("D");
    await this.control("channels", { id, name: id, kind: "private", joined: false });
    return { id, name: "directmessage" };
  }

  async post(user: string, elements: RichElement[], { channel = "C_E2E_GENERAL", channelType = "channel", threadTs, fromBot = false }: PostOptions = {}): Promise<Posted> {
    const ts = uniqueTs(await this.now());
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
    const editedTs = uniqueTs(await this.now());
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
    const eventTs = uniqueTs(await this.now());
    await this.sendEvent({ type: "reaction_added", user, reaction, item_user: author, item: { type: "message", channel, ts }, event_ts: eventTs });
  }

  // A member opens the app's Home tab.
  async openHome(user: string) {
    await this.sendEvent({ type: "app_home_opened", user, channel: uniqueId("D"), tab: "home", event_ts: uniqueTs(await this.now()) });
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

  // Direct messages the app sent a member: Slack takes a member's id as the channel of a DM.
  async dmsTo(user: string) {
    return (await this.callsTo("chat.postMessage")).filter((call) => call.channel === user);
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
    this.lastEnvelope = JSON.stringify({ type: "event_callback", team_id: this.target.workspace, event_id: uniqueId("Ev"), event_time: Math.floor((await this.now()) / 1000), event });
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

  private async signed(path: string, body: string, contentType = "application/json") {
    const timestamp = Math.floor((await this.now()) / 1000).toString();
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

function uniqueTs(now: number) {
  lastTs = Math.max(lastTs + 1, now * 1000);
  return `${Math.floor(lastTs / 1_000_000)}.${String(lastTs % 1_000_000).padStart(6, "0")}`;
}

// A fixed-offset zone where it is now about noon, so a journey's messages never straddle the member's midnight and
// the daily allowance never refills mid-journey.
function noonZone(now: number) {
  const offset = 12 - new Date(now).getUTCHours();
  return offset === 0 ? "Etc/GMT" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}
