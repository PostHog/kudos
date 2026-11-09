// The harness's Slack client: what it sends reaches the front door as Slack's own request would, signed by the app's clock.
import { describe, expect, test } from "vitest";
import { createClock } from "../src/clock.ts";
import { createApp } from "../src/http/app.ts";
import type { Log } from "../src/log.ts";
import { createOperations } from "../src/operations.ts";
import { createFrontDoor, type EventCallback, type MemberClick, type SlackHandlers } from "../src/slack/frontDoor.ts";
import { useTestDatabase } from "./database.ts";
import { signingSecret, slackClient } from "./signedSlack.ts";

const database = useTestDatabase();
const quiet: Log = { info: () => {}, error: () => {} };

function setUp(handlers: SlackHandlers) {
  const clock = createClock({ real: () => Date.UTC(2026, 0, 5, 9) });
  const operations = createOperations({ pool: database.pool, clock, log: quiet });
  const slack = createFrontDoor({ signingSecret, clock, off: false, log: quiet, operations, handlers });
  const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log: quiet, clock, slack });
  return { clock, slack: slackClient(app, { clock }) };
}

describe("the harness's signed Slack requests", () => {
  test("an event arrives in Slack's envelope, each with its own ID, signed by the app's clock", async () => {
    const envelopes: EventCallback[] = [];
    const { clock, slack } = setUp({ events: { message: async (_ctx, envelope) => void envelopes.push(envelope) } });
    const real = clock.now();
    clock.advance(60 * 60_000);

    expect((await slack.event({ type: "message", text: "thanks" })).status, "signed now").toBe(200);
    expect((await slack.event({ type: "message", text: "again" }, { workspace: "T2" })).status, "another workspace").toBe(200);
    expect((await slack.event({ type: "message" }, { at: real })).status, "signed an hour ago").toBe(401);
    expect((await slack.event({ type: "message" }, { secret: "another-secret" })).status, "signed with another secret").toBe(401);

    expect(envelopes.map(({ type, team_id, event }) => [type, team_id, event.text]), "what the handler took in").toEqual([
      ["event_callback", "T1", "thanks"],
      ["event_callback", "T2", "again"],
    ]);
    expect(new Set(envelopes.map(({ event_id }) => event_id)).size, "a new event ID each").toBe(2);
  });

  test("a click, an options request and a slash command each reach their handler", async () => {
    const clicks: MemberClick[] = [];
    const commands: Array<Record<string, string>> = [];
    const { slack } = setUp({
      clicks: { homeClick: async (_ctx, click) => void clicks.push(click) },
      options: { "emoji-picker": async (_ctx, request) => [{ value: `${request.user.id}:${request.value}` }] },
      commands: { leaderboard: async (_ctx, command) => (commands.push(Object.fromEntries(command)), Response.json({ text: "the board" })) },
    });

    const clicked = await slack.interaction({ type: "block_actions", team: { id: "T1" }, user: { id: "U_CLICKER" }, trigger_id: "Tr-1", view: { type: "home" }, actions: [] });
    const options = await slack.options({ action_id: "emoji-picker", value: "ta" });
    const answered = await slack.command("leaderboard week", { user: "U_ASKER" });

    expect(clicked.status, "the click").toBe(200);
    expect(clicks.map(({ trigger_id }) => trigger_id), "the click handler").toEqual(["Tr-1"]);
    expect(await options.json(), "the options").toEqual({ options: [{ value: "U_GIVER:ta" }] });
    expect(await answered.json(), "the command's answer").toEqual({ text: "the board" });
    expect(commands, "the command's fields").toEqual([{ team_id: "T1", user_id: "U_ASKER", channel_id: "C_GENERAL", command: "/hedgehug", text: "leaderboard week" }]);
  });
});
