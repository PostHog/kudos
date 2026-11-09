import { createHmac, randomBytes } from "node:crypto";
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

export type MemberOptions = { is_bot?: boolean; deleted?: boolean };

export type ChannelKind = "public" | "private" | "shared" | "pending-shared";

export type SlackCall = Record<string, unknown>;

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

  // Slack's direct message with the app: a D… conversation the app can't join, whose name commands report as below.
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
    if (response.status !== 200) throw new Error(`the app answered the command with ${response.status}`);
    const body = await response.text();
    if (body !== "") this.immediateResponses.set(reply, JSON.parse(body) as Record<string, unknown>);
    return reply;
  }

  async responsesTo(reply: string) {
    const immediate = this.immediateResponses.get(reply);
    return [...(immediate === undefined ? [] : [immediate]), ...(await this.read<Record<string, unknown>[]>("responses", { reply }))];
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
    if (response.status !== 200) throw new Error(`the app answered an event with ${response.status}`);
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
