// Spike only, never merged. Synthetic load against the spike container's one port. No real Slack, no real data.
//
//   node load.mjs burst <site> <members> <kudos> <concurrency>   signed team_join for each member, then signed kudos messages
//   node load.mjs stream <siteA> <siteB> <seconds> [intervalMs]   one signed kudos message every intervalMs (100), to A until B answers
//                                                                 /healthz, then to B, as an edge flipping revisions would
//   node load.mjs mock                                            only the mock Slack Web API on 127.0.0.1:3412, until killed
//
// Prints one JSON line per phase. Signs with the spike's signing secret.
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const secret = process.env.SLACK_SIGNING_SECRET ?? "handshake-signing-secret";
const workspace = process.env.SLACK_WORKSPACE_ID ?? "TALLOWED";
const channel = "CSPIKE0001";
const run = randomBytes(3).toString("hex").toUpperCase();
const userOf = (i) => `USPK${run}${String(i).padStart(4, "0")}`;
const eventId = () => `EvSpk${randomBytes(8).toString("hex")}`;
const tsNow = () => (Date.now() / 1000 + Math.random() / 1000).toFixed(6);

function mockSlack() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1:3412");
    let body = { ok: true };
    if (url.pathname === "/api/users.info") {
      const user = url.searchParams.get("user") ?? "U0";
      body = { ok: true, user: { id: user, team_id: workspace, name: user, real_name: `Spike ${user}`, deleted: false, is_bot: false, tz: "Europe/Berlin", profile: { real_name: `Spike ${user}`, display_name: user } } };
    }
    if (url.pathname === "/flags/definitions") body = { flags: [], group_type_mapping: {}, cohorts: {} };
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  });
  return new Promise((resolve) => server.listen(3412, "127.0.0.1", () => resolve(server)));
}

async function signedPost(site, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
  const started = performance.now();
  try {
    const response = await fetch(`${site}/slack/events`, { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": `v0=${signature}` }, body, signal: AbortSignal.timeout(30_000) });
    await response.arrayBuffer();
    return { status: response.status, ms: performance.now() - started };
  } catch (error) {
    return { status: 0, ms: performance.now() - started, error: String(error?.cause?.code ?? error?.name ?? error) };
  }
}

const teamJoin = (user) => JSON.stringify({ type: "event_callback", team_id: workspace, event_id: eventId(), event: { type: "team_join", user: { id: user, team_id: workspace, name: user, real_name: `Spike ${user}`, profile: { real_name: `Spike ${user}`, display_name: user } }, cache_ts: Math.floor(Date.now() / 1000), event_ts: tsNow() } });
const kudos = (from, to) => JSON.stringify({ type: "event_callback", team_id: workspace, event_id: eventId(), event: { type: "message", channel, channel_type: "channel", user: from, ts: tsNow(), text: `thanks <@${to}> :taco:`, team: workspace, blocks: [{ type: "rich_text", block_id: "b1", elements: [{ type: "rich_text_section", elements: [{ type: "text", text: "thanks " }, { type: "user", user_id: to }, { type: "text", text: " " }, { type: "emoji", name: "taco" }] }] }] } });

function summary(phase, results, wallMs) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const pick = (q) => Math.round(ms[Math.min(ms.length - 1, Math.floor(q * ms.length))] ?? 0);
  const statuses = {};
  for (const r of results) statuses[r.error ?? r.status] = (statuses[r.error ?? r.status] ?? 0) + 1;
  return { phase, requests: results.length, wallMs: Math.round(wallMs), p50Ms: pick(0.5), p95Ms: pick(0.95), maxMs: Math.round(ms.at(-1) ?? 0), statuses };
}

async function pool(items, concurrency, work) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) results.push(await work(items[next++]));
  }));
  return results;
}

async function burst(site, members, count, concurrency) {
  const users = Array.from({ length: members }, (_, i) => userOf(i));
  let started = performance.now();
  const joined = await pool(users, concurrency, (user) => signedPost(site, teamJoin(user)));
  console.log(JSON.stringify(summary("team_join", joined, performance.now() - started)));
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const pairs = Array.from({ length: count }, (_, i) => [users[i % members], users[(i * 7 + 1) % members]]).filter(([a, b]) => a !== b);
  started = performance.now();
  const given = await pool(pairs, concurrency, ([from, to]) => signedPost(site, kudos(from, to)));
  console.log(JSON.stringify(summary("kudos", given, performance.now() - started)));
}

async function stream(siteA, siteB, seconds, intervalMs = 100) {
  const users = [userOf(9001), userOf(9002)];
  for (const user of users) await signedPost(siteA, teamJoin(user));
  const until = Date.now() + seconds * 1000;
  const log = [];
  let target = siteA;
  let flippedAt = null;
  const watcher = setInterval(async () => {
    if (target === siteB) return;
    if (await fetch(`${siteB}/healthz`).then((r) => r.ok, () => false)) {
      target = siteB;
      flippedAt = Date.now();
      console.log(JSON.stringify({ phase: "edge-flip", at: new Date(flippedAt).toISOString() }));
    }
  }, 100);
  const inflight = [];
  while (Date.now() < until) {
    const at = Date.now();
    const to = target;
    inflight.push(signedPost(to, kudos(users[0], users[1])).then((r) => log.push({ at, to: to === siteA ? "A" : "B", ...r })));
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  clearInterval(watcher);
  await Promise.all(inflight);
  const failed = log.filter((r) => r.status !== 200).sort((a, b) => a.at - b.at);
  console.log(JSON.stringify({ ...summary("stream", log, seconds * 1000), flippedAt: flippedAt && new Date(flippedAt).toISOString(), failed: failed.length, firstFailure: failed[0] && new Date(failed[0].at).toISOString(), lastFailure: failed.at(-1) && new Date(failed.at(-1).at).toISOString(), failuresByTarget: failed.reduce((acc, r) => ({ ...acc, [`${r.to}:${r.error ?? r.status}`]: (acc[`${r.to}:${r.error ?? r.status}`] ?? 0) + 1 }), {}) }));
}

const [mode, ...args] = process.argv.slice(2);
const server = await mockSlack();
if (mode === "mock") await new Promise(() => {});
if (mode === "burst") await burst(args[0], Number(args[1]), Number(args[2]), Number(args[3]));
if (mode === "stream") await stream(args[0], args[1], Number(args[2]), Number(args[3] ?? 100));
server.close();
