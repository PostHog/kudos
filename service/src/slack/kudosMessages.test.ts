// Kudos messages in a channel, from outside: posted through the front door as Slack posts them, and what the giver,
// the recipients and the channel see. Today's convex/slack/kudosMessages.test.ts. A message with a mention and an emoji
// goes through the parser's hooks (S7's owned store emoji, S9's earned album emoji), and its people are confirmed by the
// directory's lookup (S3); its outcome is told in a private reply (S5) and a message that gives is placed in the
// spotlight (S11), so those paths wait on those stacks. A message without both a mention and an emoji, a bot's and a
// DM's are dropped before any of them.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { isWelcome, type SlackCall } from "../../testing/fakeSlack.ts";
import { everythingStored, kudosReceived, post, setWorkspaceSettings, settle, slackTs } from "../../testing/messageFlows.ts";
import { broadcast, codeBlock, emoji, mention, quote, section, text, userGroup, type MessageOptions, type RichElement } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { deliverIndicatorJob } from "./delivery.ts";

const now = new Date("2026-10-13T10:00:00Z");
const postedTs = "1760349600.000100";
const backend = useTestBackend({ now: now.getTime() });

// What a kudos message reaches before it gives, before it is told, and before it is placed in the spotlight.
const confirmed: [Stack, ...Stack[]] = ["S3", "S7", "S9"];
const told: [Stack, ...Stack[]] = ["S3", "S5", "S7", "S9"];
const given: [Stack, ...Stack[]] = ["S3", "S5", "S7", "S9", "S11"];

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function withSlack(options: { now?: number } = {}) {
  const t = backend(options);
  t.slack.withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL");
  return t;
}

describe("a kudos message in a channel the app is in", () => {
  waitsOn(given, "R4 R8 R18 R32: thanks @Bob :taco: gives Bob 1 kudos and adds the :taco: reaction", async () => {
    const t = withSlack();

    const response = await post(t, [section(text("thanks "), mention("U_BOB"), text(" "), emoji("taco"))]);
    await settle(t);

    expect(response.status).toBe(200);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  waitsOn(given, "R28: the directory fills from users.info on a miss, one lookup per person, then the next message needs none", async () => {
    const t = withSlack();

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: "1760349600.000100" });
    await settle(t);
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: "1760349601.000100" });
    await settle(t);

    expect(t.slack.callsTo("users.info").map((args) => args.user).sort()).toEqual(["U_ALICE", "U_BOB"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(2);
  });

  waitsOn(given, "R32: a repeated indicator delivery leaves exactly one :taco: reaction", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_BOB"), emoji("taco"))]);
    await settle(t);

    await t.run((ctx) => ctx.jobs.enqueue(deliverIndicatorJob, { workspace: "T1", conversation: "C1", message: postedTs }));
    await settle(t);

    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  waitsOn(given, "R32: the indicator is the first kudos emoji the giver used", async () => {
    const t = withSlack();
    await setWorkspaceSettings(t, { kudosEmoji: "pizza" });

    await post(t, [section(mention("U_BOB"), emoji("pizza"), emoji("pizza"))]);
    await settle(t);

    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["pizza"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(2);
  });
});

describe("R33: the private reply", () => {
  waitsOn(given, "R36 R37: a thread reply's Given reply goes to the giver only, in the thread, with what's left", async () => {
    const t = withSlack();
    const threadRoot = "1760349000.000100";

    await post(t, [section(text("thanks "), mention("U_BOB"), text(" and "), mention("U_CAROL"), emoji("taco"))], { threadTs: threadRoot });
    await settle(t);

    expect(t.slack.callsTo("chat.postEphemeral")).toEqual([
      { channel: "C1", user: "U_ALICE", thread_ts: threadRoot, text: "<@U_BOB> and <@U_CAROL> got 1 kudos from you. You have 1 kudos left today." },
    ]);
    expect(callsBesideWelcomes(t).map((call) => call.method).sort()).toEqual(["auth.test", "chat.postEphemeral", "reactions.add"]);
    expect(welcomedPeople(t)).toEqual(["U_ALICE", "U_BOB", "U_CAROL"]);
  });

  waitsOn(given, "R36: a Given reply names three recipients as A, B and C", async () => {
    const t = withSlack();
    t.slack.withMember("U_DAN");

    await post(t, [section(mention("U_BOB"), mention("U_CAROL"), mention("U_DAN"), emoji("taco"))]);
    await settle(t);

    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      "<@U_BOB>, <@U_CAROL> and <@U_DAN> got 1 kudos from you. That was your last kudos for today, and you'll have 3 more at midnight.",
    ]);
  });

  waitsOn(given, "R37: the giver's last kudos says how many come at midnight", async () => {
    const t = withSlack();

    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))]);
    await settle(t);

    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      "<@U_BOB> got 3 kudos from you. That was your last kudos for today, and you'll have 3 more at midnight.",
    ]);
  });

  describe("R33: replies reach only the giver", () => {
    const firstAward = ["U_ALICE", "U_BOB"];
    const cases: Array<[string, RichElement[], MessageOptions, string[], [Stack, ...Stack[]]]> = [
      ["Given in the channel", [section(mention("U_BOB"), mention("U_ALICE"), emoji("taco"))], {}, firstAward, given],
      ["Given in a thread", [section(mention("U_BOB"), emoji("taco"))], { threadTs: "1760349000.000100" }, firstAward, given],
      ["Over allowance in the channel", [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))], {}, [], told],
      ["Over allowance in a thread", [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))], { threadTs: "1760349000.000100" }, [], told],
      ["Invalid in the channel", [section(mention("U_ALICE"), broadcast("here"), emoji("taco"))], {}, [], told],
      ["Invalid in a thread", [section(mention("U_ALICE"), broadcast("here"), emoji("taco"))], { threadTs: "1760349000.000100", subtype: "thread_broadcast" }, [], told],
    ];
    for (const [name, blocks, options, welcomed, stacks] of cases) {
      waitsOn(stacks, `beside the message: ${name}`, async () => {
        const t = withSlack();

        await post(t, blocks, options);
        await settle(t);

        expect(welcomedPeople(t)).toEqual(welcomed);
        const messagesSent = callsBesideWelcomes(t).filter((call) => call.method.startsWith("chat."));
        expect(messagesSent).toEqual([
          { method: "chat.postEphemeral", args: expect.objectContaining({ channel: "C1", user: "U_ALICE", ...(options.threadTs && { thread_ts: options.threadTs }) }) },
        ]);
        expect(Object.keys(messagesSent[0]!.args).sort()).toEqual(options.threadTs ? ["channel", "text", "thread_ts", "user"] : ["channel", "text", "user"]);
      });
    }
  });
});

describe("saying no", () => {
  waitsOn(told, "R15 R32 R33 R36: a message costing more than the kudos left spends nothing, gets the hourglass and tells the giver in the channel", async () => {
    const t = withSlack();

    await post(t, [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))]);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["hourglass_flowing_sand"]);
    expect(t.slack.ephemeralsTo("U_ALICE")).toEqual([
      {
        channel: "C1",
        user: "U_ALICE",
        text: "This needs 4 kudos (2 people × 2 kudos emoji), but you have 3 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.",
      },
    ]);
  });

  waitsOn(told, "R9 R10 R36 R37: a message where nobody can receive gets no reaction, only the distinct reasons", async () => {
    const t = withSlack();
    t.slack.withMember("U_HELPER", { is_bot: true });

    await post(t, [section(mention("U_ALICE"), mention("U_HELPER"), broadcast("here"), userGroup("S1"), mention("U_ALICE"), emoji("taco"))]);
    await settle(t);

    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(t.slack.callsTo("reactions.add")).toEqual([]);
    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      "Nobody in this message can receive kudos: you can't give kudos to yourself, bots don't receive kudos and `@here`, `@channel` and user groups don't receive kudos, so tag people individually. Tag a teammate and edit the message to try again.",
    ]);
  });

  waitsOn(given, "R9 R36: skipped mentions are named with their reasons while the rest receive", async () => {
    const t = withSlack();
    t.slack.withMember("U_HELPER", { is_bot: true }).withMember("U_DAVE", { team_id: "T2" }).withMember("U_ERIN", { deleted: true });

    await post(t, [
      section(mention("U_ALICE"), mention("U_HELPER"), mention("U_DAVE"), userGroup("S1"), mention("U_BOB"), broadcast("channel"), mention("U_ERIN"), emoji("taco")),
    ]);
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => String(reply.text).split("\n"))).toEqual([
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
  // The first ones' content leaves no mention or no emoji to count, so the front door drops them before the engine; the
  // last carries both, so the engine reads it, through the parser's hooks, and asks the directory about nobody.
  const cases: Array<[string, RichElement[], MessageOptions | undefined, Stack[]]> = [
    ["the emoji inside a quote", [section(mention("U_BOB")), quote(emoji("taco"))], undefined, []],
    ["the mention inside a code block", [codeBlock(mention("U_BOB")), section(emoji("taco"))], undefined, []],
    ["the emoji struck through", [section(mention("U_BOB"), emoji("taco", { strike: true }))], undefined, []],
    ["the emoji as inline code", [section(mention("U_BOB"), emoji("taco", { code: true }))], undefined, []],
    ["the mention struck through", [section(mention("U_BOB", { strike: true }), emoji("taco"))], undefined, []],
    ["the emoji in an attachment", [section(mention("U_BOB"))], { extra: { attachments: [{ text: ":taco:", blocks: [{ type: "rich_text", elements: [section(emoji("taco"))] }] }] } }, []],
    ["a forwarded message", [section(text("look"))], { extra: { attachments: [{ is_share: true, blocks: [{ type: "rich_text", elements: [section(mention("U_BOB"), emoji("taco"))] }] }] } }, []],
    ["no mention", [section(text("thanks "), emoji("taco"))], undefined, []],
    ["no emoji", [section(text("thanks "), mention("U_BOB"))], undefined, []],
    ["an emoji that is not a kudos emoji", [section(mention("U_BOB"), emoji("pizza"))], undefined, confirmed],
  ];
  for (const [name, blocks, options, stacks] of cases) {
    const body = async () => {
      const t = withSlack();

      const response = await post(t, blocks, options);
      await settle(t);

      expect(response.status).toBe(200);
      expect(t.slack.calls).toEqual([]);
      expect(await everythingStored(t)).toEqual([]);
    };
    const title = `${name} is ordinary chat: no reaction, no lookup, nothing stored`;
    if (stacks.length === 0) test(title, body);
    else waitsOn(stacks as [Stack, ...Stack[]], title, body);
  }

  waitsOn(confirmed, "R3: after the workspace emoji changes, the old one is ordinary chat", async () => {
    const t = withSlack();
    await setWorkspaceSettings(t, { kudosEmoji: "pizza" });

    await post(t, [section(mention("U_BOB"), emoji("taco"))]);
    await settle(t);

    expect(t.slack.callsTo("reactions.add")).toEqual([]);
    expect(await kudosReceived(t, "U_BOB")).toBe(0);
  });
});

waitsOn(confirmed, "R16: a message waiting on a directory check is ordinary chat when the workspace emoji changes before the check", async () => {
  const t = withSlack();

  await post(t, [section(mention("U_BOB"), emoji("taco"))]);
  await setWorkspaceSettings(t, { kudosEmoji: "pizza" });
  await settle(t);

  expect(t.slack.callsTo("users.info")).not.toEqual([]);
  expect(t.slack.callsTo("reactions.add")).toEqual([]);
  expect(t.slack.callsTo("chat.postEphemeral")).toEqual([]);
  expect(await kudosReceived(t, "U_BOB")).toBe(0);
});

describe("R5 R6 R7: whose messages count, and where", () => {
  const cases: Array<[string, MessageOptions]> = [
    ["a bot's message", { botId: "B1" }],
    ["a bot_message", { subtype: "bot_message", botId: "B1" }],
    ["a DM", { channelType: "im", channel: "D1" }],
    ["a group DM", { channelType: "mpim", channel: "G1" }],
  ];
  for (const [name, options] of cases) {
    test(`${name} is ignored`, async () => {
      const t = withSlack();

      const response = await post(t, [section(mention("U_BOB"), emoji("taco"))], options);
      await settle(t);

      expect(response.status).toBe(200);
      expect(t.slack.calls).toEqual([]);
      expect(await kudosReceived(t, "U_BOB")).toBe(0);
    });
  }

  waitsOn(confirmed, "R5: a message by a person the directory knows as a bot is ignored", async () => {
    const t = withSlack();
    t.slack.withMember("U_HELPER", { is_bot: true });

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { user: "U_HELPER" });
    await settle(t);

    expect(t.slack.callsTo("reactions.add")).toEqual([]);
    expect(await kudosReceived(t, "U_BOB")).toBe(0);
  });

  waitsOn(given, "R6: a private channel the app is in counts", async () => {
    const t = withSlack();

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { channelType: "group", channel: "G2" });
    await settle(t);

    expect(t.slack.reactionsOn("G2", postedTs)).toEqual(["taco"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  waitsOn(given, "R6: a thread reply counts", async () => {
    const t = withSlack();

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { threadTs: "1760349000.000100" });
    await settle(t);

    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });

  waitsOn(given, "R7: a thread reply also sent to the channel gives once, even when Slack delivers it twice", async () => {
    const t = withSlack();
    const broadcast = { threadTs: "1760349000.000100", subtype: "thread_broadcast" };

    await post(t, [section(mention("U_BOB"), emoji("taco"))], broadcast);
    await post(t, [section(mention("U_BOB"), emoji("taco"))], broadcast);
    await settle(t);

    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });
});

describe("R12 R13: the allowance day", () => {
  waitsOn(given, "a message just before the giver's local midnight spends from that day, even when it is evaluated after midnight", async () => {
    const beforeMidnight = new Date("2026-10-13T06:59:00Z");
    const afterMidnight = new Date("2026-10-13T07:05:00Z");
    const t = withSlack({ now: beforeMidnight.getTime() });
    t.slack.withMember("U_ALICE", { tz: "America/Los_Angeles" });

    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))], { ts: slackTs(beforeMidnight) });
    t.time.advance(afterMidnight.getTime() - beforeMidnight.getTime());
    await settle(t);
    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))], { ts: slackTs(afterMidnight) });
    await settle(t);

    expect(t.slack.reactionsOn("C1", slackTs(beforeMidnight))).toEqual(["taco"]);
    expect(t.slack.reactionsOn("C1", slackTs(afterMidnight))).toEqual(["taco"]);
    expect(await kudosReceived(t, "U_BOB")).toBe(6);
  });
});

function callsBesideWelcomes(t: TestBackend) {
  return t.slack.calls.filter((call) => call.method !== "users.info" && !isWelcomeCall(call));
}

function welcomedPeople(t: TestBackend) {
  return t.slack.calls.filter(isWelcomeCall).map((call) => String(call.args.channel)).sort();
}

function isWelcomeCall(call: SlackCall) {
  return call.method === "chat.postMessage" && isWelcome(call.args);
}
