import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeSlack } from "../../testing/fakeSlack";
import { flagsFromPostHog, onForEmails, postHogDeciding } from "../../testing/flags";
import { routedFetch, type FakePostHog } from "../../testing/fakePostHog";
import { signedRequest, signingSecret } from "../../testing/signedSlack";
import { edit, everythingStored, memberChanged, post, settle, setWorkspaceSettings, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, mention, messageEvent, quote, section, text, tonedEmoji, type RichElement } from "../../testing/slackMessages";

const now = new Date("2026-11-05T10:00:00Z");
const gatewayUrl = "https://gateway.example.test/v1/classify";
const maintainer = { user: "U_ALICE", name: "Alice Moreau", email: "maintainer@example.com" };
const bob = { user: "U_BOB", name: "Bob Okafor", email: "bob@example.com" };
const carol = { user: "U_CAROL", name: "Carol Diaz", email: "carol@example.com" };
const nudge = "You can edit this message and add :taco: to give a kudos and collect a hoggie.";
const thanksBob: RichElement[] = [section(text("Thanks "), mention("U_BOB"), text(" for fixing the build this morning!"))];

type GatewayAnswer = (request: { body: Record<string, unknown>; headers: Headers; signal: AbortSignal | null }) => Promise<Response> | Response;

class FakeGateway {
  readonly requests: { body: Record<string, unknown>; headers: Headers; signal: AbortSignal | null }[] = [];
  private answer: GatewayAnswer = () => thanksProbability(0.996);

  answering(answer: GatewayAnswer) {
    this.answer = answer;
    return this;
  }

  owns(url: URL) {
    return url.href === gatewayUrl;
  }

  readonly fetch = async (_: string | URL | Request, init?: RequestInit) => {
    const request = { body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: new Headers(init?.headers), signal: init?.signal ?? null };
    this.requests.push(request);
    return this.answer(request);
  };
}

const thanksProbability = (probability: number) => Response.json({ model: "a-model-0.1", answers: { thanks: { type: "noul", noul: probability } } });

let slack: FakeSlack;
let postHog: FakePostHog;
let gateway: FakeGateway;

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  vi.stubEnv("AI_GATEWAY_URL", gatewayUrl);
  vi.stubEnv("AI_GATEWAY_KEY", "gateway-secret");
  vi.stubEnv("AI_GATEWAY_MODEL", "a-model");
  slack = new FakeSlack();
  for (const person of [maintainer, bob, carol]) slack.withMember(person.user, { profile: { display_name: person.name, email: person.email } });
  postHog = postHogDeciding();
  gateway = new FakeGateway();
  const otherwise = routedFetch(postHog, slack.fetch);
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => (gateway.owns(new URL(input instanceof Request ? input.url : input)) ? gateway.fetch(input, init) : otherwise(input, init)));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a thank-you that gives no kudos gets one private nudge to its author", () => {
  test("the maintainer thanking Bob without the kudos emoji gets one ephemeral beside the message, naming the workspace's kudos emoji", async () => {
    const t = await workspace();

    const response = await post(t, thanksBob, { user: maintainer.user });
    await settle(t);

    expect(response.status).toBe(200);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([{ channel: "C1", user: maintainer.user, text: nudge }]);
    expect(slack.callsTo("chat.postMessage")).toEqual([]);
  });

  test("a thank-you in a thread is nudged in that thread", async () => {
    const t = await workspace();

    await post(t, thanksBob, { user: maintainer.user, ts: "1762336800.000200", threadTs: "1762336000.000100" });
    await settle(t);

    expect(slack.callsTo("chat.postEphemeral")).toEqual([{ channel: "C1", user: maintainer.user, text: nudge, thread_ts: "1762336000.000100" }]);
  });

  test("asks the gateway in privacy mode, with the message only in state and its mentions as @teammate", async () => {
    const t = await workspace();

    await post(t, [section(text("Huge thanks to "), mention("U_BOB"), text(" and "), mention("U_CAROL"), text(" for the release "), emoji("rocket"))], { user: maintainer.user });
    await settle(t);

    expect(gateway.requests).toHaveLength(1);
    const [request] = gateway.requests;
    expect(request!.headers.get("Authorization")).toBe("Bearer gateway-secret");
    expect(request!.headers.get("X-PostHog-Privacy-Mode")).toBe("true");
    expect(request!.signal).not.toBeNull();
    expect(request!.body.model).toBe("a-model");
    expect(request!.body.state).toEqual({ message: "Huge thanks to @teammate and @teammate for the release :rocket:" });
    const questions = request!.body.questions as Record<string, { type: string; instructions: string }>;
    expect(Object.keys(questions)).toEqual(["thanks"]);
    expect(questions.thanks!.type).toBe("noul");
    expect(questions.thanks!.instructions).not.toContain("release");
    expect(JSON.stringify(request!.body)).not.toContain("U_BOB");
  });

  test.each<[string, (t: Backend) => Promise<unknown>]>([
    ["delivered twice by Slack", async (t) => {
      const delivery = messageEvent(thanksBob, { user: maintainer.user });
      await t.fetch("/slack/events", await signedRequest(delivery));
      await t.fetch("/slack/events", await signedRequest(delivery));
    }],
    ["edited afterwards", async (t) => {
      await post(t, thanksBob, { user: maintainer.user });
      await settle(t);
      await edit(t, [section(text("Thanks so much "), mention("U_BOB"), text(" for fixing the build!"))], { user: maintainer.user });
    }],
    ["posted again under the same ts", async (t) => {
      await post(t, thanksBob, { user: maintainer.user });
      await settle(t);
      await post(t, thanksBob, { user: maintainer.user });
    }],
  ])("the same message %s is nudged once and asked about once", async (_, deliver) => {
    const t = await workspace();

    await deliver(t);
    await settle(t);

    expect(slack.callsTo("chat.postEphemeral")).toHaveLength(1);
    expect(gateway.requests).toHaveLength(1);
  });
});

describe("messages that aren't a thank-you without a kudos get no nudge", () => {
  test("a thank-you that gives a kudos is a kudos, with no nudge and no gateway call", async () => {
    const t = await workspace();

    await post(t, [section(text("Thanks "), mention("U_BOB"), text(" for the review "), emoji("taco"))], { user: maintainer.user });
    await settle(t);

    expect(gateway.requests).toEqual([]);
    expect(slack.callsTo("chat.postEphemeral").map(({ text }) => text)).not.toContain(nudge);
  });

  test("a message the gateway doesn't take for a thank-you gets no nudge", async () => {
    gateway.answering(() => thanksProbability(0.001));
    const t = await workspace();

    await post(t, [section(text("Thanks, "), mention("U_BOB"), text(", can you review my PR today?"))], { user: maintainer.user });
    await settle(t);

    expect(gateway.requests).toHaveLength(1);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
  });

  test.each([
    ["just under the bar", 0.89, false],
    ["at the bar", 0.9, true],
  ])("a thank-you the gateway is %s about is nudged only from 0.9", async (_, probability, nudged) => {
    gateway.answering(() => thanksProbability(probability));
    const t = await workspace();

    await post(t, [section(text("Thanks "), mention("U_BOB"), text(" for the review!"))], { user: maintainer.user });
    await settle(t);

    expect(slack.callsTo("chat.postEphemeral").map(({ text }) => text)).toEqual(nudged ? [nudge] : []);
  });

  test("a thank-you said with :pray: alone is asked about and nudged", async () => {
    const t = await workspace();

    await post(t, [section(mention("U_BOB"), text(" "), tonedEmoji("pray", 3), text(" for fixing the build"))], { user: maintainer.user });
    await settle(t);

    expect(gateway.requests.map(({ body }) => body.state)).toEqual([{ message: "@teammate :pray::skin-tone-3: for fixing the build" }]);
    expect(slack.callsTo("chat.postEphemeral").map(({ text }) => text)).toEqual([nudge]);
  });

  test.each<[string, RichElement[]]>([
    ["no word of thanks", [section(mention("U_BOB"), text(" can you review my PR today?"))]],
    ["no one mentioned", [section(text("Thanks everyone for a great week!"))]],
    ["only its author mentioned", [section(text("Note to self "), mention("U_ALICE"), text(": thank the team"))]],
    ["its thanks only quoted", [quote(text("thanks for nothing")), section(mention("U_BOB"), text(" what did they mean?"))]],
  ])("a message with %s never reaches the gateway", async (_, blocks) => {
    const t = await workspace();

    await post(t, blocks, { user: maintainer.user });
    await settle(t);

    expect(gateway.requests).toEqual([]);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
  });
});

describe("the flag keeps everyone else's messages away from the gateway", () => {
  test("Bob, outside the flag, thanking Carol: the gateway is never called, nothing is sent and nothing is stored", async () => {
    const t = await workspace();
    const before = await everythingStored(t);

    await post(t, [section(text("Thank you "), mention("U_CAROL"), text(" for covering my on-call shift!"))], { user: bob.user });
    await settle(t);

    expect(gateway.requests).toEqual([]);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
    expect(await everythingStored(t)).toEqual(before);
  });

  test("a person the directory doesn't know never reaches the gateway", async () => {
    const t = await workspace();

    await post(t, [section(text("Thank you "), mention("U_CAROL"), text(" for the help!"))], { user: "U_STRANGER" });
    await settle(t);

    expect(gateway.requests).toEqual([]);
  });

  test("without the gateway's settings nothing is asked or sent", async () => {
    vi.stubEnv("AI_GATEWAY_URL", "");
    const t = await workspace();
    const before = await everythingStored(t);

    await post(t, thanksBob, { user: maintainer.user });
    await settle(t);

    expect(gateway.requests).toEqual([]);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
    expect(await everythingStored(t)).toEqual(before);
  });

  test("a thank-you posted before the gateway's settings arrive is still asked about when Slack delivers it again", async () => {
    vi.stubEnv("AI_GATEWAY_URL", "");
    const t = await workspace();
    await post(t, thanksBob, { user: maintainer.user, ts: "1762336800.000200" });
    await settle(t);

    vi.stubEnv("AI_GATEWAY_URL", gatewayUrl);
    await post(t, thanksBob, { user: maintainer.user, ts: "1762336800.000200" });
    await settle(t);

    expect(gateway.requests).toHaveLength(1);
    expect(slack.callsTo("chat.postEphemeral").map(({ text }) => text)).toEqual([nudge]);
  });
});

describe("a gateway failure sends no nudge and fails no other Slack handling", () => {
  test.each<[string, GatewayAnswer]>([
    ["an error status", () => new Response("upstream down", { status: 503 })],
    ["a network failure", () => Promise.reject(new TypeError("fetch failed"))],
    ["a refusal", () => Response.json({ model: "a-model-0.1", answers: { thanks: { type: "refusal" } } })],
    ["a malformed answer", () => Response.json({ model: "a-model-0.1", answers: { thanks: { type: "noul", noul: "yes" } } })],
    ["a body that isn't JSON", () => new Response("<html>", { status: 200 })],
  ])("with %s, Slack gets its 200, no nudge goes out, and the message isn't asked about again", async (_, answer) => {
    gateway.answering(answer);
    const t = await workspace();

    const response = await post(t, thanksBob, { user: maintainer.user });
    await settle(t);
    await post(t, thanksBob, { user: maintainer.user });
    await settle(t);

    expect(response.status).toBe(200);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
    expect(gateway.requests).toHaveLength(1);
  });

  test("a gateway that never answers is given up on within Slack's 3 seconds, and Slack still gets its 200", { timeout: 3000 }, async () => {
    gateway.answering(({ signal }) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason))));
    const t = await workspace();

    const response = await post(t, thanksBob, { user: maintainer.user });
    await settle(t);

    expect(response.status).toBe(200);
    expect(gateway.requests[0]!.signal?.reason).toMatchObject({ name: "TimeoutError" });
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
  });

  test("a failing gateway leaves a kudos given right after it untouched", async () => {
    gateway.answering(() => Promise.reject(new TypeError("fetch failed")));
    const t = await workspace();

    await post(t, thanksBob, { user: maintainer.user });
    await post(t, [section(mention("U_CAROL"), text(" thanks for the demo "), emoji("taco"))], { user: maintainer.user, ts: "1762336900.000100" });
    await settle(t);

    expect(slack.reactionsOn("C1", "1762336900.000100")).not.toEqual([]);
  });
});

async function workspace() {
  const t = testBackend();
  await setWorkspaceSettings(t, { kudosEmoji: "taco" });
  for (const person of [maintainer, bob, carol]) await memberChanged(t, "team_join", { id: person.user, profile: { display_name: person.name, email: person.email } });
  await settle(t);
  return flagsFromPostHog(t, postHog, onForEmails("thank-you-nudge", maintainer.email));
}
