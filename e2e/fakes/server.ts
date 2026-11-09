import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { FakePostHog, type FlagDefinition } from "../../testing/fakePostHog.ts";
import { FakeSlack, type SlackUser } from "../../testing/fakeSlack.ts";

export type Fakes = { url: string; stop: () => Promise<void> };

export async function startFakes(): Promise<Fakes> {
  const slack = new FakeSlack();
  const postHog = new FakePostHog();
  const server = createServer((request, response) => void route(slack, postHog, request, response).catch((failure) => answer(response, new Response(String(failure), { status: 500 }))));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function route(slack: FakeSlack, postHog: FakePostHog, request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://fakes");
  const body = await bodyOf(request);
  if (url.pathname.startsWith("/_control/")) return answer(response, control(slack, postHog, url, body));
  const init = { method: request.method ?? "GET", headers: headersOf(request), ...(body !== "" && { body }) };
  if (url.pathname.startsWith("/api/")) return answer(response, await slack.fetch(url, { ...init, ...(body !== "" && { body: jsonArguments(request, body) }) }));
  if (url.pathname === "/flags/definitions") return answer(response, await postHog.fetch(url, init));
  answer(response, await postHog.fetch(url, init).catch(() => new Response(null, { status: 200 })));
}

function control(slack: FakeSlack, postHog: FakePostHog, url: URL, body: string) {
  const query = (name: string) => url.searchParams.get(name) ?? "";
  switch (url.pathname) {
    case "/_control/members": {
      const { id, ...options } = JSON.parse(body) as SlackUser;
      slack.withMember(id, options);
      return Response.json({ ok: true });
    }
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
// here, with the JSON-valued ones (blocks, view and the like) parsed.
function jsonArguments(request: IncomingMessage, body: string) {
  if (!(request.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded")) return body;
  const fields = Object.fromEntries(new URLSearchParams(body));
  return JSON.stringify(Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, /^[[{]/.test(value) ? JSON.parse(value) : value])));
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
