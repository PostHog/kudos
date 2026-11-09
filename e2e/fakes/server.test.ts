// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseDefinitions } from "../../service/src/analytics/definitions.ts";
import { flagsKey, projectToken } from "../../service/testing/fakePostHog.ts";
import { productionFlagKeys } from "./productionFlags.ts";
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

  test("records a form-encoded message with its blocks parsed and its text as written", async () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "Hi" } }];
    const form = new URLSearchParams({ channel: "C_FORM", text: "[Hi] {there}", blocks: JSON.stringify(blocks) });
    await fetch(`${fakes.url}/api/chat.postEphemeral`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });

    const calls = await (await fetch(`${fakes.url}/_control/calls?method=chat.postEphemeral`)).json();

    expect(calls).toEqual([{ channel: "C_FORM", text: "[Hi] {there}", blocks }]);
  });
});

describe("the fakes server's other roles", () => {
  test("as Slack's OpenID issuer, it sends a sign-in straight back as the member named next", async () => {
    const fakes = await startFakes();
    try {
      await fetch(`${fakes.url}/_control/next-sign-in`, { method: "POST", body: JSON.stringify({ team: "T1", user: "U_NEXT" }) });
      const discovery = await (await fetch(`${fakes.url}/.well-known/openid-configuration`)).json();
      const authorize = new URL(discovery.authorization_endpoint);
      authorize.search = new URLSearchParams({ redirect_uri: "http://app.test/api/auth/callback/slack", state: "s", nonce: "n" }).toString();

      const back = new URL((await fetch(authorize, { redirect: "manual" })).headers.get("location")!);
      const token = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: back.searchParams.get("code")!, redirect_uri: "http://app.test/api/auth/callback/slack", client_id: "mock-client", client_secret: "mock-client-secret" }).toString(),
      });
      const idToken = String((await token.json()).id_token);
      const claims = JSON.parse(Buffer.from(idToken.split(".")[1]!, "base64url").toString());

      expect(discovery.issuer).toBe(fakes.url);
      expect(back.origin + back.pathname).toBe("http://app.test/api/auth/callback/slack");
      expect(back.searchParams.get("state")).toBe("s");
      expect(claims).toMatchObject({ iss: fakes.url, nonce: "n", "https://slack.com/team_id": "T1", "https://slack.com/user_id": "U_NEXT" });
    } finally {
      await fakes.stop();
    }
  });

  test("as PostHog, it serves production's flags in a shape the service's refresh accepts", async () => {
    const fakes = await startFakes();
    try {
      const answer = await fetch(`${fakes.url}/flags/definitions?token=${projectToken}&send_cohorts`, { headers: { authorization: `Bearer ${flagsKey}` } });
      const definitions = parseDefinitions(await answer.json());

      expect(definitions?.flags.map(({ key }) => key)).toEqual([...productionFlagKeys]);
    } finally {
      await fakes.stop();
    }
  });

  test("a change to the flags answers only after the app has reloaded them", async () => {
    const reloaded: string[] = [];
    const fakes = await startFakes({ flagsChanged: async () => void reloaded.push("reloaded") });
    try {
      const answer = await fetch(`${fakes.url}/_control/flags`, { method: "POST", body: JSON.stringify([]) });

      expect(answer.ok).toBe(true);
      expect(reloaded).toEqual(["reloaded"]);
    } finally {
      await fakes.stop();
    }
  });
});
