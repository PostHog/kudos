// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { signInPath, startEdge, type Edge } from "./edge.ts";

// The service stand-in answers with what reached it, so a test sees what the edge forwarded.
type Seen = { method: string; path: string; headers: Record<string, string | string[] | undefined>; body: string };

let service: Server;
let edge: Edge;
beforeEach(async () => {
  service = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const seen: Seen = { method: request.method!, path: request.url!, headers: request.headers, body: Buffer.concat(chunks).toString() };
      response.writeHead(201, { "content-type": "application/json", "x-from-service": "yes" }).end(JSON.stringify(seen));
    });
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  edge = await startEdge(`http://127.0.0.1:${(service.address() as AddressInfo).port}`);
});
afterEach(async () => {
  await edge.stop();
  await new Promise((resolve) => service.close(resolve));
});

async function through(path: string, init: RequestInit = {}) {
  const answer = await fetch(`${edge.url}${path}`, init);
  return { answer, seen: (await answer.json()) as Seen };
}

const forged = { "x-auth-request-email": "forged@example.com", "x-auth-request-user": "forged", x_auth_request_email: "forged@example.com" };

async function signIn(email: string, to = "/") {
  const answer = await fetch(`${edge.url}${signInPath}?${new URLSearchParams({ email, to })}`, { redirect: "manual" });
  expect(answer.status, "the sign-in's answer").toBe(302);
  expect(answer.headers.get("location"), "where the sign-in sends the browser").toBe(to);
  return answer.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

describe("the edge stand-in in front of the rewrite", () => {
  test("forwards every request to the service as it came, and the service's answer as it went", async () => {
    const { answer, seen } = await through("/slack/events?retry=1", { method: "POST", headers: { "content-type": "text/plain", "x-slack-signature": "v0=abc" }, body: "the body" });

    expect(answer.status).toBe(201);
    expect(answer.headers.get("x-from-service")).toBe("yes");
    expect(seen).toMatchObject({ method: "POST", path: "/slack/events?retry=1", body: "the body", headers: { "x-slack-signature": "v0=abc" } });
  });

  test.each(["/healthz", "/slack/commands", "/me"])("drops the identity headers a client sends on %s when nobody signed in", async (path) => {
    const { seen } = await through(path, { headers: forged });

    expect(Object.keys(seen.headers).filter((name) => /^x[-_]auth[-_]request/.test(name))).toEqual([]);
  });

  test("passes the signed-in member's email on gated paths, in place of any a client sends", async () => {
    const cookie = await signIn("member@example.com", "/me");

    const { seen } = await through("/me", { headers: { ...forged, cookie } });

    expect(seen.headers["x-auth-request-email"]).toBe("member@example.com");
    expect(seen.headers["x-auth-request-user"]).toBeUndefined();
    expect(seen.headers.x_auth_request_email).toBeUndefined();
  });

  test.each(["/healthz", "/slack/events", "/slack/interactivity", "/slack/commands", "/cards/abc", "/admin/load", "/testing/time"])("passes no email on the public path %s, even for a signed-in member", async (path) => {
    const cookie = await signIn("member@example.com");

    const { seen } = await through(path, { headers: { ...forged, cookie } });

    expect(Object.keys(seen.headers).filter((name) => /^x[-_]auth[-_]request/.test(name))).toEqual([]);
  });

  test("sends the browser only to a path of the app after signing in", async () => {
    const answer = await fetch(`${edge.url}${signInPath}?${new URLSearchParams({ email: "member@example.com", to: "//elsewhere.example" })}`, { redirect: "manual" });

    expect(answer.headers.get("location")).toBe("/");
  });
});
