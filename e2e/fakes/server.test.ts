// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startFakes, type Fakes } from "./server.ts";

describe("the fakes server's Slack Web API", () => {
  let fakes: Fakes;
  beforeEach(async () => {
    fakes = await startFakes();
    await fetch(`${fakes.url}/_control/members`, { method: "POST", body: JSON.stringify({ id: "U_FORM", team_id: "T1", real_name: "Form Member" }) });
  });
  afterEach(() => fakes.stop());

  test.each([
    ["JSON", "application/json; charset=utf-8", JSON.stringify({ user: "U_FORM" })],
    ["form-encoded", "application/x-www-form-urlencoded", "user=U_FORM"],
  ])("answers %s arguments as Slack would", async (_, contentType, body) => {
    const reply = await fetch(`${fakes.url}/api/users.info`, { method: "POST", headers: { "content-type": contentType }, body });

    expect(await reply.json()).toMatchObject({ ok: true, user: { id: "U_FORM" } });
  });

  test("records a form-encoded message with its blocks parsed", async () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "Hi" } }];
    const form = new URLSearchParams({ channel: "C_FORM", text: "Hi", blocks: JSON.stringify(blocks) });
    await fetch(`${fakes.url}/api/chat.postEphemeral`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });

    const calls = await (await fetch(`${fakes.url}/_control/calls?method=chat.postEphemeral`)).json();

    expect(calls).toEqual([{ channel: "C_FORM", text: "Hi", blocks }]);
  });
});
