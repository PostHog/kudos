// @vitest-environment node
import { createServer, get, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
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

  test.each(["//elsewhere.example", "/\\elsewhere.example", "/\t/elsewhere.example", "/\n/elsewhere.example", "https://elsewhere.example/", " /x"])(
    "sends the browser only to a path of the app after signing in, never to %j",
    async (to) => {
      const answer = await fetch(`${edge.url}${signInPath}?${new URLSearchParams({ email: "member@example.com", to })}`, { redirect: "manual" });

      expect(answer.status).toBe(302);
      expect(answer.headers.get("location")).toBe("/");
      expect(new URL(answer.headers.get("location")!, edge.url).origin, "where a browser goes").toBe(edge.url);
    },
  );

  // The service's server resolves dot segments and its router decodes the path, so the edge judges the path the
  // service routes, not the spelling a client sent.
  test.each(["/%68ealthz", "/slack/ev%65nts", "/admin/lo%61d", "/me/../healthz", "/me/%2e%2e/healthz"])(
    "passes no email on %s, which the service routes to a public path",
    async (path) => {
      const cookie = await signIn("member@example.com");

      const { seen } = await raw(path, cookie);

      expect(seen.headers["x-auth-request-email"]).toBeUndefined();
    },
  );

  test.each(["/cards/../me", "/cards/%2e%2e/me", "/slack%2fevents"])("passes the email on %s, which the service routes to a gated path", async (path) => {
    const cookie = await signIn("member@example.com");

    const { seen } = await raw(path, cookie);

    expect(seen.headers["x-auth-request-email"]).toBe("member@example.com");
  });

  test.each(["http://elsewhere.example/healthz", "//healthz/me", "/me%"])("refuses the request target %s, which the service would read otherwise", async (target) => {
    const answer = await rawAnswer(target, "edge-email=member%40example.com");

    expect(answer.status).toBe(400);
  });

  test.each(["%", "%0d%0aX-Injected:%20yes", "not-an-email", "a@b%0aX-Injected:%20yes"])(
    "treats the malformed cookie %s as nobody signed in, and keeps serving",
    async (value) => {
      const { answer, seen } = await through("/me", { headers: { cookie: `edge-email=${value}` } });

      expect(answer.status).toBe(201);
      expect(seen.headers["x-auth-request-email"]).toBeUndefined();
      expect(seen.headers["x-injected"]).toBeUndefined();
      expect((await through("/healthz")).answer.status, "the next request").toBe(201);
    },
  );

  test.each(["", "not-an-email", "a@b\r\nX-Injected: yes"])("refuses to sign in as %j, and keeps serving", async (email) => {
    const answer = await fetch(`${edge.url}${signInPath}?${new URLSearchParams({ email, to: "/\n" })}`, { redirect: "manual" });

    expect(answer.status).toBe(400);
    expect(answer.headers.getSetCookie()).toEqual([]);
    expect((await through("/healthz")).answer.status, "the next request").toBe(201);
  });

  test("drops the forwarded request when its client goes away, so the service stops waiting for its body", async () => {
    const closed = new Promise<void>((resolve) => service.once("request", (request) => request.once("close", () => resolve())));
    const client = connect(Number(new URL(edge.url).port), "127.0.0.1");
    await new Promise((resolve) => client.once("connect", resolve));
    client.write("POST /me HTTP/1.1\r\nHost: edge\r\nContent-Length: 100000\r\n\r\n{");

    await new Promise((resolve) => setTimeout(resolve, 100));
    client.destroy();

    await expect(Promise.race([closed.then(() => "closed"), new Promise((resolve) => setTimeout(() => resolve("still waiting"), 2_000))])).resolves.toBe("closed");
  });
});

// Sends `target` exactly as written, which `fetch` would normalize first.
function rawAnswer(target: string, cookie?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const sent = get({ host: "127.0.0.1", port: Number(new URL(edge.url).port), path: target, headers: cookie === undefined ? {} : { cookie } }, (answer) => {
      let body = "";
      answer.on("data", (chunk: Buffer) => (body += chunk.toString()));
      answer.on("end", () => resolve({ status: answer.statusCode!, body }));
    });
    sent.on("error", reject);
  });
}

async function raw(target: string, cookie: string): Promise<{ seen: Seen }> {
  const answer = await rawAnswer(target, cookie);
  expect(answer.status, "the edge's answer").toBe(201);
  return { seen: JSON.parse(answer.body) as Seen };
}
