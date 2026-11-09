// The Slack manifest workflow's step (.github/workflows/slack-manifest.yml): renders the app's manifest for the app's
// URL and moves the Slack app to it through Slack's manifest API. `node tools/release/slackManifest.ts`, configured by
// env: APP (sandbox or production), APP_URL, APP_ID, SLACK_SERVICE_TOKEN, SIGNING_SECRET, and APPLY=true to send it.
import { createHmac, randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { renderManifest } from "../../slack-app/manifest.ts";
import { updateManifest, type Manifest, type ManifestApi } from "./manifestUpdate.ts";

const need = (name: string) => process.env[name] || fail(`${name} is not set`);
const app = need("APP");
if (app !== "sandbox" && app !== "production") fail(`APP must be sandbox or production, not ${app}`);
const slackApi = process.env.SLACK_API_URL || "https://slack.com/api";

async function slack<Answer>(method: string, args: Record<string, string>): Promise<Answer> {
  const answer = await fetch(`${slackApi}/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${need("SLACK_SERVICE_TOKEN")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ app_id: need("APP_ID"), ...args }),
  });
  const body = (await answer.json()) as { ok: boolean; error?: string; errors?: { message: string; pointer?: string }[] } & Answer;
  // Validation answers ok: false with the manifest's errors, which are the answer, not a failure of the call.
  if (!body.ok && !(method === "apps.manifest.validate" && body.errors)) throw new Error(`Slack answered ${method} with ${body.error ?? answer.status}`);
  return body;
}

const api: ManifestApi = {
  export: async () => (await slack<{ manifest: Manifest }>("apps.manifest.export", {})).manifest,
  validate: async (manifest) => ((await slack<{ errors?: { message: string; pointer?: string }[] }>("apps.manifest.validate", { manifest: JSON.stringify(manifest) })).errors ?? []).map(({ message, pointer }) => (pointer ? `${pointer}: ${message}` : message)),
  update: async (manifest) => ({ permissionsUpdated: (await slack<{ permissions_updated?: boolean }>("apps.manifest.update", { manifest: JSON.stringify(manifest) })).permissions_updated === true }),
};

// Slack's URL check, as Slack sends it: a signed url_verification whose challenge the app must answer.
async function answersSlack(url: string) {
  const challenge = randomUUID();
  const body = JSON.stringify({ token: "unused", challenge, type: "url_verification" });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `v0=${createHmac("sha256", need("SIGNING_SECRET")).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  try {
    const answer = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": signature }, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return answer.status === 200 && ((await answer.json()) as { challenge?: string }).challenge === challenge;
  } catch {
    return false;
  }
}

function report(lines: string[]) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function fail(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

try {
  const manifest = renderManifest(app === "production" ? "real" : "sandbox", need("APP_URL"));
  const { outcome, changes, scopesAdded, permissionsUpdated } = await updateManifest({ api, manifest, apply: process.env.APPLY === "true", answersSlack });
  const said = { current: "already holds this manifest", planned: "would change (not sent: APPLY is not true)", updated: "changed" }[outcome];
  report([`The ${app} Slack app ${said}.`, ...changes.map(({ path, from, to }) => `- ${path}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`)]);
  const sent = outcome === "updated";
  // A new scope is what a reinstall approves; Slack's own flag also rises on changes that need none, such as a moved redirect URL.
  if (scopesAdded.length > 0) console.log(`::warning::The ${app} app ${sent ? "now asks" : "would ask"} for ${scopesAdded.join(", ")}: a workspace admin reinstalls it before that works`);
  else if (permissionsUpdated) console.log(`::notice::Slack marked the ${app} app's permissions as updated, with no scope added; no reinstall is needed for this change`);
  if (changes.some(({ path }) => path === "settings.event_subscriptions.request_url")) console.log(sent ? `::notice::The events URL moved; check Slack's Event Subscriptions page for the ${app} app and the app's request log for the first event` : `::notice::Once applied, the events URL moves; then check Slack's Event Subscriptions page for the ${app} app and the app's request log for the first event`);
} catch (failure) {
  fail(failure instanceof Error ? failure.message : String(failure));
}
