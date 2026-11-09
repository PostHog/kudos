import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { FakePostHog, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { FakeSlack, rateLimitedFor, type SlackUser } from "../../testing/fakeSlack.ts";
import { SlackOpenId, type NextSignIn } from "../../testing/slackOpenId.ts";
import { productionFlags } from "./productionFlags.ts";

export type Fakes = { url: string; stop: () => Promise<void> };

// `flagsChanged` makes the app reload its flags from the fakes, when a journey changed them, before the change
// answers: a target whose app polls the fakes waits there until it has.
export type FakesOptions = { flagsChanged?: () => Promise<void> };

export async function startFakes({ flagsChanged = async () => {} }: FakesOptions = {}): Promise<Fakes> {
  const slack = new FakeSlack();
  // PostHog serves the flags production had, so journeys prove what its members saw.
  const postHog = new FakePostHog().withFlags(...productionFlags);
  const responses = new Map<string, unknown[]>();
  let state: State | undefined;
  const server = createServer((request, response) => void route(state!, request, response).catch((failure) => answer(response, new Response(String(failure), { status: 500 }))));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  // The fakes are Slack's OpenID issuer too, so a browser signs in with Slack as the member a journey names next.
  const openId = new SlackOpenId(url, { team: "", user: "" });
  state = { slack, postHog, openId, responses, flagsChanged };
  return { url, stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

type State = { slack: FakeSlack; postHog: FakePostHog; openId: SlackOpenId; responses: Map<string, unknown[]>; flagsChanged: () => Promise<void> };

async function route(state: State, request: IncomingMessage, response: ServerResponse) {
  const { slack, postHog, openId, responses } = state;
  const url = new URL(request.url ?? "/", "http://fakes");
  const body = await bodyOf(request);
  if (url.pathname.startsWith("/_control/")) return answer(response, await control(state, url, body));
  const asIssuer = openId.answer(url, { headers: new Headers(headersOf(request)), body });
  if (asIssuer !== undefined) return answer(response, await asIssuer);
  // A slash command's response URL: the app posts its answer to the command here.
  if (url.pathname.startsWith("/responses/")) {
    const reply = url.pathname.slice("/responses/".length);
    responses.set(reply, [...(responses.get(reply) ?? []), JSON.parse(body)]);
    return answer(response, new Response("ok"));
  }
  const init = { method: request.method ?? "GET", headers: headersOf(request), ...(body !== "" && { body }) };
  if (url.pathname.startsWith("/api/")) return answer(response, await slack.fetch(url, { ...init, ...(body !== "" && { body: jsonArguments(request, body) }) }));
  if (url.pathname === "/flags/definitions") return answer(response, await postHog.fetch(url, init));
  answer(response, await postHog.fetch(url, init).catch(() => new Response(null, { status: 200 })));
}

async function control({ slack, postHog, openId, responses, flagsChanged }: State, url: URL, body: string) {
  const query = (name: string) => url.searchParams.get(name) ?? "";
  switch (url.pathname) {
    case "/_control/members": {
      const { id, ...options } = JSON.parse(body) as SlackUser;
      slack.withMember(id, options);
      return Response.json({ ok: true });
    }
    case "/_control/channels": {
      const { id, ...options } = JSON.parse(body) as { id: string } & Parameters<FakeSlack["withChannel"]>[1];
      slack.withChannel(id, options);
      return Response.json({ ok: true });
    }
    case "/_control/rate-limits": {
      const { method, channel, seconds } = JSON.parse(body) as { method: string; channel: string; seconds: number };
      slack.answeringIn(method, channel, rateLimitedFor(seconds));
      return Response.json({ ok: true });
    }
    case "/_control/call-times":
      return Response.json(slack.timesOf(query("method"), (args) => args.channel === query("channel")));
    case "/_control/joined":
      return Response.json(slack.hasJoined(query("channel")));
    case "/_control/responses":
      return Response.json(responses.get(query("reply")) ?? []);
    case "/_control/flags":
      postHog.withFlags(...(JSON.parse(body) as FlagDefinition[]));
      await flagsChanged();
      return Response.json({ ok: true });
    case "/_control/next-sign-in":
      openId.signsInNext(JSON.parse(body) as NextSignIn);
      return Response.json({ ok: true });
    // What the app reported to PostHog as exceptions: the type and message of each, and where it was thrown.
    case "/_control/exceptions":
      return Response.json(postHog.events().filter((event) => event.event === "$exception").flatMap(({ properties }) => ((properties.$exception_list as ReportedException[] | undefined) ?? []).map(describe)));
    case "/_control/calls":
      return Response.json(url.searchParams.has("method") ? slack.callsTo(query("method")) : slack.calls);
    case "/_control/reactions":
      return Response.json(slack.reactionsOn(query("channel"), query("ts")));
    default:
      return new Response(`no control ${url.pathname}`, { status: 404 });
  }
}

type ReportedException = { type?: string; value?: string; stacktrace?: { frames?: Array<{ function?: string; filename?: string; lineno?: number }> } };

function describe({ type, value, stacktrace }: ReportedException) {
  const frames = (stacktrace?.frames ?? []).toReversed().map((frame) => `  at ${frame.function ?? "?"} (${frame.filename ?? "?"}:${frame.lineno ?? "?"})`);
  return [`${type}: ${value}`, ...frames].join("\n");
}

// Slack's Web API takes JSON or form-encoded arguments; the recording fake reads JSON, so form fields become JSON
// here. The fields Slack takes as JSON strings are parsed; every other field stays the text it was sent as.
const jsonFields = new Set(["blocks", "attachments", "view", "metadata", "unfurls", "profile", "user_auth_blocks"]);

function jsonArguments(request: IncomingMessage, body: string) {
  if (!(request.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded")) return body;
  const fields = Object.entries(Object.fromEntries(new URLSearchParams(body)));
  return JSON.stringify(Object.fromEntries(fields.map(([name, value]) => [name, jsonFields.has(name) ? JSON.parse(value) : value])));
}

function headersOf(request: IncomingMessage) {
  return Object.fromEntries(Object.entries(request.headers).flatMap(([name, value]) => (typeof value === "string" ? [[name, value]] : [])));
}

function bodyOf(request: IncomingMessage) {
  return new Promise<string>((resolve) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk)).on("end", () => resolve(text));
  });
}

async function answer(response: ServerResponse, reply: Response) {
  response.writeHead(reply.status, Object.fromEntries(reply.headers)).end(await reply.text());
}
