// People Slack can't confirm yet, from outside: a kudos message through the front door whose author or recipients the
// directory doesn't know, its rechecks on the app's clock, and the member events that keep the directory fresh. Today's
// convex/slack/unknownPeople.test.ts. Rechecks and member events are the directory's (S3), and every message goes
// through the parser's hooks (S7, S9); one that is told or gives also waits on S5's replies and S11's spotlight.
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { useTestBackend, type TestBackend } from "../../testing/backend.ts";
import { httpStatus } from "../../testing/fakeSlack.ts";
import { awardsTo, deleteMessage, edit, kudosReceived, memberChanged, post, setWorkspaceSettings, settle, settleUntil, slackTs } from "../../testing/messageFlows.ts";
import { emoji, memberEvent, mention, section, text, type MessageOptions, type RichElement } from "../../testing/slackMessages.ts";
import { waitsOn, type Stack } from "../../testing/waiting.ts";

const now = new Date("2026-10-13T10:00:00Z");
const postedTs = slackTs(now);
const minute = 60_000;
const backend = useTestBackend({ now: now.getTime() });

// What a message reaches while it waits, once it is told, and once it gives.
const waits: [Stack, ...Stack[]] = ["S3", "S7", "S9"];
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

describe("R29: a message whose people Slack can't confirm waits", () => {
  const cases: Array<[string, RichElement[], MessageOptions, string]> = [
    ["an unknown author", [section(mention("U_BOB"), emoji("taco"))], { user: "U_EVE" }, "U_BOB"],
    ["an unknown mention", [section(mention("U_DAVE"), emoji("taco"))], {}, "U_DAVE"],
  ];
  for (const [name, blocks, options, recipient] of cases) {
    waitsOn(given, `${name} parks the message with nothing given or spent until a recheck confirms them`, async () => {
      const t = withSlack();
      t.slack.joiningAt("U_EVE", at(5)).joiningAt("U_DAVE", at(5));

      await post(t, blocks, { ts: postedTs, ...options });
      await settleUntil(t, at(2));

      expect(await kudosSpent(t)).toBe(0);
      expect(await kudosReceived(t, recipient)).toBe(0);
      expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
      expect(t.slack.callsTo("chat.postEphemeral")).toEqual([]);

      await settle(t);

      expect(await kudosReceived(t, recipient)).toBe(1);
      expect(t.slack.reactionsOn("C1", postedTs)).toEqual(["taco"]);
    });
  }

  waitsOn(waits, "R29 R30: Slack is asked again 1, 6, 36, 156 and 516 minutes after the first miss, then the message is abandoned silently", async () => {
    const t = withSlack();

    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(minutesOfLookups(t, "U_DAVE")).toEqual([0, 1, 6, 36, 156, 516]);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(t.slack.callsTo("chat.postEphemeral")).toEqual([]);
    expect(await kudosSpent(t)).toBe(0);
  });

  waitsOn(given, "a lookup Slack fails to answer is asked again on the next recheck", async () => {
    const t = withSlack();
    t.slack.answering("users.info", httpStatus(500), httpStatus(500));

    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(minutesOfLookups(t, "U_BOB")).toEqual([0, 1]);
    expect(await kudosReceived(t, "U_BOB")).toBe(1);
  });
});

describe("R13 R29: a confirmed message spends on the day of the revision that waited", () => {
  waitsOn(given, "a post spends on its posted day, even when it is confirmed after midnight", async () => {
    const postedAt = new Date("2026-10-13T22:00:00Z");
    const t = withSlack({ now: postedAt.getTime() });
    t.slack.joiningAt("U_DAVE", new Date("2026-10-14T00:30:00Z"));

    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: slackTs(postedAt) });
    await settle(t);

    expect(await awardsTo(t, "U_DAVE")).toEqual([expect.objectContaining({ kudos: 1, day: "2026-10-13", at: postedAt.getTime() })]);
  });

  waitsOn(given, "a retry spends on the day of its edit, neither the posted day nor the day it is confirmed", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_BOB"), mention("U_CAROL"), emoji("taco"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    const editedAt = new Date("2026-10-14T23:50:00Z");
    t.time.advance(editedAt.getTime() - t.clock.now());
    t.slack.joiningAt("U_DAVE", new Date("2026-10-15T00:10:00Z"));

    await edit(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs, editedTs: slackTs(editedAt) });
    await settle(t);

    expect(await awardsTo(t, "U_DAVE")).toEqual([expect.objectContaining({ kudos: 1, day: "2026-10-14", at: editedAt.getTime() })]);
  });
});

waitsOn(waits, "R16: a workspace emoji changed while a message waits makes it ordinary chat at the recheck", async () => {
  const t = withSlack();
  t.slack.joiningAt("U_DAVE", at(5));
  await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
  await settleUntil(t, at(2));

  await setWorkspaceSettings(t, { kudosEmoji: "pizza" });
  await settle(t);

  expect(minutesOfLookups(t, "U_DAVE")).toEqual([0, 1, 6]);
  expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
  expect(t.slack.callsTo("chat.postEphemeral")).toEqual([]);
});

waitsOn(waits, "R16: an emoji change that a still-unknown person's recheck sees ends the attempt, whatever the emoji is later", async () => {
  const t = withSlack();
  t.slack.joiningAt("U_DAVE", at(10));
  await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
  await settleUntil(t, at(2));
  await setWorkspaceSettings(t, { kudosEmoji: "pizza" });
  await settleUntil(t, at(7));

  await setWorkspaceSettings(t, { kudosEmoji: "taco" });
  await settle(t);

  expect(minutesOfLookups(t, "U_DAVE")).toEqual([0, 1, 6]);
  expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
});

waitsOn(given, "R27: a message deleted while it waits still gives when the recheck confirms its people", async () => {
  const t = withSlack();
  t.slack.joiningAt("U_DAVE", at(5));
  await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
  await settleUntil(t, at(2));

  await deleteMessage(t, { ts: postedTs });
  await settle(t);

  expect(await kudosReceived(t, "U_DAVE")).toBe(1);
  expect(await kudosSpent(t)).toBe(1);
});

describe("R31: a newer revision while a message waits follows the edit rules", () => {
  waitsOn(waits, "an edit that withdraws the attempt stops the rechecks", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settleUntil(t, at(2));

    await edit(t, [section(text("thanks "), mention("U_DAVE"))], { ts: postedTs, editedTs: slackTs(at(2)) });
    await settle(t);

    expect(minutesOfLookups(t, "U_DAVE")).toEqual([0, 1]);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(t.slack.callsTo("chat.postEphemeral")).toEqual([]);
  });

  waitsOn(waits, "a retry that waits on someone else starts its own rechecks from the edit", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settleUntil(t, at(2));

    await edit(t, [section(mention("U_ERIN"), emoji("taco"))], { ts: postedTs, editedTs: slackTs(at(2)) });
    await settleUntil(t, at(7));
    await settle(t);

    expect(minutesOfLookups(t, "U_DAVE")).toEqual([0, 1]);
    expect(minutesOfLookups(t, "U_ERIN")).toEqual([2, 3, 8, 38, 158, 518]);
  });
});

describe("R28: team_join and user_change keep the directory fresh", () => {
  waitsOn(given, "a person who joins can receive kudos without a lookup", async () => {
    const t = withSlack();

    const response = await memberChanged(t, "team_join", { id: "U_DAVE", tz: "Europe/Berlin" });
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(response.status).toBe(200);
    expect(t.slack.callsTo("users.info").map((args) => args.user)).toEqual(["U_ALICE"]);
    expect(await kudosReceived(t, "U_DAVE")).toBe(1);
  });

  waitsOn(given, "a deactivated member no longer receives kudos", async () => {
    const t = withSlack();
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: postedTs });
    await settle(t);
    const nextTs = slackTs(at(1));

    await memberChanged(t, "user_change", { id: "U_BOB", deleted: true });
    await post(t, [section(mention("U_BOB"), emoji("taco"))], { ts: nextTs });
    await settle(t);

    expect(await kudosReceived(t, "U_BOB")).toBe(1);
    expect(t.slack.reactionsOn("C1", nextTs)).toEqual([]);
    expect(t.slack.ephemeralsTo("U_ALICE").at(-1)?.text).toBe("Nobody in this message can receive kudos: <@U_BOB> isn't an active member of this workspace. Tag a teammate and edit the message to try again.");
  });

  waitsOn(given, "a giver's new time zone decides their allowance day", async () => {
    const lateEvening = new Date("2026-10-13T23:30:00Z");
    const t = withSlack({ now: lateEvening.getTime() });
    await post(t, [section(mention("U_BOB"), emoji("taco"), emoji("taco"), emoji("taco"))], { ts: slackTs(lateEvening) });
    await settle(t);
    const nextTs = slackTs(new Date("2026-10-13T23:40:00Z"));

    await memberChanged(t, "user_change", { id: "U_ALICE", tz: "Asia/Tokyo" });
    await post(t, [section(mention("U_CAROL"), emoji("taco"))], { ts: nextTs });
    await settle(t);

    expect(await awardsTo(t, "U_CAROL")).toEqual([expect.objectContaining({ kudos: 1, day: "2026-10-14" })]);
  });

  waitsOn(waits, "R49: a redelivered team_join doesn't bring back a member deactivated in the same second", async () => {
    const t = withSlack();
    const join = memberEvent("team_join", { id: "U_DAVE" });
    await t.send("/events", join);

    await memberChanged(t, "user_change", { id: "U_DAVE", deleted: true });
    await t.send("/events", join);
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  });

  waitsOn(waits, "a member event that happened before the one the directory holds changes nothing, even within the same second", async () => {
    const t = withSlack();

    await memberChanged(t, "user_change", { id: "U_DAVE", deleted: true }, { eventTs: "1760349600.000200" });
    await memberChanged(t, "team_join", { id: "U_DAVE" }, { eventTs: "1760349600.000100" });
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  });

  waitsOn(told, "a member event older than a users.info answer changes nothing, even within the same second", async () => {
    const t = withSlack({ now: now.getTime() + 500 });
    t.slack.withMember("U_DAVE", { deleted: true });
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    await memberChanged(t, "team_join", { id: "U_DAVE" }, { eventTs: "1760349600.000100" });
    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: slackTs(at(1)) });
    await settle(t);

    expect(await kudosReceived(t, "U_DAVE")).toBe(0);
  });

  waitsOn(told, "a users.info answer still in flight when a user_change deactivates the person doesn't bring them back", async () => {
    const t = withSlack();
    t.slack.withMember("U_DAVE");
    t.slack.holdingBack("users.info", "U_DAVE", async () => {
      await memberChanged(t, "user_change", { id: "U_DAVE", deleted: true });
    });

    await post(t, [section(mention("U_DAVE"), emoji("taco"))], { ts: postedTs });
    await settle(t);

    expect(await kudosReceived(t, "U_DAVE")).toBe(0);
    expect(t.slack.reactionsOn("C1", postedTs)).toEqual([]);
    expect(t.slack.ephemeralsTo("U_ALICE").map((reply) => reply.text)).toEqual(["Nobody in this message can receive kudos: <@U_DAVE> isn't an active member of this workspace. Tag a teammate and edit the message to try again."]);
  });
});

/** Every kudos spent from a daily allowance, as today's `kudosSpent` adds them up. */
async function kudosSpent(t: TestBackend) {
  return (await t.seed.all("allowanceSpending")).reduce((sum, row) => sum + row.spent, 0);
}

function at(minutesAfterNow: number) {
  return new Date(now.getTime() + minutesAfterNow * minute);
}

function minutesOfLookups(t: TestBackend, user: string) {
  return t.slack.timesOf("users.info", (args) => args.user === user).map((time) => Math.round((time - now.getTime()) / minute));
}
