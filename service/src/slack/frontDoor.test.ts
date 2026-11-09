import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { useTestDatabase } from "../../testing/database.ts";
import { signedRequest, signingSecret as secret, slackClient } from "../../testing/signedSlack.ts";
import { createClock } from "../clock.ts";
import { archive, jobs } from "../db/schema/service.ts";
import { slackReceipts } from "../db/schema/slack.ts";
import { createApp } from "../http/app.ts";
import { mutationJob } from "../jobs/define.ts";
import type { Log } from "../log.ts";
import { createOperations, type MutationContext } from "../operations.ts";
import { createFrontDoor, type EventKind, type SlackHandlers } from "./frontDoor.ts";

const database = useTestDatabase();
const db = drizzle({ client: database.pool });
const quiet: Log = { info: () => {}, error: () => {} };
const workspace = "T_TEST";

// A handler's lasting effect: a row in the archive table, which nothing else here touches.
async function effect({ tx, newRow }: MutationContext, what: string): Promise<void> {
  await tx.insert(archive).values({ source: "test", table: what, ...newRow(), document: "{}" });
}
async function effects(what: string): Promise<number> {
  return (await db.select().from(archive).where(eq(archive.table, what))).length;
}
const receipts = async () => (await db.select({ eventId: slackReceipts.eventId }).from(slackReceipts)).map(({ eventId }) => eventId);

function setUp(handlers: SlackHandlers, { off = false, noSecret = false } = {}) {
  const signingSecret = noSecret ? undefined : secret;
  const clock = createClock({ real: () => 1_800_000_000_000 });
  const operations = createOperations({ pool: database.pool, clock, log: quiet, retryDelayMs: () => 1 });
  const slack = createFrontDoor({ signingSecret, clock, off, log: quiet, operations, handlers });
  const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off, log: quiet, clock, slack });
  return { app, clock, ...slackClient(app, { clock, workspace }) };
}

const click = (trigger: string) => ({
  type: "block_actions",
  team: { id: workspace },
  user: { id: "U_CLICKER" },
  trigger_id: trigger,
  container: { type: "message", channel_id: "C_GENERAL", message_ts: "1.0" },
  actions: [{ type: "button", action_id: "a", value: "{}" }],
});

describe("Slack's signature", () => {
  test("a request Slack didn't sign gets 401 on every route and reaches no handler", async () => {
    const reached: string[] = [];
    const handlers: SlackHandlers = {
      events: { message: async () => void reached.push("event") },
      clicks: { homeClick: async () => void reached.push("click") },
      commands: { addToChannel: async () => (reached.push("command"), undefined) },
    };
    const { app, send, clock } = setUp(handlers);
    const body = JSON.stringify({ type: "event_callback", team_id: workspace, event_id: "Ev1", event: { type: "message" } });

    expect((await send("/events", body, { secret: "another-secret" })).status, "another secret").toBe(401);
    expect((await send("/events", body, { at: clock.now() - 6 * 60_000 })).status, "signed six minutes ago").toBe(401);
    expect((await send("/events", body, { at: clock.now() + 6 * 60_000 })).status, "signed six minutes ahead").toBe(401);
    expect((await app.request("/slack/events", { method: "POST", body })).status, "no signature").toBe(401);
    const tampered = await app.request("/slack/events", {
      method: "POST",
      headers: (await signedRequest(body, { signedAt: new Date(clock.now()) })).headers,
      body: body.replace("Ev1", "Ev2"),
    });
    expect(tampered.status, "a body changed after signing").toBe(401);
    for (const path of ["/interactivity", "/commands"]) expect((await send(path, "payload=%7B%7D", { secret: "another-secret" })).status, path).toBe(401);
    expect(reached).toEqual([]);
    expect(await receipts()).toEqual([]);
  });

  test("a request is fresh by the app's clock, which the E2E suite signs with", async () => {
    const kinds: string[] = [];
    const { clock, event } = setUp({ events: { message: async () => void kinds.push("message") } });
    const real = clock.now();
    clock.advance(60 * 60_000);

    expect((await event({ type: "message" }, { eventId: "Ev-app-time" })).status).toBe(200);
    expect((await event({ type: "message" }, { eventId: "Ev-real-time", at: real })).status).toBe(401);
    expect(kinds).toEqual(["message"]);
  });

  test("without a signing secret, Slack's routes fail with 500 rather than trust a request", async () => {
    const { event } = setUp({}, { noSecret: true });
    expect((await event({ type: "message" })).status).toBe(500);
  });
});

describe("/slack/events", () => {
  test("the URL check's challenge is answered in the response", async () => {
    const { send } = setUp({});
    const response = await send("/events", JSON.stringify({ type: "url_verification", challenge: "a-challenge", token: "t" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: "a-challenge" });
  });

  test("each event goes to the first kind of today's chain that takes it", async () => {
    const taken: Array<[string, EventKind]> = [];
    const kinds: EventKind[] = ["homeOpened", "memberChanged", "userGroupChanged", "emojiChanged", "channelCreated", "channelEvent", "linkShared", "reactionAdded", "message"];
    const events = Object.fromEntries(kinds.map((kind) => [kind, async (_ctx: MutationContext, envelope: { event: { type: string } }) => void taken.push([envelope.event.type, kind])]));
    const { event } = setUp({ events });
    const cases: Array<[Record<string, unknown>, EventKind]> = [
      [{ type: "app_home_opened", tab: "home", user: "U1" }, "homeOpened"],
      [{ type: "app_home_opened", tab: "messages", user: "U1" }, "message"],
      [{ type: "team_join", user: { id: "U1" } }, "memberChanged"],
      [{ type: "user_change", user: { id: "U1" } }, "memberChanged"],
      [{ type: "subteam_created" }, "userGroupChanged"],
      [{ type: "subteam_updated" }, "userGroupChanged"],
      [{ type: "subteam_members_changed" }, "userGroupChanged"],
      [{ type: "emoji_changed" }, "emojiChanged"],
      [{ type: "channel_created", channel: { id: "C1" } }, "channelCreated"],
      [{ type: "channel_shared" }, "channelEvent"],
      [{ type: "channel_rename" }, "channelEvent"],
      [{ type: "group_rename" }, "channelEvent"],
      [{ type: "member_joined_channel" }, "channelEvent"],
      [{ type: "link_shared", links: [] }, "linkShared"],
      [{ type: "reaction_added", reaction: "hug" }, "reactionAdded"],
      [{ type: "reaction_removed", reaction: "hug" }, "message"],
      [{ type: "message", text: "thanks" }, "message"],
      [{ type: "message", subtype: "message_changed" }, "message"],
    ];

    for (const [sent] of cases) expect((await event(sent)).status).toBe(200);

    expect(taken).toEqual(cases.map(([sent, kind]) => [sent.type, kind]));
  });

  test("an envelope that isn't a whole event callback is acknowledged and reaches no handler", async () => {
    const taken: string[] = [];
    const { send } = setUp({ events: { message: async () => void taken.push("message") } });
    const envelopes = [
      { type: "app_rate_limited", team_id: workspace, minute_rate_limited: 1 },
      { type: "event_callback", team_id: workspace, event: { type: "message" } },
      { type: "event_callback", event_id: "Ev1", event: { type: "message" } },
      { type: "event_callback", team_id: workspace, event_id: "Ev1" },
      { type: "event_callback", team_id: workspace, event_id: "Ev1", event: { text: "no type" } },
    ];
    for (const envelope of envelopes) expect((await send("/events", JSON.stringify(envelope))).status).toBe(200);
    expect(taken).toEqual([]);
  });

  test("a kind no domain registered yet is acknowledged and does nothing", async () => {
    const { event } = setUp({ events: { message: async (ctx) => effect(ctx, "message") } });
    expect((await event({ type: "reaction_added", reaction: "hug" })).status).toBe(200);
    expect(await receipts()).toEqual([]);
  });

  test("a redelivered event is taken in once: its receipt and its handler's work commit together", async () => {
    const counted = mutationJob("test.counted", z.object({ eventId: z.string() }), async () => {});
    const { event } = setUp({
      events: {
        message: async (ctx, envelope) => {
          await effect(ctx, "message");
          await ctx.jobs.enqueue(counted, { eventId: envelope.event_id });
        },
      },
    });

    expect((await event({ type: "message", text: "thanks" }, { eventId: "Ev-twice" })).status).toBe(200);
    expect((await event({ type: "message", text: "thanks" }, { eventId: "Ev-twice" })).status).toBe(200);

    expect(await effects("message")).toBe(1);
    expect(await db.select({ name: jobs.name }).from(jobs)).toEqual([{ name: "test.counted" }]);
    expect(await receipts()).toEqual(["Ev-twice"]);
  });

  test("the same event ID in another workspace is another event", async () => {
    const { send } = setUp({ events: { message: async (ctx) => effect(ctx, "message") } });
    for (const team of ["T_ONE", "T_TWO"]) await send("/events", JSON.stringify({ type: "event_callback", team_id: team, event_id: "Ev-same", event: { type: "message" } }));
    expect(await effects("message")).toBe(2);
  });

  test("an event its handler ignored keeps no receipt, so its redelivery is handled again", async () => {
    let calls = 0;
    const { event } = setUp({ events: { message: async () => (calls++, "ignored") } });

    await event({ type: "message", text: "no kudos here" }, { eventId: "Ev-ignored" });
    await event({ type: "message", text: "no kudos here" }, { eventId: "Ev-ignored" });

    expect(calls).toBe(2);
    expect(await receipts()).toEqual([]);
  });

  test("a handler that fails keeps no receipt and answers 500, so Slack's redelivery is taken in", async () => {
    let failing = true;
    const { event } = setUp({
      events: {
        message: async (ctx) => {
          await effect(ctx, "message");
          if (failing) throw new TypeError("the handler broke");
        },
      },
    });

    expect((await event({ type: "message" }, { eventId: "Ev-retried" })).status).toBe(500);
    expect(await receipts()).toEqual([]);
    failing = false;
    expect((await event({ type: "message" }, { eventId: "Ev-retried" })).status).toBe(200);

    expect(await effects("message")).toBe(1);
    expect(await receipts()).toEqual(["Ev-retried"]);
  });

  test("two deliveries of one event at the same moment are taken in once", async () => {
    // Both first attempts read no receipt before either writes one; Postgres fails one of them, and its re-run finds
    // the other's receipt.
    let arrived = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => (release = resolve));
    const { event } = setUp({
      events: {
        message: async (ctx) => {
          if (++arrived === 2) release();
          if (arrived <= 2) await Promise.race([bothRead, new Promise((resolve) => setTimeout(resolve, 2_000))]);
          await effect(ctx, "message");
        },
      },
    });

    const answers = await Promise.all([event({ type: "message" }, { eventId: "Ev-race" }), event({ type: "message" }, { eventId: "Ev-race" })]);

    expect(answers.map(({ status }) => status)).toEqual([200, 200]);
    expect(arrived, "both deliveries reached the handler before either committed").toBeGreaterThanOrEqual(2);
    expect(await effects("message")).toBe(1);
    expect(await receipts()).toEqual(["Ev-race"]);
  });
});

describe("/slack/interactivity", () => {
  test("an external select's options are answered in the response, by its action ID", async () => {
    const { options, clock } = setUp({ options: { "emoji-picker": async (ctx, request) => [{ value: `${request.value}@${ctx.now}` }] } });
    const ask = (action_id: string) => options({ action_id, value: "ta" });

    const answered = await ask("emoji-picker");
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({ options: [{ value: `ta@${clock.now()}` }] });
    expect(await (await ask("another-select")).json()).toEqual({ options: [] });
    for (const inherited of ["toString", "constructor", "__proto__", "hasOwnProperty"]) expect(await (await ask(inherited)).json(), inherited).toEqual({ options: [] });
  });

  test("a member's click runs its handlers in order in one transaction, once per trigger", async () => {
    const order: string[] = [];
    const { interaction } = setUp({
      clicks: {
        homeClick: async (ctx) => (order.push("homeClick"), effect(ctx, "homeClick")),
        dmLinkClick: async () => (order.push("dmLinkClick"), "ignored"),
      },
    });

    expect((await interaction(click("Tr-1"))).status).toBe(200);
    expect((await interaction(click("Tr-1"))).status).toBe(200);
    expect((await interaction({ ...click("Tr-2"), container: { type: "view" }, view: { type: "home" } })).status).toBe(200);

    expect(order).toEqual(["dmLinkClick", "homeClick", "dmLinkClick", "homeClick"]);
    expect(await effects("homeClick")).toBe(2);
    expect(await receipts()).toEqual(["Tr-1", "Tr-2"]);
  });

  test("a click every handler ignored keeps no receipt", async () => {
    let calls = 0;
    const { interaction } = setUp({ clicks: { homeClick: async () => (calls++, "ignored") } });
    await interaction(click("Tr-ignored"));
    await interaction(click("Tr-ignored"));
    expect(calls).toBe(2);
    expect(await receipts()).toEqual([]);
  });

  test("a payload that isn't a member's click is acknowledged and reaches no handler", async () => {
    let calls = 0;
    const { interaction, send } = setUp({ clicks: { homeClick: async () => void calls++ } });
    const notClicks = [
      { type: "view_submission", team: { id: workspace }, user: { id: "U1" }, trigger_id: "Tr-1" },
      { ...click("Tr-1"), container: { type: "view" }, view: { type: "modal" } },
      { ...click("Tr-1"), trigger_id: undefined },
    ];
    for (const payload of notClicks) expect((await interaction(payload)).status).toBe(200);
    expect((await send("/interactivity", "no-payload=1", { contentType: "application/x-www-form-urlencoded" })).status).toBe(200);
    expect(calls).toBe(0);
  });
});

describe("/slack/commands", () => {
  test("a command goes down the chain until a handler answers it", async () => {
    const asked: Array<[string, number, string | null]> = [];
    const { command, clock } = setUp({
      commands: {
        addToChannel: async () => (asked.push(["addToChannel", 0, null]), undefined),
        leaderboard: async ({ arrivedAt }, sent) => (asked.push(["leaderboard", arrivedAt, sent.get("text")]), Response.json({ text: "the board" })),
        profileCard: async ({ arrivedAt }, sent) => (asked.push(["profileCard", arrivedAt, sent.get("text")]), undefined),
      },
    });

    const answer = await command("leaderboard week");

    expect(await answer.json()).toEqual({ text: "the board" });
    expect(asked).toEqual([
      ["profileCard", clock.now(), "leaderboard week"],
      ["leaderboard", clock.now(), "leaderboard week"],
    ]);
  });

  test("a command no handler answers is acknowledged with an empty 200", async () => {
    const { command } = setUp({ commands: { addToChannel: async ({ operations }) => (await operations.mutation("test.add", (ctx) => effect(ctx, "added")), undefined) } });
    const answer = await command("");
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe("");
    expect(await effects("added")).toBe(1);
  });
});

describe("handlers by kind", () => {
  test("only a kind's own handler runs: a handlers object with a prototype lends it none", async () => {
    const inherited: SlackHandlers = {
      events: Object.create({ message: async (ctx: MutationContext) => effect(ctx, "inherited") }),
      clicks: Object.create({ homeClick: async (ctx: MutationContext) => effect(ctx, "inherited") }),
      commands: Object.create({ profileCard: async () => Response.json({ text: "inherited" }) }),
    };
    const { event, interaction, command } = setUp(inherited);

    expect((await event({ type: "message" })).status).toBe(200);
    expect((await interaction(click("Tr-proto"))).status).toBe(200);
    expect(await (await command("")).text()).toBe("");
    expect(await effects("inherited")).toBe(0);
    expect(await receipts()).toEqual([]);
  });
});

describe("HEDGEHUG_OFF", () => {
  test("Slack's routes answer the challenge and 200, check the signature, and reach no handler", async () => {
    let calls = 0;
    const counted = async () => void calls++;
    const { send, event, interaction, options, command } = setUp(
      { events: { message: counted }, clicks: { homeClick: counted }, options: { picker: async () => (calls++, []) }, commands: { addToChannel: async () => (calls++, undefined) } },
      { off: true },
    );

    expect(await (await send("/events", JSON.stringify({ type: "url_verification", challenge: "off-challenge" }))).json()).toEqual({ challenge: "off-challenge" });
    expect((await event({ type: "message" })).status).toBe(200);
    expect((await interaction(click("Tr-off"))).status).toBe(200);
    expect((await options({ action_id: "picker", value: "" })).status).toBe(200);
    expect((await command("")).status).toBe(200);
    expect((await send("/events", "{}", { secret: "another-secret" })).status).toBe(401);
    expect(calls).toBe(0);
    expect(await receipts()).toEqual([]);
  });

  test("with no signing secret set either, Slack's routes answer 200", async () => {
    const { app } = setUp({}, { off: true, noSecret: true });
    for (const path of ["/slack/events", "/slack/interactivity", "/slack/commands"]) expect((await app.request(path, { method: "POST", body: "{}" })).status).toBe(200);
  });
});
