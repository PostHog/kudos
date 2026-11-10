// POST /slack/events, from outside: Slack's signature, receipts, redeliveries and the message handler, through the
// front door as Slack calls it. Today's convex/slack/events.test.ts. A kudos message goes through the parser's hooks
// (S7's owned store emoji, S9's earned album emoji) and waits on the directory's lookup (S3) before it gives; giving
// replies privately (S5) and places the message in the spotlight (S11). A request the front door refuses, an envelope
// it only acknowledges and ordinary chat reach none of them.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { everythingStored, kudosReceived, sendEvent } from "../../testing/messageFlows.ts";
import { signedRequest, type SigningOptions } from "../../testing/signedSlack.ts";
import { waitsOn } from "../../testing/waiting.ts";
import { receiveMessage } from "./events.ts";
import type { EventCallback } from "./frontDoor.ts";

const now = new Date("2026-10-13T10:00:00Z");
const backend = useTestBackend({ now: now.getTime() });

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function withSlack() {
  const t = backend();
  t.slack.withMember("U1").withMember("U2");
  return t;
}

describe("POST /slack/events", () => {
  waitsOn(["S3", "S5", "S7", "S9", "S11"], "R48 R49: a correctly signed event gets 200, one receipt and its kudos", async () => {
    const t = withSlack();

    const response = await sendEvent(t, eventCallback("T1", "Ev1"));
    await t.settle();

    expect(response.status).toBe(200);
    expect(await receiptsIn(t)).toEqual([{ workspace: "T1", eventId: "Ev1" }]);
    expect(await kudosReceived(t, "U2")).toBe(1);
  });

  describe("R48: a request Slack did not sign gets 401 and records nothing", () => {
    const cases: Array<[string, () => Promise<RequestInit>]> = [
      ["signed with another secret", () => signed(eventCallback("T1", "Ev1"), { secret: "someone-elses-secret" })],
      ["unsigned", async () => ({ method: "POST", body: eventCallback("T1", "Ev1") })],
      ["with a body changed after signing", async () => ({ ...(await signed(eventCallback("T1", "Ev1"))), body: eventCallback("T1", "Ev2") })],
      ["with a byte order mark added after signing", async () => ({ ...(await signed(eventCallback("T1", "Ev1"))), body: withByteOrderMark(eventCallback("T1", "Ev1")) })],
      ["signed more than 5 minutes ago", () => signed(eventCallback("T1", "Ev1"), { signedAt: minutesBefore(now, 6) })],
      ["signed more than 5 minutes ahead", () => signed(eventCallback("T1", "Ev1"), { signedAt: minutesBefore(now, -6) })],
      ["unsigned url_verification", async () => ({ method: "POST", body: JSON.stringify({ type: "url_verification", challenge: "c-123" }) })],
    ];
    for (const [name, request] of cases) {
      test(name, async () => {
        const t = withSlack();

        const response = await t.app.request("/slack/events", await request());
        await t.settle();

        expect(response.status).toBe(401);
        expect(await everythingStored(t)).toEqual([]);
        expect(t.slack.calls).toEqual([]);
      });
    }
  });

  waitsOn(["S3", "S7", "S9"], "R48: a request signed 4 minutes ago is still accepted", async () => {
    const t = withSlack();

    const response = await sendEvent(t, eventCallback("T1", "Ev1"), { at: minutesBefore(now, 4).getTime() });

    expect(response.status).toBe(200);
    expect(await receiptsIn(t)).toEqual([{ workspace: "T1", eventId: "Ev1" }]);
  });

  waitsOn(["S3", "S5", "S7", "S9", "S11"], "R49: a redelivery of the same team_id and event_id gets 200 and runs nothing", async () => {
    const t = withSlack();
    await sendEvent(t, eventCallback("T1", "Ev1"));

    const redelivery = await sendEvent(t, eventCallback("T1", "Ev1"));
    await t.settle();

    expect(redelivery.status).toBe(200);
    expect(await receiptsIn(t)).toEqual([{ workspace: "T1", eventId: "Ev1" }]);
    expect(await kudosReceived(t, "U2")).toBe(1);
    expect(t.slack.callsTo("reactions.add")).toHaveLength(1);
  });

  waitsOn(["S3", "S7", "S9"], "R49: the same event_id from another workspace is a different event", async () => {
    const t = withSlack();
    await sendEvent(t, eventCallback("T1", "Ev1"));

    await sendEvent(t, eventCallback("T2", "Ev1"));

    expect(await receiptsIn(t)).toEqual([
      { workspace: "T1", eventId: "Ev1" },
      { workspace: "T2", eventId: "Ev1" },
    ]);
  });

  test("R49 AT11: the receipt and the processing step share one transaction, and the failure is rethrown without its message", async () => {
    const t = withSlack();
    await withAuthorTwiceInTheDirectory(t);

    const response = await sendEvent(t, eventCallback("T1", "Ev1"));

    expect(response.status, "Slack's answer, so it delivers again").toBe(500);
    expect(await receiptsIn(t), "the receipts").toEqual([]);
    expect(t.logs.filter(({ level }) => level === "error"), "what the service logged: the error's class, never its message").toEqual([
      { level: "error", message: "operation failed", fields: { kind: "mutation", operation: "slack.events.message", error: "Error" } },
      { level: "error", message: "slack request failed", fields: { path: "/slack/events", error: "Error" } },
    ]);
    await expect(t.run((ctx) => receiveMessage(ctx, JSON.parse(eventCallback("T1", "Ev1")) as EventCallback)), "the handler's failure").rejects.toThrow(
      "message withheld: it may quote kudos text (Error)",
    );
  });

  test("an envelope of another type, such as app_rate_limited, is acknowledged and records nothing", async () => {
    const t = withSlack();

    const response = await t.send("/events", JSON.stringify({ type: "app_rate_limited", team_id: "T1", minute_rate_limited: 1760349600 }));

    expect(response.status).toBe(200);
    expect(await everythingStored(t)).toEqual([]);
  });

  test("R2: a new message without a mention or an emoji is acknowledged before any mutation and records nothing", async () => {
    const t = withSlack();
    const chat = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event_id: "Ev1",
      event: { type: "message", channel: "C1", channel_type: "channel", user: "U1", ts: "1760349600.000100", text: "lunch?", blocks: [] },
    });

    const response = await sendEvent(t, chat);
    await t.settle();

    expect(response.status).toBe(200);
    expect(await everythingStored(t)).toEqual([]);
    expect(t.slack.calls).toEqual([]);
  });

  test("url_verification returns the challenge", async () => {
    const t = withSlack();

    const response = await t.send("/events", JSON.stringify({ type: "url_verification", challenge: "c-123", token: "legacy" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: "c-123" });
    expect(await receiptsIn(t)).toEqual([]);
  });
});

function eventCallback(teamId: string, eventId: string) {
  return JSON.stringify({
    type: "event_callback",
    team_id: teamId,
    event_id: eventId,
    event: {
      type: "message",
      channel: "C1",
      channel_type: "channel",
      user: "U1",
      ts: "1760349600.000100",
      text: "thanks <@U2> :taco:",
      blocks: [{ type: "rich_text", elements: [{ type: "rich_text_section", elements: [{ type: "user", user_id: "U2" }, { type: "emoji", name: "taco" }] }] }],
    },
  });
}

/** Signed as Slack signs, by the app's clock unless it says. */
function signed(body: string, options: SigningOptions = {}) {
  return signedRequest(body, { signedAt: now, ...options });
}

function withByteOrderMark(body: string) {
  return new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)]);
}

function minutesBefore(date: Date, minutes: number) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

async function withAuthorTwiceInTheDirectory(t: TestBackend) {
  for (let copy = 0; copy < 2; copy += 1) await t.seed.insert("members", { workspace: "T1", user: "U1", kind: "member" });
}

async function receiptsIn(t: TestBackend) {
  const receipts = await t.seed.all("slackReceipts");
  return receipts.map(({ workspace, eventId }) => ({ workspace, eventId }));
}
