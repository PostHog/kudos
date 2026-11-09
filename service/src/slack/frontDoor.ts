// Slack's front door: `/slack/events`, `/slack/interactivity` and `/slack/commands`, as today's convex/slack/events.ts,
// interactivity.ts and commands.ts take them in. Each route checks Slack's signature (401 without it), answers what
// Slack needs in the response itself, and hands the rest, by kind, to the handler a domain registered. An event or a
// click is taken in once: its receipt and its handler's work commit together, so a redelivery does nothing. The front
// door knows no domain: a kind no domain registered yet is acknowledged and does nothing.
import { Hono } from "hono";
import type { Clock } from "../clock.ts";
import { errorFields, type Log } from "../log.ts";
import type { MutationContext, Operations, QueryContext } from "../operations.ts";
import { isRedelivered, recordReceipt, type Receipt } from "./receipts.ts";
import { readSignedBody } from "./signature.ts";

export type SlackEvent = { type: string } & Record<string, unknown>;
export type EventCallback = { type: "event_callback"; team_id: string; event_id: string; event: SlackEvent } & Record<string, unknown>;
export type MemberClick = { type: "block_actions"; team: { id: string }; user: { id: string }; trigger_id: string } & Record<string, unknown>;
export type OptionsRequest = { type: "block_suggestion"; team: { id: string }; user: { id: string }; action_id: string; value: string };

const userGroupEvents: ReadonlySet<string> = new Set(["subteam_created", "subteam_updated", "subteam_members_changed"]);
const channelEvents: ReadonlySet<string> = new Set(["channel_shared", "channel_rename", "group_rename", "member_joined_channel"]);

/** Today's classification chain, in its order: the first kind whose test passes takes the event. */
const eventKinds = [
  ["homeOpened", (event) => event.type === "app_home_opened" && event.tab === "home"],
  ["memberChanged", (event) => event.type === "team_join" || event.type === "user_change"],
  ["userGroupChanged", (event) => userGroupEvents.has(event.type)],
  ["emojiChanged", (event) => event.type === "emoji_changed"],
  ["channelCreated", (event) => event.type === "channel_created"],
  ["channelEvent", (event) => channelEvents.has(event.type)],
  ["linkShared", (event) => event.type === "link_shared"],
  ["reactionAdded", (event) => event.type === "reaction_added"],
  // Every other event: messages, edits and deletions among them.
  ["message", () => true],
] as const satisfies ReadonlyArray<readonly [string, (event: SlackEvent) => boolean]>;

export type EventKind = (typeof eventKinds)[number][0];
/** A member's click runs each of these, in this order, in one transaction. */
export const clickKinds = ["dmLinkClick", "homeClick"] as const;
export type ClickKind = (typeof clickKinds)[number];
/** A slash command goes down this chain until a handler answers it. */
export const commandKinds = ["profileCard", "leaderboard", "addToChannel"] as const;
export type CommandKind = (typeof commandKinds)[number];

/** `"ignored"`: the handler took nothing in, so no receipt is kept and a redelivery is handled again, as today. */
export type Handled = void | "ignored";

export interface CommandContext {
  operations: Operations;
  /** When the command arrived, by the app's clock. */
  arrivedAt: number;
}

/** A domain's Slack handlers, by kind. Each kind has at most one handler across every domain. */
export interface SlackHandlers {
  /** Runs in the mutation that records the event's receipt: it takes the event in, and enqueues any slow work. */
  events?: Partial<Record<EventKind, (ctx: MutationContext, envelope: EventCallback) => Promise<Handled>>>;
  /** Runs in the mutation that records the click's receipt, keyed by its trigger. */
  clicks?: Partial<Record<ClickKind, (ctx: MutationContext, click: MemberClick) => Promise<Handled>>>;
  /** An external select's options, by its action ID, answered in Slack's response. */
  options?: Record<string, (ctx: QueryContext, request: OptionsRequest) => Promise<unknown[]>>;
  /** Answers the command with a response, or `undefined` to pass it down the chain. */
  commands?: Partial<Record<CommandKind, (ctx: CommandContext, command: URLSearchParams) => Promise<Response | undefined>>>;
}

export interface FrontDoorOptions {
  /** `SLACK_SIGNING_SECRET`. */
  signingSecret: string | undefined;
  /** The app's clock: a request's signature is fresh by it, as the E2E suite signs by it. */
  clock: Clock;
  /** `HEDGEHUG_OFF`: a signed request gets 200, or its challenge, and nothing else happens. */
  off: boolean;
  log: Log;
  /** Absent without a database, when only `HEDGEHUG_OFF`'s answers are given. */
  operations?: Operations;
  handlers: SlackHandlers;
}

export function createFrontDoor({ signingSecret, clock, off, log, operations, handlers }: FrontDoorOptions): Hono {
  const app = new Hono();
  const acknowledged = () => new Response(null, { status: 200 });
  const database = () => {
    if (!operations) throw new Error("Slack's request needs the database, and none is set");
    return operations;
  };

  // The body Slack signed; `undefined` when the request isn't Slack's, `null` when the app is off with no secret set.
  const signedBody = async (request: Request) => {
    if (signingSecret === undefined) {
      if (off) return null;
      throw new Error("SLACK_SIGNING_SECRET is not set");
    }
    return (await readSignedBody(request, signingSecret, clock.now())) ?? undefined;
  };

  // The receipt and every step's work commit together; a receipt is kept unless every step ignored the request.
  const takeIn = (name: string, receipt: Receipt, steps: Array<(ctx: MutationContext) => Promise<Handled>>) =>
    database().mutation(name, async (ctx) => {
      if (await isRedelivered(ctx.tx, receipt)) return;
      let taken = false;
      for (const step of steps) if ((await step(ctx)) !== "ignored") taken = true;
      if (taken) await recordReceipt(ctx, receipt);
    });

  app.post("/events", async (c) => {
    const body = await signedBody(c.req.raw);
    if (body === undefined) return c.body(null, 401);
    if (body === null) return acknowledged();
    const envelope = jsonOf(body) as { type?: unknown; challenge?: unknown } | null;
    if (envelope?.type === "url_verification") return c.json({ challenge: envelope.challenge });
    if (off || !isEventCallback(envelope)) return acknowledged();
    const [kind] = eventKinds.find(([, test]) => test(envelope.event))!;
    const handler = own(handlers.events, kind);
    if (handler) await takeIn(`slack.events.${kind}`, { workspace: envelope.team_id, eventId: envelope.event_id }, [(ctx) => handler(ctx, envelope)]);
    return acknowledged();
  });

  app.post("/interactivity", async (c) => {
    const body = await signedBody(c.req.raw);
    if (body === undefined) return c.body(null, 401);
    if (body === null || off) return acknowledged();
    const payload = payloadOf(body);
    if (isOptionsRequest(payload)) {
      const options = own(handlers.options, payload.action_id);
      return c.json({ options: options ? await database().query(`slack.options.${payload.action_id}`, (ctx) => options(ctx, payload)) : [] });
    }
    if (!isMemberClick(payload)) return acknowledged();
    const steps = clickKinds.flatMap((kind) => {
      const handler = own(handlers.clicks, kind);
      return handler ? [(ctx: MutationContext) => handler(ctx, payload)] : [];
    });
    if (steps.length > 0) await takeIn("slack.interactivity.click", { workspace: payload.team.id, eventId: payload.trigger_id }, steps);
    return acknowledged();
  });

  app.post("/commands", async (c) => {
    const arrivedAt = clock.now();
    const body = await signedBody(c.req.raw);
    if (body === undefined) return c.body(null, 401);
    if (body === null || off) return acknowledged();
    const command = new URLSearchParams(new TextDecoder().decode(body));
    for (const kind of commandKinds) {
      const answer = await own(handlers.commands, kind)?.({ operations: database(), arrivedAt }, command);
      if (answer !== undefined) return answer;
    }
    return acknowledged();
  });

  // A failure answers 500, so Slack delivers the event again; the log names the route, never the error's message.
  app.onError((error, c) => {
    log.error("slack request failed", { path: c.req.path, ...errorFields(error) });
    // Without the response the handler made so far: Hono's setter would keep its headers.
    c.res = undefined;
    return new Response(null, { status: 500 });
  });

  return app;
}

// A registered handler, never one the handlers object inherits: an options request for `toString` finds nothing.
function own<Handler>(handlers: Partial<Record<string, Handler>> | undefined, kind: string): Handler | undefined {
  return handlers !== undefined && Object.hasOwn(handlers, kind) ? handlers[kind] : undefined;
}

function jsonOf(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new SyntaxError("Slack sent a signed body that isn't JSON");
  }
}

function payloadOf(body: Uint8Array): unknown {
  const payload = new URLSearchParams(new TextDecoder().decode(body)).get("payload");
  return payload === null ? null : JSON.parse(payload);
}

const isText = (value: unknown): value is string => typeof value === "string";
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const idOf = (value: unknown) => (isObject(value) ? value.id : undefined);

function isEventCallback(envelope: unknown): envelope is EventCallback {
  return isObject(envelope) && envelope.type === "event_callback" && isText(envelope.team_id) && isText(envelope.event_id) && isObject(envelope.event) && isText(envelope.event.type);
}

function isOptionsRequest(payload: unknown): payload is OptionsRequest {
  return isObject(payload) && payload.type === "block_suggestion" && isText(payload.action_id) && isText(payload.value) && isText(idOf(payload.team)) && isText(idOf(payload.user));
}

// Today's member click: a button or select in the app's home or in a message, by a member of a workspace.
function isMemberClick(payload: unknown): payload is MemberClick {
  if (!isObject(payload) || payload.type !== "block_actions") return false;
  if (!isText(idOf(payload.team)) || !isText(idOf(payload.user)) || !isText(payload.trigger_id)) return false;
  return (isObject(payload.view) && payload.view.type === "home") || (isObject(payload.container) && payload.container.type === "message");
}
