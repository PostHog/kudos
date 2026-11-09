// The fetch-level fakes the service's tests share with today's: each answers a call made through `fetch`.
import { afterEach, describe, expect, test, vi } from "vitest";
import { FakePostHog, postHogHost, projectToken, routedFetch } from "./fakePostHog.ts";
import { FakeSlack } from "./fakeSlack.ts";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const slack = new FakeSlack().withMember("U_GIVER", { real_name: "A Giver" });
  const postHog = new FakePostHog();
  vi.stubGlobal("fetch", routedFetch(postHog, slack.fetch));
  return { slack, postHog };
}

describe("the Slack fake", () => {
  test("answers a Web API call made through fetch as Slack would, and records it", async () => {
    const { slack } = stubFetch();

    const found = await fetch("https://slack.com/api/users.info?user=U_GIVER");
    const posted = await fetch("https://slack.com/api/chat.postMessage", { method: "POST", body: JSON.stringify({ channel: "C_GENERAL", text: "thanks" }) });

    expect(await found.json(), "users.info").toMatchObject({ ok: true, user: { id: "U_GIVER", real_name: "A Giver" } });
    expect(await posted.json(), "chat.postMessage").toMatchObject({ ok: true, channel: "C_GENERAL" });
    expect(slack.messagesIn("C_GENERAL").map(({ text }) => text), "what the channel shows").toEqual(["thanks"]);
    expect(slack.calls.map(({ method }) => method), "the calls it heard").toEqual(["users.info", "chat.postMessage"]);
  });

  test("answers a scripted failure instead, once", async () => {
    const { slack } = stubFetch();
    slack.answering("users.info", () => Response.json({ ok: false, error: "ratelimited" }, { status: 429 }));

    expect((await fetch("https://slack.com/api/users.info?user=U_GIVER")).status, "the scripted answer").toBe(429);
    expect((await fetch("https://slack.com/api/users.info?user=U_GIVER")).status, "then Slack's own").toBe(200);
  });
});

describe("the PostHog fake", () => {
  test("takes a capture batch made through fetch and keeps its events", async () => {
    const { postHog } = stubFetch();
    const event = { event: "kudos given", distinct_id: "member-1", uuid: "00000000-0000-4000-8000-000000000001", timestamp: "2026-01-05T09:00:00.000Z", properties: {} };

    const response = await fetch(`${postHogHost}/batch/`, { method: "POST", body: JSON.stringify({ api_key: projectToken, batch: [event] }) });

    expect(response.status, "the batch's answer").toBe(200);
    expect(postHog.productEvents().map(({ event: name }) => name), "the events it kept").toEqual(["kudos given"]);
  });
});
