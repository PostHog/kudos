// The album's reply to a thoughtful kudos, delivered to Slack as today's convex/slack/albumReplies.ts delivers it.
// Convex has no test file for it. Here the delivery runs as the app runs it: its job, under its Convex name, started by
// the test backend's worker against the fake Slack. What the reply says is feedback/albumReplies.ts's `albumReply`,
// still a stub in the module map, so the test gives that reply through the function's own signature.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { networkFailure, rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import type { ThoughtfulPacksGrantedEvent } from "../bus/events.ts";
import type { AlbumReply } from "../feedback/albumReplies.ts";
import { serviceRegistry } from "../registry.ts";
import type { MemberId } from "../workspace/directory.ts";
import { deliverAlbumReplyJob } from "./albumReplies.ts";

const replies = vi.hoisted(() => ({ next: null as AlbumReply | null, asked: [] as unknown[] }));
vi.mock("../feedback/albumReplies.ts", async (original) => ({
  ...(await original()),
  albumReply: async (_ctx: unknown, { event }: { event: ThoughtfulPacksGrantedEvent }) => {
    replies.asked.push(event);
    return replies.next;
  },
}));

const now = Date.parse("2026-10-13T10:00:00Z");
const backend = useTestBackend({ now });
let t: TestBackend;

const giver = "m_alice" as MemberId;
const recipient = "m_bruno" as MemberId;
const event: ThoughtfulPacksGrantedEvent = {
  type: "thoughtfulPacksGranted",
  fact: "f1",
  workspace: "T1",
  giver,
  message: { workspace: "T1", conversation: "C_KUDOS", message: "1760349600.000100" },
  outcomes: [{ recipient, outcome: "new" }],
  at: now,
};

const bruno = { headline: "Bruno Castellane's pack", lines: ["A sticker for the album", "Two for <the> team"], hype: { picture: { url: "https://images.example/bruno.png", label: "Bruno's face" }, line: "Bruno's hype emoji is yours" } };
const wren = { headline: "Wren Halloway's pack", lines: [], hype: null };

function reply(fields: Partial<AlbumReply> = {}): AlbumReply {
  return {
    workspace: "T1",
    destination: { kind: "beside", conversation: "C_KUDOS", threadRoot: "1760349600.000100", user: "U_ALICE" },
    recipients: [bruno, wren],
    more: 2,
    waiting: "One more is on its way",
    buttons: [
      { label: "Open packs", url: "https://kudos.example/album/packs", id: "album-open-packs" },
      { label: "See Bruno", url: "https://kudos.example/album/people/m_bruno", id: `album-see-person:${recipient}` },
    ],
    gains: [{ text: "+5 XP" }],
    ...fields,
  };
}

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  t = backend();
  t.slack.withMember("U_ALICE");
  replies.next = reply();
  replies.asked = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function deliver() {
  await t.run((ctx) => ctx.jobs.enqueue(deliverAlbumReplyJob, { event }));
  await t.settle();
}

async function later(ms: number) {
  t.time.advance(ms);
  await t.settle();
}

const sectionText = (block: unknown) => (block as { text: { text: string } }).text.text;

describe("the album's reply goes beside the kudos, or as a direct message", () => {
  test("beside the kudos, only the giver sees it in the kudos thread: each recipient's headline and lines, their hype emoji with its picture, the rest counted, what's waiting, the buttons and the gains", async () => {
    await deliver();

    expect(replies.asked).toEqual([event]);
    const [posted, ...more] = t.slack.callsTo("chat.postEphemeral");
    expect(more).toEqual([]);
    expect(t.slack.callsTo("chat.postMessage")).toEqual([]);
    expect(posted).toMatchObject({ channel: "C_KUDOS", user: "U_ALICE", thread_ts: "1760349600.000100", text: "Bruno Castellane's pack · Wren Halloway's pack" });
    const blocks = posted!.blocks as Array<Record<string, unknown>>;
    expect(blocks.map(({ type }) => type)).toEqual(["section", "context", "section", "context", "context", "actions", "context"]);
    expect(sectionText(blocks[0])).toBe("*Bruno Castellane's pack*\nA sticker for the album\nTwo for &lt;the&gt; team");
    expect(blocks[1]).toEqual({ type: "context", elements: [{ type: "image", image_url: "https://images.example/bruno.png", alt_text: "Bruno's face" }, { type: "mrkdwn", text: "Bruno's hype emoji is yours" }] });
    expect(sectionText(blocks[2])).toBe("*Wren Halloway's pack*");
    expect(blocks[3]).toEqual({ type: "context", elements: [{ type: "mrkdwn", text: "And 2 more." }] });
    expect(blocks[4]).toEqual({ type: "context", elements: [{ type: "mrkdwn", text: "One more is on its way" }] });
    expect((blocks[5]!.elements as Array<{ action_id: string; url: string }>).map(({ action_id, url }) => [action_id, url])).toEqual([
      ["album-open-packs", "https://kudos.example/album/packs"],
      [`album-see-person:${recipient}`, "https://kudos.example/album/people/m_bruno"],
    ]);
    expect(blocks[6]).toEqual({ type: "context", elements: [{ type: "mrkdwn", text: "+5 XP" }] });
  });

  test("a reply with no one more, nothing waiting, no buttons and no gains is the recipients' blocks alone", async () => {
    replies.next = reply({ recipients: [wren], more: 0, waiting: null, buttons: [], gains: null });

    await deliver();

    expect((t.slack.callsTo("chat.postEphemeral")[0]!.blocks as unknown[]).length).toBe(1);
  });

  test("where Slack refuses the ephemeral there, it goes to the giver as a direct message, without unfurls", async () => {
    t.slack.answering("chat.postEphemeral", slackError("user_not_in_channel"));

    await deliver();

    expect(t.slack.callsTo("chat.postMessage")).toEqual([expect.objectContaining({ channel: "U_ALICE", unfurl_links: false, unfurl_media: false, blocks: expect.any(Array) })]);
  });

  test("a reply meant as a direct message goes straight to the giver", async () => {
    replies.next = reply({ destination: { kind: "dm", user: "U_ALICE" } });

    await deliver();

    expect(t.slack.callsTo("chat.postEphemeral")).toEqual([]);
    expect(t.slack.callsTo("chat.postMessage")).toEqual([expect.objectContaining({ channel: "U_ALICE", unfurl_links: false, unfurl_media: false })]);
  });

  test("no reply to give sends nothing", async () => {
    replies.next = null;

    await deliver();

    expect(replies.asked).toEqual([event]);
    expect([...t.slack.callsTo("chat.postEphemeral"), ...t.slack.callsTo("chat.postMessage")]).toEqual([]);
  });
});

describe("blocks Slack refuses", () => {
  test("refused for its blocks, a reply with hype pictures goes again once without them", async () => {
    t.slack.answering("chat.postEphemeral", slackError("invalid_blocks"));

    await deliver();

    const [refused, plain, ...more] = t.slack.callsTo("chat.postEphemeral");
    expect(more).toEqual([]);
    expect(JSON.stringify(refused!.blocks)).toContain('"type":"image"');
    expect(JSON.stringify(plain!.blocks)).not.toContain('"type":"image"');
    expect((plain!.blocks as Array<{ type: string; elements?: unknown[] }>)[1]).toEqual({ type: "context", elements: [{ type: "mrkdwn", text: "Bruno's hype emoji is yours" }] });
  });

  test("refused for its blocks, a reply without pictures isn't sent again", async () => {
    replies.next = reply({ recipients: [wren] });
    t.slack.answering("chat.postEphemeral", slackError("invalid_blocks"));

    await deliver();

    expect(t.slack.callsTo("chat.postEphemeral")).toHaveLength(1);
    expect(t.slack.callsTo("chat.postMessage")).toEqual([]);
  });
});

describe("only a rate limit sends it again, at most three tries", () => {
  test("rate limited, it waits out Slack's Retry-After and goes again, posted once", async () => {
    t.slack.answering("chat.postEphemeral", rateLimitedFor(20));
    await deliver();

    await later(19_000);
    expect(t.slack.callsTo("chat.postEphemeral"), "before the Retry-After").toHaveLength(1);
    await later(1_000);
    expect(t.slack.callsTo("chat.postEphemeral"), "at the Retry-After").toHaveLength(2);
    await later(60_000);
    expect(t.slack.callsTo("chat.postEphemeral"), "and no more").toHaveLength(2);
  });

  test("rate limited every time, it stops after its third try", async () => {
    t.slack.answering("chat.postEphemeral", rateLimitedFor(1), rateLimitedFor(1), rateLimitedFor(1), rateLimitedFor(1));
    await deliver();

    for (let step = 0; step < 5; step += 1) await later(1_000);

    expect(t.slack.callsTo("chat.postEphemeral")).toHaveLength(3);
  });

  test("a post that fails, or whose result nobody knows, is never sent again", async () => {
    t.slack.answering("chat.postEphemeral", slackError("fatal_error"));
    await deliver();
    await later(60_000);
    expect(t.slack.callsTo("chat.postEphemeral"), "after a failure").toHaveLength(1);

    t.slack.answering("chat.postEphemeral", networkFailure);
    await deliver();
    await later(60_000);
    expect(t.slack.callsTo("chat.postEphemeral"), "after an uncertain post").toHaveLength(2);
  });
});

test("the service runs the delivery under its Convex name", () => {
  expect(serviceRegistry.jobs.get("slack.albumReplies.deliverAlbumReply")).toBe(deliverAlbumReplyJob);
});
