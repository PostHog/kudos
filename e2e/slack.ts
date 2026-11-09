import { createHmac, randomBytes } from "node:crypto";
import type { Target } from "./target.ts";

export type RichElement =
  | { type: "user"; user_id: string }
  | { type: "emoji"; name: string }
  | { type: "text"; text: string };

export const mention = (user: string): RichElement => ({ type: "user", user_id: user });
export const emoji = (name: string): RichElement => ({ type: "emoji", name });
export const text = (value: string): RichElement => ({ type: "text", text: value });

export type Posted = { channel: string; ts: string };

export type SlackCall = Record<string, unknown>;

export class Slack {
  private readonly target: Target;

  constructor(target: Target) {
    this.target = target;
  }

  async member() {
    const id = uniqueId("U");
    await this.control("members", { id, team_id: this.target.workspace, tz: "UTC", real_name: `Member ${id}` });
    return id;
  }

  async post(user: string, elements: RichElement[], { channel = "C_E2E_GENERAL" } = {}): Promise<Posted> {
    const ts = uniqueTs();
    await this.sendEvent({
      type: "message",
      channel,
      channel_type: "channel",
      user,
      ts,
      team: this.target.workspace,
      text: elements.map(plainTextOf).join(""),
      blocks: [{ type: "rich_text", block_id: uniqueId("b"), elements: [{ type: "rich_text_section", elements }] }],
    });
    return { channel, ts };
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

  private async sendEvent(event: Record<string, unknown>) {
    const envelope = { type: "event_callback", team_id: this.target.workspace, event_id: uniqueId("Ev"), event_time: Math.floor(Date.now() / 1000), event };
    const response = await this.signed("/slack/events", JSON.stringify(envelope));
    if (response.status !== 200) throw new Error(`the app answered the ${String(event.type)} event with ${response.status}`);
  }

  private signed(path: string, body: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", this.target.signingSecret).update(`v0:${timestamp}:${body}`).digest("hex");
    return fetch(`${this.target.appUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": `v0=${signature}` },
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

function plainTextOf(element: RichElement) {
  if (element.type === "user") return `<@${element.user_id}>`;
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
