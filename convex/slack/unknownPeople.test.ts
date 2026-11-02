import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeSlack, httpStatus } from "../../testing/fakeSlack";
import { signedRequest, signingSecret } from "../../testing/signedSlack";
import { awardsTo, deleteMessage, edit, kudosReceived, kudosSpent, memberChanged, post, settle, settleUntil, testBackend, type Backend } from "../../testing/slackBackend";
import { emoji, memberEvent, mention, section, text, type MessageOptions, type RichElement } from "../../testing/slackMessages";

const now = new Date("2026-10-13T10:00:00Z");
const postedTs = slackTs(now);
const minute = 60_000;

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

describe("R29: a message whose people Slack can't confirm waits", () => {
  test.each<[string, RichElement[], MessageOptions, string]>([
    ["an unknown author", [section(mention("U_BOB"), emoji("taco"))], { user: "U_EVE" }, "U_BOB"],
    ["an unknown mention", [section(mention("U_DAVE"), emoji("taco"))], {}, "U_DAVE"],
  ])("%s parks the message with nothing given or spent until a recheck confirms them", async (_, blocks, options, recipient) => {
    const t = testBackend();
    slack.joiningAt("U_EVE", at(5)).joiningAt("U_DAVE", at(5));

    await post(t, blocks, { ts: postedTs, ...options });
    await settleUntil(t, at(2));

    expect(await kudosSpent(t)).toBe(0);
    expect(await kudosReceived(t, recipient)).toBe(0);
    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);

    await settle(t);

    expect(await kudosReceived(t, recipient)).toBe(1);
    expect(slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
  });

  test("R29 R30: Slack is asked again 1, 6, 36, 156 and 516 minutes after the first miss, then the message is abandoned silently", async () => {
    const t = testBackend();

    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(minutesOfLookups("U_DAVE")).toEqual([0, 1, 6, 36, 156, 516]);
    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
    expect(await kudosSpent(t)).toBe(0);
  });

  test("a lookup Slack fails to answer is asked again on the next recheck", async () => {
    const t = testBackend();
    slack.answering("users.info", httpStatus(500), httpStatus(500));

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(minutesOfLookups("U_BOB")).toEqual([0, 1]);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });
});

describe("R13 R29: a confirmed message spends on the day of the revision that waited", () => {
  test("a post spends on its posted day, even when it is confirmed after midnight", async () => {
    const t = testBackend();
    const postedAt = new Date("2026-10-13T22:00:00Z");
    vi.setSystemTime(postedAt);
    slack.joiningAt("U_DAVE", new Date("2026-10-14T00:30:00Z"));

    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: slackTs(postedAt) });
    await settle(t);

    expect(await awardsTo(t, "U_DAVE")).toEqual([expect.objectContaining({ kudos: 1, day: "2026-10-13", at: postedAt.getTime() })]);
  });

  test("a retry spends on the day of its edit, neither the posted day nor the day it is confirmed", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    const editedAt = new Date("2026-10-14T23:50:00Z");
    vi.setSystemTime(editedAt);
    slack.joiningAt("U_DAVE", new Date("2026-10-15T00:10:00Z"));

    await edit(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs, editedTs: slackTs(editedAt) });
    await settle(t);

    expect(await awardsTo(t, "U_DAVE")).toEqual([expect.objectContaining({ kudos: 1, day: "2026-10-14", at: editedAt.getTime() })]);
  });
});

test("R16: a workspace emoji changed while a message waits makes it ordinary chat at the recheck", async () => {
  const t = testBackend();
  slack.joiningAt("U_DAVE", at(5));
  await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
  await settleUntil(t, at(2));

  await setWorkspaceEmoji(t, "pizza");
  await settle(t);

  expect(minutesOfLookups("U_DAVE")).toEqual([0, 1, 6]);
  expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
  expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
});

test("R16: an emoji change that a still-unknown person's recheck sees ends the attempt, whatever the emoji is later", async () => {
  const t = testBackend();
  slack.joiningAt("U_DAVE", at(10));
  await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
  await settleUntil(t, at(2));
  await setWorkspaceEmoji(t, "pizza");
  await settleUntil(t, at(7));

  await setWorkspaceEmoji(t, "taco");
  await settle(t);

  expect(minutesOfLookups("U_DAVE")).toEqual([0, 1, 6]);
  expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
});

test("R27: a message deleted while it waits still gives when the recheck confirms its people", async () => {
  const t = testBackend();
  slack.joiningAt("U_DAVE", at(5));
  await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
  await settleUntil(t, at(2));

  await deleteMessage(t, { ts: postedTs });
  await settle(t);

  expect(await kudosReceived(t, "U_DAVE")).toBe(1);
  expect(await kudosSpent(t)).toBe(1);
});

describe("R31: a newer revision while a message waits follows the edit rules", () => {
  test("an edit that withdraws the attempt stops the rechecks", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settleUntil(t, at(2));

    await edit(t, [section(text("thanks "), mention("U_DAVE"))], { ts: postedTs, editedTs: slackTs(at(2)) });
    await settle(t);

    expect(minutesOfLookups("U_DAVE")).toEqual([0, 1]);
    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(slack.callsTo("chat.postEphemeral")).toEqual([]);
  });

  test("a retry that waits on someone else starts its own rechecks from the edit", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settleUntil(t, at(2));

    await edit(t, [section(mention("U_ERIN"), emoji("taco"))], { ts: postedTs, editedTs: slackTs(at(2)) });
    await settleUntil(t, at(7));
    await settle(t);

    expect(minutesOfLookups("U_DAVE")).toEqual([0, 1]);
    expect(minutesOfLookups("U_ERIN")).toEqual([2, 3, 8, 38, 158, 518]);
  });
});

describe("R28: team_join and user_change keep the directory fresh", () => {
  test("a person who joins can receive kudos without a lookup", async () => {
    const t = testBackend();

    const response = await memberChanged(t, "team_join", { id: "U_DAVE", tz: "Europe/Berlin" });
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(response.status).toBe(200);
    expect(slack.callsTo("users.info").map((args) => args.user)).toEqual(["U_ALICE"]);
    expect(await kudosReceived(t, "U_DAVE")).toBe(1);
  });

  test("a deactivated member no longer receives kudos", async () => {
    const t = testBackend();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    const nextTs = slackTs(at(1));

    await memberChanged(t, "user_change", { id: "U_BOB", deleted: true });
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: nextTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(slack.reactionsOn("C1", nextTs)).toEqual([]);
  });

  test("a giver's new time zone decides their allowance day", async () => {
    const t = testBackend();
    const lateEvening = new Date("2026-10-13T23:30:00Z");
    vi.setSystemTime(lateEvening);
    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))], { ts: slackTs(lateEvening) });
    await settle(t);
    const nextTs = slackTs(new Date("2026-10-13T23:40:00Z"));

    await memberChanged(t, "user_change", { id: "U_ALICE", tz: "Asia/Tokyo" });
    await post(t, [section(mention("U_CAROL"), emoji("taco"))], { ts: nextTs });
    await settle(t);

    expect(await awardsTo(t, "U_CAROL")).toEqual([expect.objectContaining({ kudos: 1, day: "2026-10-14" })]);
  });

  test("R49: a redelivered team_join doesn't bring back a member deactivated in the same second", async () => {
    const t = testBackend();
    const join = await signedRequest(memberEvent("team_join", { id: "U_DAVE" }));
    await t.fetch("/slack/events", join);

    await memberChanged(t, "user_change", { id: "U_DAVE", deleted: true });
    await t.fetch("/slack/events", await signedRequest(String(join.body)));
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  });

  test("a member event that happened before the one the directory holds changes nothing, even within the same second", async () => {
    const t = testBackend();

    await memberChanged(t, "user_change", { id: "U_DAVE", deleted: true }, { eventTs: "1760349600.000200" });
    await memberChanged(t, "team_join", { id: "U_DAVE" }, { eventTs: "1760349600.000100" });
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  });

  test("a member event older than a users.info answer changes nothing, even within the same second", async () => {
    const t = testBackend();
    slack.withMember("U_DAVE", { deleted: true });
    vi.setSystemTime(new Date(now.getTime() + 500));
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await memberChanged(t, "team_join", { id: "U_DAVE" }, { eventTs: "1760349600.000100" });
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: slackTs(at(1)) });
    await settle(t);

    expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  });

  test("a users.info answer still in flight when a user_change deactivates the person doesn't bring them back", async () => {
    const t = testBackend();
    slack.withMember("U_DAVE");
    slack.holdingBack("users.info", "U_DAVE", async () => {
      await memberChanged(t, "user_change", { id: "U_DAVE", deleted: true });
    });

    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_DAVE")).toBe(0);
    expect(slack.reactionsOn("C1", postedTs)).toEqual([]);
  });
});

async function setWorkspaceEmoji(t: Backend, kudosEmoji: string) {
  await t.run(async (ctx) => {
    const settings = await ctx.db.query("workspaces").first();
    if (settings === null) await ctx.db.insert("workspaces", { workspace: "T1", kudosEmoji });
    else await ctx.db.patch(settings._id, { kudosEmoji });
  });
}

function at(minutesAfterNow: number) {
  return new Date(now.getTime() + minutesAfterNow * minute);
}

function minutesOfLookups(user: string) {
  return slack.timesOf("users.info", (args) => args.user === user).map((time) => Math.round((time - now.getTime()) / minute));
}

function slackTs(date: Date) {
  return `${Math.floor(date.getTime() / 1000)}.000100`;
}
