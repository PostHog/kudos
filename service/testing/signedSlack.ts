export const signingSecret = "test-signing-secret";

export type SigningOptions = { secret?: string; signedAt?: Date; contentType?: string };

export async function signedRequest(body: string, options: SigningOptions = {}): Promise<RequestInit> {
  const timestamp = Math.floor((options.signedAt ?? new Date()).getTime() / 1000).toString();
  const signature = await sign(options.secret ?? signingSecret, `v0:${timestamp}:${body}`);
  return {
    method: "POST",
    headers: {
      "content-type": options.contentType ?? "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": `v0=${signature}`,
    },
    body,
  };
}

async function sign(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Buffer.from(mac).toString("hex");
}

/** Anything that answers a `Request` as Hono's `app.request` does: the service's app, or a front door on its own. */
export interface RequestTarget {
  request(path: string, init: RequestInit): Response | Promise<Response>;
}

export interface SlackClientOptions {
  /** The app's clock: every request is signed by it, as the E2E suite signs. */
  clock: { now(): number };
  /** Where the front door is mounted: `/slack` in the app, `""` for a front door on its own. */
  base?: string;
  secret?: string;
  /** The workspace an event, click, options request or command comes from unless it says. */
  workspace?: string;
}

/** How one request is signed: when (by the app's clock), with which secret, as which content. */
export type Signing = { at?: number; secret?: string; contentType?: string };

let eventCount = 0;

/**
 * Slack's requests to the front door through `app.request`: events, interactivity payloads, options requests and
 * slash commands, each signed as Slack signs them, by the app's clock.
 */
export function slackClient(target: RequestTarget, { clock, base = "/slack", secret = signingSecret, workspace = "T1" }: SlackClientOptions) {
  const send = async (path: string, body: string, signing: Signing = {}) => {
    const init = await signedRequest(body, { secret: signing.secret ?? secret, signedAt: new Date(signing.at ?? clock.now()), ...(signing.contentType && { contentType: signing.contentType }) });
    return target.request(`${base}${path}`, init);
  };
  const form = (path: string, fields: Record<string, string>, signing: Signing) =>
    send(path, new URLSearchParams(fields).toString(), { contentType: "application/x-www-form-urlencoded", ...signing });
  return {
    /** Any body to any of the front door's paths, such as `/events`. */
    send,
    /** An `event_callback` envelope around `event`, with a new event ID unless it says. */
    event: (event: Record<string, unknown>, { eventId = `Ev${++eventCount}`, workspace: team = workspace, ...signing }: Signing & { eventId?: string; workspace?: string } = {}) =>
      send("/events", JSON.stringify({ type: "event_callback", team_id: team, event_id: eventId, event_time: Math.floor(clock.now() / 1000), event }), signing),
    /** An interactivity payload, such as a `block_actions` click, as Slack's form. */
    interaction: (payload: Record<string, unknown>, signing: Signing = {}) => form("/interactivity", { payload: JSON.stringify(payload) }, signing),
    /** An external select's `block_suggestion`: the options it asks for answer in the response. */
    options: ({ action_id, value, user = "U_GIVER", workspace: team = workspace }: { action_id: string; value: string; user?: string; workspace?: string }, signing: Signing = {}) =>
      form("/interactivity", { payload: JSON.stringify({ type: "block_suggestion", team: { id: team }, user: { id: user }, action_id, value }) }, signing),
    /** `/hedgehug <text>`, by `U_GIVER` in `C_GENERAL` unless it says. */
    command: (text: string, { user = "U_GIVER", channel = "C_GENERAL", command = "/hedgehug", workspace: team = workspace, ...signing }: Signing & { user?: string; channel?: string; command?: string; workspace?: string } = {}) =>
      form("/commands", { team_id: team, user_id: user, channel_id: channel, command, text }, signing),
  };
}

export type SlackClient = ReturnType<typeof slackClient>;
