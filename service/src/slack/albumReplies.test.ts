// The album's reply to a thoughtful kudos, delivered to Slack as today's convex/slack/albumReplies.ts delivers it.
// Convex has no test file for it. Here the delivery runs as the app runs it: its job, under its Convex name, started by
// the test backend's worker against the fake Slack, and each test reads what Slack accepted and so shows the giver: a
// post Slack refused, or never answered, shows nothing. What the reply says is feedback/albumReplies.ts's
// `albumReply`, still a stub in the module map, so the test gives the reply each grant gets, by its fact, through the
// function's own signature.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { networkFailure, rateLimitedFor, slackError } from "../../testing/fakeSlack.ts";
import type { ThoughtfulPacksGrantedEvent } from "../bus/events.ts";
import type { AlbumReply } from "../feedback/albumReplies.ts";
import { serviceRegistry } from "../registry.ts";
import type { MemberId } from "../workspace/directory.ts";
import { deliverAlbumReplyJob } from "./albumReplies.ts";

// The reply each grant gets, by the event's fact; a grant with none set gets no reply.
const replies = vi.hoisted(() => ({ of: new Map<string, AlbumReply>() }));
vi.mock("../feedback/albumReplies.ts", async (original) => ({
  ...(await original()),
  albumReply: async (_ctx: unknown, { event }: { event: ThoughtfulPacksGrantedEvent }) => replies.of.get(event.fact ?? "") ?? null,
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

type Shown = { method: string; args: Record<string, unknown> };
let shown: Shown[];

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  t = backend();
  t.slack.withMember("U_ALICE");
  replies.of.clear();
  replies.of.set("f1", reply());
  shown = [];
  // What Slack accepted: a post whose answer is ok, as Slack answered it.
  const toSlack = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const answer = await toSlack(input, init);
    const url = new URL(input instanceof Request ? input.url : input);
    const method = url.pathname.split("/").pop() ?? "";
    if (method.startsWith("chat.post") && ((await answer.clone().json().catch(() => null)) as { ok?: boolean } | null)?.ok === true) {
      shown.push({ method, args: init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(url.searchParams) });
    }
    return answer;
  });
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

const ephemerals = () => shown.filter(({ method }) => method === "chat.postEphemeral").map(({ args }) => args);
const directMessages = () => shown.filter(({ method }) => method === "chat.postMessage").map(({ args }) => args);

const sectionText = (block: unknown) => (block as { text: { text: string } }).text.text;

describe("the album's reply goes beside the kudos, or as a direct message", () => {
  test("beside the kudos, only the giver sees it in the kudos thread: each recipient's headline and lines, their hype emoji with its picture, the rest counted, what's waiting, the buttons and the gains", async () => {
    await deliver();

    const [posted, ...more] = ephemerals();
    expect(more).toEqual([]);
    expect(directMessages()).toEqual([]);
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
    replies.of.set("f1", reply({ recipients: [wren], more: 0, waiting: null, buttons: [], gains: null }));

    await deliver();

    expect(ephemerals().map(({ blocks }) => (blocks as unknown[]).length)).toEqual([1]);
  });

  test("where Slack refuses the ephemeral there, it goes to the giver as a direct message, without unfurls", async () => {
    t.slack.answering("chat.postEphemeral", slackError("user_not_in_channel"));

    await deliver();

    expect(ephemerals()).toEqual([]);
    expect(directMessages()).toEqual([expect.objectContaining({ channel: "U_ALICE", unfurl_links: false, unfurl_media: false, text: "Bruno Castellane's pack · Wren Halloway's pack", blocks: expect.any(Array) })]);
    expect(t.slack.messagesIn("U_ALICE").map(({ text }) => text)).toEqual(["Bruno Castellane's pack · Wren Halloway's pack"]);
  });

  test("a reply meant as a direct message goes straight to the giver", async () => {
    replies.of.set("f1", reply({ destination: { kind: "dm", user: "U_ALICE" } }));

    await deliver();

    expect(ephemerals()).toEqual([]);
    expect(directMessages()).toEqual([expect.objectContaining({ channel: "U_ALICE", unfurl_links: false, unfurl_media: false })]);
  });

  test("a grant with no reply to give shows nothing, and the reply a grant gets is its own", async () => {
    replies.of.clear();
    replies.of.set("another grant", reply());

    await deliver();

    expect(shown).toEqual([]);
  });
});

describe("blocks Slack refuses", () => {
  test("refused for its blocks, a reply with hype pictures goes again once without them", async () => {
    t.slack.answering("chat.postEphemeral", slackError("invalid_blocks"));

    await deliver();

    const [plain, ...more] = ephemerals();
    expect(more).toEqual([]);
    expect(JSON.stringify(plain!.blocks)).not.toContain('"type":"image"');
    expect((plain!.blocks as Array<{ type: string; elements?: unknown[] }>)[1]).toEqual({ type: "context", elements: [{ type: "mrkdwn", text: "Bruno's hype emoji is yours" }] });
  });

  test("refused for its blocks, a reply without pictures isn't sent again", async () => {
    replies.of.set("f1", reply({ recipients: [wren] }));
    t.slack.answering("chat.postEphemeral", slackError("invalid_blocks"));

    await deliver();
    await later(60_000);

    expect(shown, "a second post, answered ok, would show").toEqual([]);
  });
});

describe("only a rate limit sends it again, at most three tries", () => {
  test("rate limited, it waits out Slack's Retry-After and goes again, posted once", async () => {
    t.slack.answering("chat.postEphemeral", rateLimitedFor(20));
    await deliver();

    await later(19_000);
    expect(ephemerals(), "before the Retry-After").toEqual([]);
    await later(1_000);
    expect(ephemerals(), "at the Retry-After").toHaveLength(1);
    await later(60_000);
    expect(ephemerals(), "and no more").toHaveLength(1);
  });

  test("rate limited every time, it stops after its third try", async () => {
    t.slack.answering("chat.postEphemeral", rateLimitedFor(1), rateLimitedFor(1), rateLimitedFor(1));
    await deliver();

    for (let step = 0; step < 5; step += 1) await later(1_000);

    expect(shown, "a fourth try, answered ok, would show").toEqual([]);
  });

  test("a post that fails, or whose result nobody knows, is never sent again", async () => {
    t.slack.answering("chat.postEphemeral", slackError("fatal_error"));
    await deliver();
    await later(60_000);
    expect(shown, "after a failure: a second post, answered ok, would show").toEqual([]);

    t.slack.answering("chat.postEphemeral", networkFailure);
    await deliver();
    await later(60_000);
    expect(shown, "after an uncertain post: a second post, answered ok, would show").toEqual([]);
  });
});

test("the service runs the delivery under its Convex name", () => {
  expect(serviceRegistry.jobs.get("slack.albumReplies.deliverAlbumReply")).toBe(deliverAlbumReplyJob);
});
