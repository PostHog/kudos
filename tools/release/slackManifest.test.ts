// @vitest-environment node
// The manifest step as the workflow runs it, against a local stand-in for Slack's manifest API and for the app's
// events route.
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { renderManifest } from "../../slack-app/manifest.ts";

const cli = fileURLToPath(new URL("./slackManifest.ts", import.meta.url));
const signingSecret = "signing-secret";
const token = "service-token";
let servers: Server[];
let dir: string;

beforeEach(() => {
  servers = [];
  dir = mkdtempSync(join(tmpdir(), "slack-manifest-"));
});

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  rmSync(dir, { recursive: true, force: true });
});

async function listen(handle: (path: string, body: string, headers: Record<string, string | string[] | undefined>) => { status?: number; json: unknown }) {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const { status = 200, json } = handle(request.url ?? "", body, request.headers);
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// The app's events route: answers Slack's URL check only when Slack's signature holds.
const appAnswering = () =>
  listen((_, body, headers) => {
    const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${headers["x-slack-request-timestamp"]}:${body}`).digest("hex")}`;
    return headers["x-slack-signature"] === expected ? { json: { challenge: JSON.parse(body).challenge } } : { status: 401, json: {} };
  });

// Slack's manifest API for one app, holding `held`, recording each call's method and arguments.
async function slackHolding(held: unknown, { permissionsUpdated = false } = {}) {
  const calls: { method: string; args: Record<string, string>; authorization: string | undefined }[] = [];
  let current = held;
  const url = await listen((path, body, headers) => {
    const method = path.slice(1);
    const args = Object.fromEntries(new URLSearchParams(body));
    calls.push({ method, args, authorization: headers.authorization as string | undefined });
    if (args.app_id !== "A_SANDBOX") return { json: { ok: false, error: "app_not_found" } };
    if (method === "apps.manifest.export") return { json: { ok: true, manifest: current } };
    if (method === "apps.manifest.validate") return { json: { ok: true } };
    if (method === "apps.manifest.update") return (current = JSON.parse(args.manifest!)), { json: { ok: true, app_id: args.app_id, permissions_updated: permissionsUpdated } };
    return { json: { ok: false, error: "unknown_method" } };
  });
  return { url, calls };
}

function run(env: Record<string, string>) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) =>
    execFile(process.execPath, [cli], { env: { PATH: process.env.PATH!, ...env } }, (error, stdout, stderr) => resolve({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr })),
  );
}

describe("the manifest step", () => {
  test("moves the sandbox app to the app's new URLs, with the service token and the app's id, and writes what changed to the run's summary", async () => {
    const appUrl = await appAnswering();
    const slack = await slackHolding(renderManifest("sandbox", "https://old-host.example"));
    const summary = join(dir, "summary.md");
    writeFileSync(summary, "");

    const { code, stdout } = await run({ APP: "sandbox", APP_URL: appUrl, APP_ID: "A_SANDBOX", SLACK_SERVICE_TOKEN: token, SIGNING_SECRET: signingSecret, SLACK_API_URL: slack.url, APPLY: "true", GITHUB_STEP_SUMMARY: summary });

    expect(code).toBe(0);
    expect(slack.calls.map(({ method }) => method)).toEqual(["apps.manifest.export", "apps.manifest.validate", "apps.manifest.update", "apps.manifest.export"]);
    expect(slack.calls.every(({ authorization, args }) => authorization === `Bearer ${token}` && args.app_id === "A_SANDBOX" && args.token === undefined)).toBe(true);
    expect(JSON.parse(slack.calls[2]!.args.manifest!)).toEqual(renderManifest("sandbox", appUrl));
    expect(readFileSync(summary, "utf8")).toContain(`- settings.event_subscriptions.request_url: "https://old-host.example/slack/events" → "${appUrl}/slack/events"`);
    expect(stdout).toContain("::notice::The events URL moved");
  });

  test("without APPLY it plans only, and sends nothing", async () => {
    const appUrl = await appAnswering();
    const slack = await slackHolding(renderManifest("sandbox", "https://old-host.example"));

    const { code, stdout } = await run({ APP: "sandbox", APP_URL: appUrl, APP_ID: "A_SANDBOX", SLACK_SERVICE_TOKEN: token, SIGNING_SECRET: signingSecret, SLACK_API_URL: slack.url });

    expect(code).toBe(0);
    expect(stdout).toContain("The sandbox Slack app would change (not sent: APPLY is not true).");
    expect(stdout, "nothing moved yet").toContain("::notice::Once applied, the events URL moves");
    expect(stdout).not.toContain("The events URL moved");
    expect(slack.calls.map(({ method }) => method)).not.toContain("apps.manifest.update");
  });

  test("asks for a reinstall only when the manifest adds a scope, and reports Slack's own permissions flag apart", async () => {
    const appUrl = await appAnswering();
    const held = renderManifest("sandbox", appUrl);
    const fewer = { ...held, oauth_config: { ...held.oauth_config, scopes: { ...held.oauth_config.scopes, bot: held.oauth_config.scopes.bot.slice(1) } } };
    const env = { APP: "sandbox", APP_URL: appUrl, APP_ID: "A_SANDBOX", SLACK_SERVICE_TOKEN: token, SIGNING_SECRET: signingSecret, APPLY: "true" };

    const added = await run({ ...env, SLACK_API_URL: (await slackHolding(fewer, { permissionsUpdated: true })).url });
    expect(added.code).toBe(0);
    expect(added.stdout).toContain(`::warning::The sandbox app now asks for oauth_config.scopes.bot ${held.oauth_config.scopes.bot[0]}: a workspace admin reinstalls it before that works`);

    const moved = await run({ ...env, SLACK_API_URL: (await slackHolding(renderManifest("sandbox", "https://old-host.example"), { permissionsUpdated: true })).url });
    expect(moved.code).toBe(0);
    expect(moved.stdout).not.toContain("::warning::");
    expect(moved.stdout).toContain("::notice::Slack marked the sandbox app's permissions as updated, with no scope added");
  });

  test("sends nothing when the app doesn't answer Slack's URL check with its signing secret", async () => {
    const appUrl = await appAnswering();
    const slack = await slackHolding(renderManifest("sandbox", "https://old-host.example"));

    const { code, stderr } = await run({ APP: "sandbox", APP_URL: appUrl, APP_ID: "A_SANDBOX", SLACK_SERVICE_TOKEN: token, SIGNING_SECRET: "another-secret", SLACK_API_URL: slack.url, APPLY: "true" });

    expect(code).toBe(1);
    expect(stderr).toContain(`${appUrl}/slack/events doesn't answer Slack's URL check`);
    expect(slack.calls.map(({ method }) => method)).not.toContain("apps.manifest.update");
  });

  test("renders the production app's manifest, under the product's own name, for production", async () => {
    const appUrl = await appAnswering();
    const slack = await slackHolding(renderManifest("real", "https://old-host.example"));

    const { code } = await run({ APP: "production", APP_URL: appUrl, APP_ID: "A_SANDBOX", SLACK_SERVICE_TOKEN: token, SIGNING_SECRET: signingSecret, SLACK_API_URL: slack.url, APPLY: "true" });

    expect(code).toBe(0);
    expect(JSON.parse(slack.calls[2]!.args.manifest!)).toEqual(renderManifest("real", appUrl));
  });

  test("stops at Slack's error, naming it", async () => {
    const slack = await slackHolding(renderManifest("sandbox", "https://old-host.example"));

    const { code, stderr } = await run({ APP: "sandbox", APP_URL: "https://new-host.example", APP_ID: "A_OTHER", SLACK_SERVICE_TOKEN: token, SIGNING_SECRET: signingSecret, SLACK_API_URL: slack.url, APPLY: "true" });

    expect(code).toBe(1);
    expect(stderr).toContain("Slack answered apps.manifest.export with app_not_found");
  });
});
