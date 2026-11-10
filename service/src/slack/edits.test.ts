// Edits and deletions of kudos messages, from outside: message_changed and message_deleted through the front door as
// Slack sends them, and what the giver, the recipients and the channel see. Today's convex/slack/edits.test.ts. Every
// revision goes through the parser's hooks (S7's owned store emoji, S9's earned album emoji) and its people are confirmed
// by the directory's lookup (S3); an outcome is told in a private reply (S5) and a message that gives is placed in the
// spotlight (S11), so each test waits on the stacks its path reaches.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend } from "../../testing/backend.ts";
import { deleteMessage, edit, everythingStored, kudosReceived, post, setWorkspaceSettings, settle } from "../../testing/messageFlows.ts";
import { broadcast, emoji, mention, section, text, type RichElement } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";
import { deliverIndicator, deliverIndicatorJob } from "./delivery.ts";

const now = new Date("2026-10-13T10:00:00Z");
const postedTs = "1760349600.000100";
const threadRoot = "1760349000.000100";
const overAllowance = [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))];
const acceptedReply = "This message already gave kudos, so your edit doesn't change them. To give more, send a new message.";
const overAllowanceReply =
  "This needs 4 kudos (2 people × 2 kudos emoji), but you have 3 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.";
const backend = useTestBackend({ now: now.getTime() });

// What an edited message reaches before it is read, before it is told, and before it is placed in the spotlight.
const read: [Stack, ...Stack[]] = ["S3", "S7", "S9"];
const told: [Stack, ...Stack[]] = ["S3", "S5", "S7", "S9"];
const given: [Stack, ...Stack[]] = ["S3", "S5", "S7", "S9", "S11"];

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("SLACK_APP_ID", "A_KUDOS");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function withSlack() {
  const t = backend();
  t.slack.withMember("U_ALICE").withMember("U_BOB").withMember("U_CAROL");
  return t;
}

describe("R23 R25: editing a message that gave nothing retries it", () => {
  waitsOn(given, "an Over allowance message edited to give fewer gives, and the kudos reaction replaces the hourglass", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    const response = await edit(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(response.status).toBe(200);
    expect(await kudosReceived(t, "U_BOB")).toBe(2);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([overAllowanceReply, "<@U_BOB> got 2 kudos from you. You have 1 kudos left today."]);
  });

  waitsOn(told, "a retry that fails again shows its new outcome: the hourglass goes, with the Invalid reply", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_ALICE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      overAllowanceReply,
      "Nobody in this message can receive kudos: you can't give kudos to yourself. Tag a teammate and edit the message to try again.",
    ]);
  });

  waitsOn(given, "an Invalid message edited to tag a teammate gives, and shows the kudos reaction", async () => {
    const t = withSlack();
    await post(t, [section(broadcast("here"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  waitsOn(told, "R30 R32: a retry that waits on the directory clears the hourglass, and one that is abandoned shows nothing", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_GHOST"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([overAllowanceReply]);
  });

  waitsOn(given, "R31: a retry made while the original waits on the directory still gives after the original's lookup finishes", async () => {
    const t = withSlack();

    t.slack.holdingBack("users.info", "U_BOB", async () => {
      await edit(t, [section(mention("U_CAROL"), emoji("taco"))], { ts: postedTs });
    });

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(await kudosReceived(t, "U_CAROL")).toBe(1);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  waitsOn(given, "the retry's reply goes into the thread of a thread reply", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs, threadTs: threadRoot });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, threadTs: threadRoot });
    await settle(t);

    expect(t.slack.ephemeralsTo("U_ALICE").at(-1)).toEqual({
      channel: "C1",
      user: "U_ALICE",
      thread_ts: threadRoot,
      text: "<@U_BOB> got 1 kudos from you. You have 2 kudos left today.",
    });
  });
});

waitsOn(given, "R32: a late hourglass delivery that lands after the retry's delivery still leaves only the kudos reaction", async () => {
  const t = withSlack();
  const message = { workspace: "T1", conversation: "C1", message: postedTs };
  await post(t, overAllowance, { ts: postedTs });
  await settle(t);
  // While the hourglass is held, the edit gives and its indicator is delivered: today's settle inside the hold ran every
  // scheduled function but the held one. The service's settle waits on every running job, the held one included, so the
  // delivery runs here directly, and the jobs the edit made run in the settle below.
  t.slack.holdingBack("reactions.add", "hourglass_flowing_sand", async () => {
    await edit(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await t.operations.action("test.deliverIndicator", (ctx) => deliverIndicator(ctx, message));
  });

  await t.run((ctx) => ctx.jobs.enqueue(deliverIndicatorJob, message));
  await settle(t);

  expect(await kudosReceived(t, "U_BOB")).toBe(2);
  expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
});

describe("R24: an edit that leaves no kudos message withdraws the attempt", () => {
  const cases: Array<[string, RichElement[]]> = [
    ["every kudos emoji removed", [section(text("thanks "), mention("U_BOB"), mention("U_CAROL"))]],
    ["every mention removed", [section(text("thanks all "), emoji("taco"), emoji("taco"))]],
  ];
  for (const [name, blocks] of cases) {
    waitsOn(told, `${name}: the hourglass is cleared and no reply is sent`, async () => {
      const t = withSlack();
      await post(t, overAllowance, { ts: postedTs });
      await settle(t);

      await edit(t, blocks, { ts: postedTs });
      await settle(t);

      expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
      expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([overAllowanceReply]);
    });
  }

  waitsOn(told, "a retry waiting on the directory shows no indicator, and withdrawing it leaves none", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), mention("U_GHOST"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await edit(t, [section(mention("U_BOB"), mention("U_GHOST"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([overAllowanceReply]);
  });

  waitsOn(given, "a withdrawn message edited back into a kudos message is retried", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs });
    await edit(t, [section(mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });
});

describe("R22: edits that change nothing", () => {
  waitsOn(told, "a prose-only edit to a message that gave nothing makes no Slack call", async () => {
    const t = withSlack();
    await post(t, [section(text("thanks "), mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    const callsBefore = t.slack.calls.length;

    await edit(t, [section(text("thank you so much "), mention("U_CAROL"), emoji("taco"), text(" and "), mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(t.slack.calls.slice(callsBefore)).toEqual([]);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["hourglass_flowing_sand"]);
  });

  const outcomes: Array<[string, RichElement[], [Stack, ...Stack[]]]> = [
    ["Over allowance", [section(text("thanks "), mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"), emoji("pizza"))], told],
    ["Given", [section(text("thanks "), mention("U_BOB"), emoji("taco"), emoji("pizza"))], given],
  ];
  for (const [name, blocks, stacks] of outcomes) {
    waitsOn(stacks, `R16: a prose-only edit to a message that was ${name} under the old workspace emoji changes nothing`, async () => {
      const t = withSlack();
      await post(t, blocks, { ts: postedTs });
      await settle(t);
      await setWorkspaceSettings(t, { kudosEmoji: "pizza" });
      const callsBefore = t.slack.calls.length;
      const receivedBefore = await kudosReceived(t, "U_BOB");

      await edit(t, [{ ...blocks[0]!, elements: [text("thank you so much "), ...(blocks[0] as { elements: RichElement[] }).elements.slice(1)] } as RichElement], { ts: postedTs });
      await settle(t);

      expect(t.slack.calls.slice(callsBefore)).toEqual([]);
      expect(await kudosReceived(t, "U_BOB")).toBe(receivedBefore);
    });
  }

  waitsOn(told, "a message_changed without an edited block, such as a thread's reply metadata, makes no Slack call and stores nothing", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);
    const callsBefore = t.slack.calls.length;
    const storedBefore = await everythingStored(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: null, extra: { reply_count: 1 } });
    await settle(t);

    expect(t.slack.calls.slice(callsBefore)).toEqual([]);
    expect(await everythingStored(t)).toEqual(storedBefore);
  });
});

describe("R21: the newest revision wins", () => {
  waitsOn(given, "an edit seen before its original gives, and the original arriving after it is ignored", async () => {
    const t = withSlack();

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.ephemeralsTo("U_ALICE")).toHaveLength(1);
  });

  waitsOn(read, "an edit that leaves ordinary chat, seen before its original, keeps the original from giving", async () => {
    const t = withSlack();

    await edit(t, [section(text("thanks "), mention("U_BOB"))], { ts: postedTs });
    await settle(t);
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(t.slack.calls.filter((call) => call.method !== "users.info")).toEqual([]);
  });

  waitsOn(read, "a late older edit after a newer withdrawal is ignored", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs });
    await edit(t, [section(mention("U_BOB"), text(" thanks!"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
  });
});

describe("R26: editing a message that gave kudos", () => {
  waitsOn(given, "changing its mentions changes no award, spends nothing, and tells the giver in the thread", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, threadTs: threadRoot });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"))], { ts: postedTs, threadTs: threadRoot });
    await settle(t);
    await post(t, [section(mention("U_CAROL"), emoji("taco"), emoji("taco"))], { ts: "1760349700.000100" });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(await kudosReceived(t, "U_CAROL")).toBe(2);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(t.slack.ephemeralsTo("U_ALICE").slice(1, 2)).toEqual([
      {
        channel: "C1",
        user: "U_ALICE",
        thread_ts: threadRoot,
        text: "This message already gave kudos, so your edit doesn't change them. To give more, send a new message.",
      },
    ]);
  });

  waitsOn(given, "changing its mentions after its kudos emoji were removed tells the giver again", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await edit(t, [section(text("thanks "), mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await edit(t, [section(text("thanks "), mention("U_CAROL"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      "<@U_BOB> got 1 kudos from you. You have 2 kudos left today.",
      acceptedReply,
      acceptedReply,
    ]);
  });

  waitsOn(given, "a prose-only edit sends nothing", async () => {
    const t = withSlack();
    await post(t, [section(text("thanks "), mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    const callsBefore = t.slack.calls.length;

    await edit(t, [section(text("thanks a lot "), mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(t.slack.calls.slice(callsBefore)).toEqual([]);
  });

  waitsOn(given, "removing its kudos emoji takes nothing back and removes its kudos reaction", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await edit(t, [section(text("thanks "), mention("U_BOB"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(t.slack.ephemeralsTo("U_ALICE").at(-1)?.text).toBe("This message already gave kudos, so your edit doesn't change them. To give more, send a new message.");
  });
});

describe("R19: a message gives at most once", () => {
  waitsOn(given, "a retry Slack delivers twice gives once", async () => {
    const t = withSlack();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.ephemeralsTo("U_ALICE")).toHaveLength(2);
  });

  waitsOn(given, "edits away and back again never give a second time", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });
});

describe("R27: deleting a message changes nothing", () => {
  const cases: Array<[string, RichElement[], string, [Stack, ...Stack[]]]> = [
    ["a message that gave kudos", [section(mention("U_BOB"), emoji("taco"))], "taco", given],
    ["a message that gave nothing", overAllowance, "hourglass_flowing_sand", told],
  ];
  for (const [name, blocks, indicator, stacks] of cases) {
    waitsOn(stacks, `${name} keeps its awards and makes no Slack call`, async () => {
      const t = withSlack();
      await post(t, blocks, { ts: postedTs });
      await settle(t);
      const received = await kudosReceived(t, "U_BOB");
      const callsBefore = t.slack.calls.length;

      const response = await deleteMessage(t, { ts: postedTs });
      await settle(t);

      expect(response.status).toBe(200);
      expect(t.slack.calls.slice(callsBefore)).toEqual([]);
      expect(await kudosReceived(t, "U_BOB")).toBe(received);
      expect(t.slack.reactionsOn("C1", postedTs)).toEqual([indicator]);
    });
  }
});
