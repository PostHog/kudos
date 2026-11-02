import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeSlack, isWelcome, type SlackCall } from "../../testing/fakeSlack";
import { everythingStored, kudosReceived, post, settle, testBackend, type Backend } from "../../testing/slackBackend";
import { signingSecret } from "../../testing/signedSlack";
import { broadcast, codeBlock, emoji, mention, quote, section, text, userGroup, type MessageOptions, type RichElement } from "../../testing/slackMessages";
import { internal } from "../_generated/api";

const now = new Date("2026-10-13T10:00:00Z");
const postedTs = "1760349600.000100";

let slack: FakeSlack;

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.stubEnv("SLACK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
  slack = new FakeSlack().withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL");
  vi.stubGlobal("fetch", slack.fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a kudos message in a channel the app is in", () => {
  test("R4 R8 R18 R32: thanks @Bob :taco: gives Bob 1 kudos and adds the :taco: reaction", async () => {
    const t = testBackend();

    const response = await post(t, [section(text("thanks "), mention("U_BOB"), text(" "), emoji("taco"))]);
    await settle(t);

    expect(response.status).toBe(200);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  test("R28: the directory fills from users.info on a miss, one lookup per person, then the next message needs none", async () => {
    const t = testBackend();

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: "1760349600.000100" });
    await settle(t);
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: "1760349601.000100" });
    await settle(t);

    expect(slack.callsTo("users.info").map((args) => args.user).sort()).toEqual(["U_ALICE", "U_BOB"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(2);
  });

  test("R32: a repeated indicator delivery leaves exactly one :taco: reaction", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_BOB"), emoji("taco"))]);
    await settle(t);

    await t.action(internal.slack.delivery.deliverIndicator, { workspace: "T1", conversation: "C1", message: postedTs });

    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  test("R32: the indicator is the first kudos emoji the giver used", async () => {
    const t = testBackend();
    await setWorkspaceEmoji(t, "pizza");

    await post(t, [section(mention("U_BOB"), emoji("pizza"), emoji("pizza"))]);
    await settle(t);

    expect(slack.reactionsOn("C1", postedTs)).toEqual(["pizza"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(2);
  });
});

describe("R33: the private reply", () => {
  test("R36 R37: a thread reply's Given reply goes to the giver only, in the thread, with what's left", async () => {
    const t = testBackend();
    const threadRoot = "1760349000.000100";

    await post(t, [section(text("thanks "), mention("U_BOB"), text(" and "), mention("U_CAROL"), emoji("taco"))], { threadTs: threadRoot });
    await settle(t);

    expect(slack.callsTo("chat.postEphemeral")).toEqual([
      { channel: "C1", user: "U_ALICE", thread_ts: threadRoot, text: "<@U_BOB> and <@U_CAROL> got 1 kudos from you. You have 1 kudos left today." },
    ]);
    expect(callsBesideWelcomes().map((call) => call.method).sort()).toEqual(["auth.test", "chat.postEphemeral", "reactions.add"]);
    expect(welcomedPeople()).toEqual(["U_ALICE", "U_BOB", "U_CAROL"]);
  });

  test("R36: a Given reply names three recipients as A, B and C", async () => {
    const t = testBackend();
    slack.withMember("U_DAN");

    await post(t, [section(mention("U_BOB"), mention("U_CAROL"), mention("U_DAN"), emoji("taco"))]);
    await settle(t);

    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      "<@U_BOB>, <@U_CAROL> and <@U_DAN> got 1 kudos from you. That was your last kudos for today, and you'll have 3 more at midnight.",
    ]);
  });

  test("R37: the giver's last kudos says how many come at midnight", async () => {
    const t = testBackend();

    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))]);
    await settle(t);

    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      "<@U_BOB> got 3 kudos from you. That was your last kudos for today, and you'll have 3 more at midnight.",
    ]);
  });

  describe("R33: replies reach only the giver", () => {
    const firstAward = ["U_ALICE", "U_BOB"];
    test.each<[string, RichElement[], MessageOptions, string[]]>([
      ["Given in the channel", [section(mention("U_BOB"), mention("U_ALICE"), emoji("taco"))], {}, firstAward],
      ["Given in a thread", [section(mention("U_BOB"), emoji("taco"))], { threadTs: "1760349000.000100" }, firstAward],
      ["Over allowance in the channel", [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))], {}, []],
      ["Over allowance in a thread", [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))], { threadTs: "1760349000.000100" }, []],
      ["Invalid in the channel", [section(mention("U_ALICE"), broadcast("here"), emoji("taco"))], {}, []],
      ["Invalid in a thread", [section(mention("U_ALICE"), broadcast("here"), emoji("taco"))], { threadTs: "1760349000.000100", subtype: "thread_broadcast" }, []],
    ])("beside the message: %s", async (_, blocks, options, welcomed) => {
      const t = testBackend();

      await post(t, blocks, options);
      await settle(t);

      expect(welcomedPeople()).toEqual(welcomed);
      const messagesSent = callsBesideWelcomes().filter((call) => call.method.startsWith("chat."));
      expect(messagesSent).toEqual([
        { method: "chat.postEphemeral", args: expect.objectContaining({ channel: "C1", user: "U_ALICE", ...(options.threadTs && { thread_ts: options.threadTs }) }) },
      ]);
      expect(Object.keys(messagesSent[0]!.args).sort()).toEqual(options.threadTs ? ["channel", "text", "thread_ts", "user"] : ["channel", "text", "user"]);
    });
  });
});

describe("saying no", () => {
  test("R15 R32 R33 R36: a message costing more than the kudos left spends nothing, gets the hourglass and tells the giver in the channel", async () => {
    const t = testBackend();

    await post(t, [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))]);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["hourglass_flowing_sand"]);
    expect(slack.ephemeralsTo("U_ALICE")).toEqual([
      {
        channel: "C1",
        user: "U_ALICE",
        text: "This needs 4 kudos (2 people × 2 kudos emoji), but you have 3 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.",
      },
    ]);
  });

  test("R9 R10 R36 R37: a message where nobody can receive gets no reaction, only the distinct reasons", async () => {
    const t = testBackend();
    slack.withMember("U_HELPER", { is_bot: true });

    await post(t, [section(mention("U_ALICE"), mention("U_HELPER"), broadcast("here"), userGroup("S1"), mention("U_ALICE"), emoji("taco"))]);
    await settle(t);

    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.callsTo("reactions.add")).toEqual([]);
    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      "Nobody in this message can receive kudos: you can't give kudos to yourself, bots don't receive kudos and `@here`, `@channel` and user groups don't receive kudos, so tag people individually. Tag a teammate and edit the message to try again.",
    ]);
  });

  test("R9 R36: skipped mentions are named with their reasons while the rest receive", async () => {
    const t = testBackend();
    slack.withMember("U_HELPER", { is_bot: true }).withMember("U_DAVE", { team_id: "T2" }).withMember("U_ERIN", { deleted: true });

    await post(t, [
      section(mention("U_ALICE"), mention("U_HELPER"), mention("U_DAVE"), userGroup("S1"), mention("U_BOB"), broadcast("channel"), mention("U_ERIN"), emoji("taco")),
    ]);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(slack.ephemeralsTo("U_ALICE").map((reply) => String(reply.text).split("\n"))).toEqual([
      [
        "<@U_BOB> got 1 kudos from you. You have 2 kudos left today.",
        "I skipped <@U_ALICE>: you can't give kudos to yourself.",
        "I skipped <@U_HELPER>: bots don't receive kudos.",
        "I skipped <@U_DAVE>: <@U_DAVE> isn't an active member of this workspace.",
        "I skipped <!subteam^S1> and `@channel`: `@here`, `@channel` and user groups don't receive kudos, so tag people individually.",
        "I skipped <@U_ERIN>: <@U_ERIN> isn't an active member of this workspace.",
      ],
    ]);
  });
});

describe("R1 R2: only countable content makes a kudos message", () => {
  test.each<[string, RichElement[], MessageOptions?]>([
    ["the emoji inside a quote", [section(mention("U_BOB")), quote(emoji("taco"))]],
    ["the mention inside a code block", [codeBlock(mention("U_BOB")), section(emoji("taco"))]],
    ["the emoji struck through", [section(mention("U_BOB"), emoji("taco", { strike: true }))]],
    ["the emoji as inline code", [section(mention("U_BOB"), emoji("taco", { code: true }))]],
    ["the mention struck through", [section(mention("U_BOB", { strike: true }), emoji("taco"))]],
    ["the emoji in an attachment", [section(mention("U_BOB"))], { extra: { attachments: [{ text: ":taco:", blocks: [{ type: "rich_text", elements: [section(emoji("taco"))] }] }] } }],
    ["a forwarded message", [section(text("look"))], { extra: { attachments: [{ is_share: true, blocks: [{ type: "rich_text", elements: [section(mention("U_BOB"), emoji("taco"))] }] }] } }],
    ["no mention", [section(text("thanks "), emoji("taco"))]],
    ["no emoji", [section(text("thanks "), mention("U_BOB"))]],
    ["an emoji that is not a kudos emoji", [section(mention("U_BOB"), emoji("pizza"))]],
  ])("%s is ordinary chat: no reaction, no lookup, nothing stored", async (_, blocks, options) => {
    const t = testBackend();

    const response = await post(t, blocks, options);
    await settle(t);

    expect(response.status).toBe(200);
    expect(slack.calls).toEqual([]);
    expect(await everythingStored(t)).toEqual([]);
  });

  test("R3: after the workspace emoji changes, the old one is ordinary chat", async () => {
    const t = testBackend();
    await setWorkspaceEmoji(t, "pizza");

    await post(t, [section(mention("U_BOB"), emoji("taco"))]);
    await settle(t);

    expect(slack.callsTo("reactions.add")).toEqual([]);
    expect(await kudosReceived(t, "U_BOB")).toBe(0);
  });
});

test("R16: a message waiting on a directory check is ordinary chat when the workspace emoji changes before the check", async () => {
  const t = testBackend();

  await post(t, [section(mention("U_BOB"), emoji("taco"))]);
  await setWorkspaceEmoji(t, "pizza");
  await settle(t);

  expect(slack.callsTo("users.info")).not.toEqual([]);
  expect(slack.callsTo("reactions.add")).toEqual([]);
  expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
  expect(await kudosReceived(t, "U_BOB")).toBe(0);
});

describe("R5 R6 R7: whose messages count, and where", () => {
  test.each<[string, MessageOptions]>([
    ["a bot's message", { botId: "B1" }],
    ["a bot_message", { subtype: "bot_message", botId: "B1" }],
    ["a DM", { channelType: "im", channel: "D1" }],
    ["a group DM", { channelType: "mpim", channel: "G1" }],
  ])("%s is ignored", async (_, options) => {
    const t = testBackend();

    await post(t, [section(mention("U_BOB"), emoji("taco"))], options);
    await settle(t);

    expect(slack.calls).toEqual([]);
    expect(await kudosReceived(t, "U_BOB")).toBe(0);
  });

  test("R5: a message by a person the directory knows as a bot is ignored", async () => {
    const t = testBackend();
    slack.withMember("U_HELPER", { is_bot: true });

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { user: "U_HELPER" });
    await settle(t);

    expect(slack.callsTo("reactions.add")).toEqual([]);
    expect(await kudosReceived(t, "U_BOB")).toBe(0);
  });

  test("R6: a private channel the app is in counts", async () => {
    const t = testBackend();

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { channelType: "group", channel: "G2" });
    await settle(t);

    expect(slack.reactionsOn("G2", postedTs)).toEqual(["taco"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test("R6: a thread reply counts", async () => {
    const t = testBackend();

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { threadTs: "1760349000.000100" });
    await settle(t);

    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  test("R7: a thread reply also sent to the channel gives once, even when Slack delivers it twice", async () => {
    const t = testBackend();
    const broadcast = { threadTs: "1760349000.000100", subtype: "thread_broadcast" };

    await post(t, [section(mention("U_BOB"), emoji("taco"))], broadcast);
    await post(t, [section(mention("U_BOB"), emoji("taco"))], broadcast);
    await settle(t);

    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });
});

describe("R12 R13: the allowance day", () => {
  test("a message just before the giver's local midnight spends from that day, even when it is evaluated after midnight", async () => {
    const t = testBackend();
    slack.withMember("U_ALICE", { tz: "America/Los_Angeles" });
    const beforeMidnight = new Date("2026-10-13T06:59:00Z");
    const afterMidnight = new Date("2026-10-13T07:05:00Z");
    vi.setSystemTime(beforeMidnight);

    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))], { ts: slackTs(beforeMidnight) });
    vi.setSystemTime(afterMidnight);
    await settle(t);
    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))], { ts: slackTs(afterMidnight) });
    await settle(t);

    expect(slack.reactionsOn("C1", slackTs(beforeMidnight))).toEqual(["taco"]);
    expect(slack.reactionsOn("C1", slackTs(afterMidnight))).toEqual(["taco"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(6);
  });
});

async function setWorkspaceEmoji(t: Backend, kudosEmoji: string) {
  await t.run((ctx) => ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji }));
}

function slackTs(at: Date) {
  return `${Math.floor(at.getTime() / 1000)}.000100`;
}

function callsBesideWelcomes() {
  return slack.calls.filter((call) => call.method !== "users.info" && !isWelcomeCall(call));
}

function welcomedPeople() {
  return slack.calls.filter(isWelcomeCall).map((call) => String(call.args.channel)).sort();
}

function isWelcomeCall(call: SlackCall) {
  return call.method === "chat.postMessage" && isWelcome(call.args);
}
