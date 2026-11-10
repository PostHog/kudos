// 13.2's own front-door steps that reach no other stack today: the `/hedgehug` profile card command's answers before
// a card is drawn, and a shared link taken in for unfolding. The card itself and the unfold wait on other stacks; their
// ported tests are beside this file (profileCard.test.ts, linkPreviews.test.ts).
import { describe, expect, test } from "vitest";
import { toDocument } from "../db/documents.ts";
import { jobs } from "../db/schema/service.ts";
import { slackReceipts } from "../db/schema/slack.ts";
import type { TestBackend } from "../../testing/backend.ts";
import { slashCommandResponseUrl } from "../../testing/slackMessages.ts";
import { flagsOn, useHugsBackend } from "./hugsTesting.ts";

const backend = useHugsBackend(new Date("2026-10-13T10:00:00Z"));

function command(t: TestBackend, user: string, text: string) {
  const body = new URLSearchParams({ team_id: "T1", channel_id: "C1", user_id: user, command: "/hedgehug", text, response_url: slashCommandResponseUrl, trigger_id: "1.2.3" });
  return t.send("/commands", body.toString(), { contentType: "application/x-www-form-urlencoded" });
}

async function pendingJobs(t: TestBackend) {
  const rows = await t.query(({ tx }) => tx.select().from(jobs));
  return rows.map((row) => toDocument<{ name: string; args: Record<string, unknown>; state: string }>(jobs, row)).filter(({ state }) => state === "pending");
}

const jobNamed = (name: string) => async (t: TestBackend) => (await pendingJobs(t)).filter((job) => job.name === name).map(({ args }) => args);
const answersUnknownTarget = jobNamed("slack.profileCardCommand.answerUnknownTarget");
const exposesOnceKnown = jobNamed("slack.commands.exposeOnceKnown");
const unfolds = jobNamed("slack.linkPreviews.unfoldLinks");

describe("the /hedgehug profile card command", () => {
  test("text that names no one is not a card request, and passes down the chain", async () => {
    const t = backend();
    await flagsOn(t, ["profile-card"]);

    const answer = await command(t, "U_NEW", "leaderboard");

    expect(answer.status).toBe(200);
    expect(await exposesOnceKnown(t)).toEqual([]);
    expect(await answersUnknownTarget(t)).toEqual([]);
  });

  test("with the card off for the workspace, a viewer Kudos doesn't know gets no card, and the flag is exposed once they're known", async () => {
    const t = backend();

    const answer = await command(t, "U_NEW", "<@U_TARGET>");

    expect(answer.status).toBe(200);
    expect(await answer.text()).not.toContain("profile card");
    expect(await exposesOnceKnown(t)).toEqual([{ workspace: "T1", user: "U_NEW", flag: "profile-card", shown: false }]);
    expect(await answersUnknownTarget(t)).toEqual([]);
  });

  test("a mention of a channel answers how to ask for a card, privately", async () => {
    const t = backend();
    await flagsOn(t, ["profile-card"]);

    const answer = await command(t, "U_NEW", "<#C1|general>");

    expect(await answer.json()).toEqual({ response_type: "ephemeral", text: "Type `/hedgehug @someone` to see their profile card." });
    expect(await exposesOnceKnown(t)).toEqual([{ workspace: "T1", user: "U_NEW", flag: "profile-card", shown: true }]);
  });

  test("a person the directory doesn't know is answered later through response_url, by a job that looks them up", async () => {
    const t = backend();
    await flagsOn(t, ["profile-card"]);

    const answer = await command(t, "U_NEW", "<@U_TARGET|target>");

    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe("");
    expect(await answersUnknownTarget(t)).toEqual([{ workspace: "T1", user: "U_NEW", arrivedAt: t.clock.now(), target: "U_TARGET", responseUrl: slashCommandResponseUrl }]);
  });
});

describe("a link shared in Slack", () => {
  const shared = (eventId: string, event: Record<string, unknown>, envelope: Record<string, unknown> = {}) =>
    t_send(eventId, { type: "link_shared", channel: "C1", user: "U_SHARER", message_ts: "1760349600.000100", links: [{ url: "https://kudos.example/album/person/1" }], ...event }, envelope);
  let t: TestBackend;
  const t_send = (eventId: string, event: Record<string, unknown>, envelope: Record<string, unknown>) =>
    t.send("/events", JSON.stringify({ type: "event_callback", team_id: "T1", event_id: eventId, event, ...envelope }));
  const receipts = () => t.query(({ tx }) => tx.select({ eventId: slackReceipts.eventId }).from(slackReceipts));

  test("is taken in once and unfolded by a job, outside a channel shared with another organization", async () => {
    t = backend();

    await shared("Ev1", {}, { is_ext_shared_channel: false });
    await shared("Ev1", {}, { is_ext_shared_channel: false });
    await shared("Ev2", {});

    expect(await unfolds(t)).toEqual([
      { workspace: "T1", sharer: "U_SHARER", links: ["https://kudos.example/album/person/1"], channel: "C1", ts: "1760349600.000100", sharedOutside: "no" },
      { workspace: "T1", sharer: "U_SHARER", links: ["https://kudos.example/album/person/1"], channel: "C1", ts: "1760349600.000100", sharedOutside: "unsaid" },
    ]);
    expect(await receipts()).toEqual([{ eventId: "Ev1" }, { eventId: "Ev2" }]);
  });

  test("in the composer, in a channel shared outside, or without links is ignored and keeps no receipt", async () => {
    t = backend();

    await shared("Ev1", { source: "composer" });
    await shared("Ev2", {}, { is_ext_shared_channel: true });
    await shared("Ev3", { links: [] });

    expect(await unfolds(t)).toEqual([]);
    expect(await receipts()).toEqual([]);
  });
});
