import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { FakePostHog, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { FakeSlack, rateLimitedFor, type SlackUser } from "../../testing/fakeSlack.ts";

export type Fakes = { url: string; stop: () => Promise<void> };

export async function startFakes(): Promise<Fakes> {
  const slack = new FakeSlack();
  const postHog = new FakePostHog();
  const responses = new Map<string, unknown[]>();
  const server = createServer((request, response) => void route({ slack, postHog, responses }, request, response).catch((failure) => answer(response, new Response(String(failure), { status: 500 }))));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

type State = { slack: FakeSlack; postHog: FakePostHog; responses: Map<string, unknown[]> };

async function route({ slack, postHog, responses }: State, request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://fakes");
  const body = await bodyOf(request);
  if (url.pathname.startsWith("/_control/")) return answer(response, control({ slack, postHog, responses }, url, body));
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

function control({ slack, postHog, responses }: State, url: URL, body: string) {
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
    case "/_control/responses":
      return Response.json(responses.get(query("reply")) ?? []);
    case "/_control/flags":
      postHog.withFlags(...(JSON.parse(body) as FlagDefinition[]));
      return Response.json({ ok: true });
    case "/_control/calls":
      return Response.json(slack.callsTo(query("method")));
    case "/_control/reactions":
      return Response.json(slack.reactionsOn(query("channel"), query("ts")));
    default:
      return new Response(`no control ${url.pathname}`, { status: 404 });
  }
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
