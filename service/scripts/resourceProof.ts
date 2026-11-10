// The resource proof (spec #110): the service, booted as the image boots it, answers Slack within Slack's ack deadline
// while cards draw on the renderer thread and a job works through a backlog, and stays inside the host's memory limit
// while it does. service/scripts/check-image.sh runs it in the image under the host's limits, on a database of its own,
// where docker ends the container when its memory, swap included, passes the limit. It prints one JSON line of what it
// measured and exits 1 when an ack came late or failed, too few acks landed, the event loop stalled past the ack
// deadline, a card failed to draw, or the job failed, left work behind or ran apart from the drawing.
//
// The acks go out from a thread of their own, so they time the service as Slack would: a sender on the service's own
// event loop would stall with it and miss its own stall. The loop's delay is measured as well, primed before any work.
// Usage: DATABASE_URL=… node scripts/resourceProof.ts
import { readFile } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { lt } from "drizzle-orm";
import { boot } from "../src/boot.ts";
import { slackReceipts } from "../src/db/schema/slack.ts";
import type { Log } from "../src/log.ts";
import { cardWordsOf } from "../src/slack/cardDrawing.ts";
import { renderedCard } from "../src/slack/cardRenderer.ts";
import type { DrawnCard } from "../src/slack/playerCard.ts";

/** Slack retries an event its app hasn't acknowledged within 3 s. */
const ackDeadlineMs = 3_000;
const cards = 30;
const ackEveryMs = 100;
/** Acks sent while the cards draw and the job runs: the burst takes seconds even on a fast host. */
const acksAtLeast = 5;
/** Receipts past their week: the cron drops them 500 to a run, so the job runs again and again beside the drawing. */
const expiredReceipts = 20_000;
const jobBudgetMs = 120_000;
const secret = "resource-proof";
const weekMs = 7 * 24 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

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
const noArt = { face: null, crest: null, rarest: null, people: [], emojis: [] };

const quiet: Log = { info: () => {}, error: (message, fields) => console.error(JSON.stringify({ message, ...fields })) };
const mib = (bytes: number) => Math.round(bytes / 1_048_576);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const service = await boot({ env: { ...process.env, PORT: "0", SLACK_SIGNING_SECRET: secret, HEDGEHUG_OFF: "" }, log: quiet });
await service.migrated;
const operations = service.operations!;
const worker = service.worker!;

const expiredLeft = () =>
  operations.query("resourceProof.expiredLeft", async ({ tx, now }) => (await tx.select({ _id: slackReceipts._id }).from(slackReceipts).where(lt(slackReceipts._creationTime, now - weekMs))).length);
await operations.mutation("resourceProof.seed", async ({ tx, now, newRow }) => {
  for (let from = 0; from < expiredReceipts; from += 1_000) {
    const rows = Array.from({ length: Math.min(1_000, expiredReceipts - from) }, (_, n) => ({ ...newRow(), _creationTime: now - weekMs - dayMs - from - n, workspace: "T_PROOF", eventId: `EvOld${from + n}` }));
    await tx.insert(slackReceipts).values(rows);
  }
});
const seeded = await expiredLeft();

// The container's own count, the renderer thread and anything else in it included, where the host's cgroup shows it.
const cgroupFile = async (name: string) => Number((await readFile(`/sys/fs/cgroup/${name}`, "utf8").catch(() => "NaN")).trim());
let peakRss = 0;
let sampledCgroup = 0;
const sampler = setInterval(async () => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const inCgroup = await cgroupFile("memory.current");
  if (Number.isFinite(inCgroup)) sampledCgroup = Math.max(sampledCgroup, inCgroup);
}, 50);
const rssAtStart = process.memoryUsage().rss;

// Primed: the histogram's timer is armed and has fired before any work can hold the loop.
const delay = monitorEventLoopDelay({ resolution: 10 });
delay.enable();
await pause(200);
delay.reset();

const sender = new Worker(
  `const { parentPort, workerData } = require("node:worker_threads");
const { createHmac } = require("node:crypto");
let stopping = false;
parentPort.on("message", () => (stopping = true));
(async () => {
  const acks = [];
  for (let event = 1; !stopping; event++) {
    const body = JSON.stringify({ type: "event_callback", team_id: "T_PROOF", event_id: "EvProof" + event, event_time: Math.floor(Date.now() / 1000), event: { type: "pin_added", user: "U_PROOF", channel_id: "C_PROOF", event_ts: event + ".000100" } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", workerData.secret).update("v0:" + timestamp + ":" + body).digest("hex");
    const started = performance.now();
    try {
      const answer = await fetch(workerData.url, { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": "v0=" + signature }, body, signal: AbortSignal.timeout(10000) });
      await answer.arrayBuffer();
      acks.push({ status: answer.status, ms: performance.now() - started });
    } catch {
      acks.push({ status: 0, ms: performance.now() - started });
    }
    await new Promise((resolve) => setTimeout(resolve, workerData.everyMs));
  }
  parentPort.postMessage(acks);
})();`,
  { eval: true, workerData: { url: `http://127.0.0.1:${service.port}/slack/events`, secret, everyMs: ackEveryMs } },
);
const acksSent = new Promise<Array<{ status: number; ms: number }>>((resolve, reject) => {
  sender.once("message", resolve);
  sender.once("error", reject);
});

// Every card asked for at once, as a burst of shares would: the renderer takes them one at a time. The job starts once
// the first card is drawn, so the thread is up and drawing the rest while the job runs.
const drawing = Array.from({ length: cards }, (_, n) => renderedCard({ ...card, name: `Wren ${n}` }, noArt, cardWordsOf({ ...card, name: `Wren ${n}` })));
let drawingDone = false;
const pictures = Promise.all(drawing).finally(() => (drawingDone = true));
const job = drawing[0]!.then(() => ({ startedWhileDrawing: !drawingDone, settled: worker.runCron("slack.receipts.deleteExpired", jobBudgetMs) }));
const [rendered, ran] = await Promise.all([
  pictures.then(
    (all) => all.length,
    (error: unknown) => (console.error(String(error)), 0),
  ),
  job.then(
    async ({ startedWhileDrawing, settled }) => ({ startedWhileDrawing, settled: await settled }),
    (error: unknown) => (console.error(String(error)), { startedWhileDrawing: false, settled: undefined }),
  ),
]);
sender.postMessage("stop");
const acks = await acksSent;
await sender.terminate();

delay.disable();
clearInterval(sampler);
peakRss = Math.max(peakRss, process.memoryUsage().rss);
const peakCgroup = await cgroupFile("memory.peak");
const left = await expiredLeft();
const jobDone = ran.settled?.done === true && ran.settled.ran.includes("slack.receipts.deleteExpired") && left === 0;
const slowest = Math.max(...acks.map(({ ms }) => ms));
const failed = acks.filter(({ status }) => status !== 200).length;
const result = {
  cards: rendered,
  job: { done: jobDone, startedWhileDrawing: ran.startedWhileDrawing, runs: ran.settled?.ran.length ?? 0, expiredSeeded: seeded, expiredLeft: left },
  acks: acks.length,
  acksFailed: failed,
  slowestAckMs: Math.round(slowest),
  eventLoopDelayMs: { p99: Math.round(delay.percentile(99) / 1e6), max: Math.round(delay.max / 1e6) },
  rssMiB: { start: mib(rssAtStart), peak: mib(peakRss) },
  cgroupPeakMiB: Number.isFinite(peakCgroup) ? { peak: mib(peakCgroup) } : sampledCgroup === 0 ? null : { sampledEvery50ms: mib(sampledCgroup) },
};
console.log(JSON.stringify(result));
await service.stop();
const proven =
  rendered === cards && seeded === expiredReceipts && jobDone && ran.startedWhileDrawing && acks.length >= acksAtLeast && failed === 0 && slowest < ackDeadlineMs && result.eventLoopDelayMs.max < ackDeadlineMs;
process.exit(proven ? 0 : 1);
