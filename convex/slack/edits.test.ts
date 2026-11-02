import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeSlack } from "../../testing/fakeSlack";
import { internal } from "../_generated/api";
import { signingSecret } from "../../testing/signedSlack";
import { deleteMessage, edit, everythingStored, kudosReceived, post, setWorkspaceSettings, settle, testBackend } from "../../testing/slackBackend";
import { broadcast, emoji, mention, section, text, type RichElement } from "../../testing/slackMessages";

const now = new Date("2026-10-13T10:00:00Z");
const postedTs = "1760349600.000100";
const threadRoot = "1760349000.000100";
const overAllowance = [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))];
const acceptedReply = "This message already gave kudos, so your edit doesn't change them. To give more, send a new message.";
const overAllowanceReply =
  "This needs 4 kudos (2 people × 2 kudos emoji), but you have 3 left today. Edit the message to give fewer and I'll try again, or edit it after midnight when you have 3 again.";

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

describe("R23 R25: editing a message that gave nothing retries it", () => {
  test("an Over allowance message edited to give fewer gives, and the kudos reaction replaces the hourglass", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    const response = await edit(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(response.status).toBe(200);
    expect(await kudosReceived(t, "U_BOB")).toBe(2);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([overAllowanceReply, "<@U_BOB> got 2 kudos from you. You have 1 kudos left today."]);
  });

  test("a retry that fails again shows its new outcome: the hourglass goes, with the Invalid reply", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_ALICE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      overAllowanceReply,
      "Nobody in this message can receive kudos: you can't give kudos to yourself. Tag a teammate and edit the message to try again.",
    ]);
  });

  test("an Invalid message edited to tag a teammate gives, and shows the kudos reaction", async () => {
    const t = testBackend();
    await post(t, [section(broadcast("here"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  test("R30 R32: a retry that waits on the directory clears the hourglass, and one that is abandoned shows nothing", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_GHOST"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([overAllowanceReply]);
  });

  test("R31: a retry made while the original waits on the directory still gives after the original's lookup finishes", async () => {
    const t = testBackend();

    slack.holdingBack("users.info", "U_BOB", async () => {
      await edit(t, [section(mention("U_CAROL"), emoji("taco"))], { ts: postedTs });
    });

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(await kudosReceived(t, "U_CAROL")).toBe(1);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  test("the retry's reply goes into the thread of a thread reply", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs, threadTs: threadRoot });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, threadTs: threadRoot });
    await settle(t);

    expect(slack.ephemeralsTo("U_ALICE").at(-1)).toEqual({
      channel: "C1",
      user: "U_ALICE",
      thread_ts: threadRoot,
      text: "<@U_BOB> got 1 kudos from you. You have 2 kudos left today.",
    });
  });
});

test("R32: a late hourglass delivery that lands after the retry's delivery still leaves only the kudos reaction", async () => {
  const t = testBackend();
  const message = { workspace: "T1", conversation: "C1", message: postedTs };
  await post(t, overAllowance, { ts: postedTs });
  await settle(t);
  slack.holdingBack("reactions.add", "hourglass_flowing_sand", async () => {
    await edit(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);
  });

  await t.action(internal.slack.delivery.deliverIndicator, message);
  await settle(t);

  expect(await kudosReceived(t, "U_BOB")).toBe(2);
  expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
});

describe("R24: an edit that leaves no kudos message withdraws the attempt", () => {
  test.each<[string, RichElement[]]>([
    ["every kudos emoji removed", [section(text("thanks "), mention("U_BOB"), mention("U_CAROL"))]],
    ["every mention removed", [section(text("thanks all "), emoji("taco"), emoji("taco"))]],
  ])("%s: the hourglass is cleared and no reply is sent", async (_, blocks) => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, blocks, { ts: postedTs });
    await settle(t);

    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([overAllowanceReply]);
  });

  test("a retry waiting on the directory shows no indicator, and withdrawing it leaves none", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), mention("U_GHOST"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await edit(t, [section(mention("U_BOB"), mention("U_GHOST"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([overAllowanceReply]);
  });

  test("a withdrawn message edited back into a kudos message is retried", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await edit(t, [section(mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });
});

describe("R22: edits that change nothing", () => {
  test("a prose-only edit to a message that gave nothing makes no Slack call", async () => {
    const t = testBackend();
    await post(t, [section(text("thanks "), mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    const callsBefore = slack.calls.length;

    await edit(t, [section(text("thank you so much "), mention("U_CAROL"), emoji("taco"), text(" and "), mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(slack.calls.slice(callsBefore)).toEqual([]);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["hourglass_flowing_sand"]);
  });

  test.each<[string, RichElement[]]>([
    ["Over allowance", [section(text("thanks "), mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"), emoji("pizza"))]],
    ["Given", [section(text("thanks "), mention("U_BOB"), emoji("taco"), emoji("pizza"))]],
  ])("R16: a prose-only edit to a message that was %s under the old workspace emoji changes nothing", async (_, blocks) => {
    const t = testBackend();
    await post(t, blocks, { ts: postedTs });
    await settle(t);
    await setWorkspaceSettings(t, { kudosEmoji: "pizza" });
    const callsBefore = slack.calls.length;
    const receivedBefore = await kudosReceived(t, "U_BOB");

    await edit(t, [{ ...blocks[0]!, elements: [text("thank you so much "), ...(blocks[0] as { elements: RichElement[] }).elements.slice(1)] } as RichElement], { ts: postedTs });
    await settle(t);

    expect(slack.calls.slice(callsBefore)).toEqual([]);
    expect(await kudosReceived(t, "U_BOB")).toBe(receivedBefore);
  });

  test("a message_changed without an edited block, such as a thread's reply metadata, makes no Slack call and stores nothing", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);
    const callsBefore = slack.calls.length;
    const storedBefore = await everythingStored(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: null, extra: { reply_count: 1 } });
    await settle(t);

    expect(slack.calls.slice(callsBefore)).toEqual([]);
    expect(await everythingStored(t)).toEqual(storedBefore);
  });
});

describe("R21: the newest revision wins", () => {
  test("an edit seen before its original gives, and the original arriving after it is ignored", async () => {
    const t = testBackend();

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(slack.ephemeralsTo("U_ALICE")).toHaveLength(1);
  });

  test("an edit that leaves ordinary chat, seen before its original, keeps the original from giving", async () => {
    const t = testBackend();

    await edit(t, [section(text("thanks "), mention("U_BOB"))], { ts: postedTs });
    await settle(t);
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(slack.calls.filter((call) => call.method !== "users.info")).toEqual([]);
  });

  test("a late older edit after a newer withdrawal is ignored", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await edit(t, [section(mention("U_BOB"), text(" thanks!"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(0);
    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
  });
});

describe("R26: editing a message that gave kudos", () => {
  test("changing its mentions changes no award, spends nothing, and tells the giver in the thread", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, threadTs: threadRoot });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"))], { ts: postedTs, threadTs: threadRoot });
    await settle(t);
    await post(t, [section(mention("U_CAROL"), emoji("taco"), emoji("taco"))], { ts: "1760349700.000100" });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(await kudosReceived(t, "U_CAROL")).toBe(2);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    expect(slack.ephemeralsTo("U_ALICE").slice(1, 2)).toEqual([
      {
        channel: "C1",
        user: "U_ALICE",
        thread_ts: threadRoot,
        text: "This message already gave kudos, so your edit doesn't change them. To give more, send a new message.",
      },
    ]);
  });

  test("changing its mentions after its kudos emoji were removed tells the giver again", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await edit(t, [section(text("thanks "), mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await edit(t, [section(text("thanks "), mention("U_CAROL"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual([
      "<@U_BOB> got 1 kudos from you. You have 2 kudos left today.",
      acceptedReply,
      acceptedReply,
    ]);
  });

  test("a prose-only edit sends nothing", async () => {
    const t = testBackend();
    await post(t, [section(text("thanks "), mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    const callsBefore = slack.calls.length;

    await edit(t, [section(text("thanks a lot "), mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(slack.calls.slice(callsBefore)).toEqual([]);
  });

  test("removing its kudos emoji takes nothing back and removes its kudos reaction", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await edit(t, [section(text("thanks "), mention("U_BOB"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.ephemeralsTo("U_ALICE").at(-1)?.text).toBe("This message already gave kudos, so your edit doesn't change them. To give more, send a new message.");
  });
});

describe("R19: a message gives at most once", () => {
  test("a retry Slack delivers twice gives once", async () => {
    const t = testBackend();
    await post(t, overAllowance, { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(slack.ephemeralsTo("U_ALICE")).toHaveLength(2);
  });

  test("edits away and back again never give a second time", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await edit(t, [section(mention("U_BOB"))], { ts: postedTs, editedTs: "1760349660.000100" });
    await edit(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs, editedTs: "1760349720.000100" });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });
});

describe("R27: deleting a message changes nothing", () => {
  test.each<[string, RichElement[], string]>([
    ["a message that gave kudos", [section(mention("U_BOB"), emoji("taco"))], "taco"],
    ["a message that gave nothing", overAllowance, "hourglass_flowing_sand"],
  ])("%s keeps its awards and makes no Slack call", async (_, blocks, indicator) => {
    const t = testBackend();
    await post(t, blocks, { ts: postedTs });
    await settle(t);
    const received = await kudosReceived(t, "U_BOB");
    const callsBefore = slack.calls.length;

    const response = await deleteMessage(t, { ts: postedTs });
    await settle(t);

    expect(response.status).toBe(200);
    expect(slack.calls.slice(callsBefore)).toEqual([]);
    expect(await kudosReceived(t, "U_BOB")).toBe(received);
    expect(slack.reactionsOn("C1", postedTs)).toEqual([indicator]);
  });
});
