// The resource proof (spec #110): the service, booted as the image boots it, answers Slack within Slack's ack deadline
// while cards draw on the renderer thread and a job runs, and stays inside the host's memory limit while it does.
// service/scripts/check-image.sh runs it in the image under the host's limits, beside a database. It prints one JSON
// line of what it measured and exits 1 when an ack came late or failed, a card failed to draw, or the job failed.
// The acks are sent from this process, so a stalled event loop would hold the sender too and hide its own stall from the
// acks' timings: the proof also holds the loop's longest delay under the ack deadline, and asks for acks all through the
// drawing.
// Usage: DATABASE_URL=… node scripts/resourceProof.ts
import { readFile } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { signedRequest } from "../testing/signedSlack.ts";
import { boot } from "../src/boot.ts";
import type { Log } from "../src/log.ts";
import { cardWordsOf } from "../src/slack/cardDrawing.ts";
import { renderedCard } from "../src/slack/cardRenderer.ts";
import type { DrawnCard } from "../src/slack/playerCard.ts";

/** Slack retries an event its app hasn't acknowledged within 3 s. */
const ackDeadlineMs = 3_000;
const cards = 30;
const ackEveryMs = 100;
/** Acks sent while the cards draw: a burst of 30 takes seconds even on a fast host, so fewer means the loop stalled. */
const acksWhileDrawing = 5;
const secret = "resource-proof";

const card: DrawnCard = {
  name: "Wren Alder",
  face: { picture: null, initials: "WA" },
  level: { level: 8, xp: 2310, share: 0.62 },
  team: { name: "Kettle Works", crest: null },
  place: { rank: 1, tied: false, kudosGiven: 7 },
  hoggies: { found: 64, total: 151, rarest: { name: "Wizard", rarity: "legendary", picture: "https://hedgehug.example/share/wizard.png", foundAt: Date.UTC(2026, 9, 3) } },
  people: { held: 24, newest: [{ picture: null, initials: "IF" }, { picture: null, initials: "BO" }] },
  emojis: { count: 7, pictures: [] },
  medals: { count: 4, best: ["gold", "silver", "bronze"] },
};

const quiet: Log = { info: () => {}, error: (message, fields) => console.error(JSON.stringify({ message, ...fields })) };
const mib = (bytes: number) => Math.round(bytes / 1_048_576);

const service = await boot({ env: { ...process.env, PORT: "0", SLACK_SIGNING_SECRET: secret, HEDGEHUG_OFF: "" }, log: quiet });
await service.migrated;
const base = `http://127.0.0.1:${service.port}`;

// The container's own count, the renderer thread and anything else in it included, where the host's cgroup shows it.
const cgroupBytes = async () => Number((await readFile("/sys/fs/cgroup/memory.current", "utf8").catch(() => "NaN")).trim());
let peakRss = 0;
let peakCgroup = 0;
const sampler = setInterval(async () => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const inCgroup = await cgroupBytes();
  if (Number.isFinite(inCgroup)) peakCgroup = Math.max(peakCgroup, inCgroup);
}, 50);
const rssAtStart = process.memoryUsage().rss;

const delay = monitorEventLoopDelay({ resolution: 10 });
delay.enable();

let event = 0;
async function ack(): Promise<{ status: number; ms: number }> {
  const body = JSON.stringify({ type: "event_callback", team_id: "T_PROOF", event_id: `EvProof${++event}`, event_time: Math.floor(Date.now() / 1000), event: { type: "pin_added", user: "U_PROOF", channel_id: "C_PROOF", event_ts: `${event}.000100` } });
  const started = performance.now();
  const answer = await fetch(`${base}/slack/events`, await signedRequest(body, { secret }));
  await answer.arrayBuffer();
  return { status: answer.status, ms: performance.now() - started };
}

// Every card asked for at once, as a burst of shares would: the renderer takes them one at a time.
const drawing = Promise.all(Array.from({ length: cards }, (_, n) => renderedCard({ ...card, name: `Wren ${n}` }, { face: null, crest: null, rarest: null, people: [], emojis: [] }, cardWordsOf({ ...card, name: `Wren ${n}` }))));
const job = service.worker!.runCron("slack.receipts.deleteExpired", 25_000);
const acks: Array<{ status: number; ms: number }> = [];
let drawn = false;
const pictures = drawing.finally(() => (drawn = true));
while (!drawn) {
  acks.push(await ack());
  await new Promise((resolve) => setTimeout(resolve, ackEveryMs));
}
const [rendered, ran] = await Promise.all([pictures.then((all) => all.length, (error: unknown) => (console.error(String(error)), 0)), job.then((settled) => settled !== undefined, () => false)]);

delay.disable();
clearInterval(sampler);
peakRss = Math.max(peakRss, process.memoryUsage().rss);
const slowest = Math.max(...acks.map(({ ms }) => ms));
const failed = acks.filter(({ status }) => status !== 200).length;
const result = {
  cards: rendered,
  job: ran,
  acks: acks.length,
  acksFailed: failed,
  slowestAckMs: Math.round(slowest),
  eventLoopDelayMs: { p99: Math.round(delay.percentile(99) / 1e6), max: Math.round(delay.max / 1e6) },
  rssMiB: { start: mib(rssAtStart), peak: mib(peakRss) },
  cgroupPeakMiB: peakCgroup === 0 ? null : mib(peakCgroup),
};
console.log(JSON.stringify(result));
await service.stop();
const proven = rendered === cards && ran && acks.length >= acksWhileDrawing && failed === 0 && slowest < ackDeadlineMs && result.eventLoopDelayMs.max < ackDeadlineMs;
process.exit(proven ? 0 : 1);
