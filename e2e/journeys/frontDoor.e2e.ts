import { createHmac } from "node:crypto";
import { targetOf } from "../target.ts";
import { expect, test } from "../test.ts";

// Slack's front door, which every build of HedgeHug keeps: Slack's URL check, and its signature on every request.
// That an event Slack delivers twice is taken in once is giving.e2e.ts's "an event Slack delivers twice gives its
// kudos once".

const routes = ["/slack/events", "/slack/interactivity", "/slack/commands"];

function post(path: string, body: string, { secret = targetOf().signingSecret, at, signed = true }: { secret?: string; at: number; signed?: boolean }) {
  const timestamp = Math.floor(at / 1000).toString();
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  const headers: Record<string, string> = signed ? { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": signature } : { "content-type": "application/json" };
  return fetch(`${targetOf().appUrl}${path}`, { method: "POST", headers, body });
}

test("Slack's URL check gets its challenge back", { tags: ["@sandbox"] }, async ({ slack }) => {
  const challenge = `challenge-${Math.random().toString(36).slice(2)}`;

  const answer = await post("/slack/events", JSON.stringify({ token: "unused", challenge, type: "url_verification" }), { at: await slack.now() });

  expect(answer.status).toBe(200);
  expect(await answer.json()).toEqual({ challenge });
});

test("a request Slack didn't sign is refused on every route", { tags: ["@sandbox"] }, async ({ slack }) => {
  const now = await slack.now();
  const body = JSON.stringify({ token: "unused", challenge: "not-for-you", type: "url_verification" });

  for (const path of routes) {
    expect((await post(path, body, { at: now, secret: "not-the-signing-secret" })).status, `${path}, another secret`).toBe(401);
    expect((await post(path, body, { at: now - 10 * 60_000 })).status, `${path}, signed ten minutes ago`).toBe(401);
    expect((await post(path, body, { at: now, signed: false })).status, `${path}, no signature`).toBe(401);
  }
});
