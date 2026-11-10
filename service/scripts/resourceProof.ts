// The resource proof (spec #110): the service, booted as the image boots it, answers Slack within Slack's ack deadline
// while cards draw on the renderer thread and a job works through a backlog, and stays inside the host's memory limit
// while it does. service/scripts/check-image.sh runs it in the image under the host's limits, on a database of its own,
// where docker ends the container when its memory, swap included, passes the limit. It prints one JSON line of what it
// measured and exits 1 when an ack came late or failed, too few acks landed, the event loop stalled past the ack
// deadline, a card failed to draw, a run of the job failed, the job left work behind or no run of it finished while
// cards drew, or the container's swap wasn't held at zero.
//
// The acks go out from a thread of their own, one every 100 ms whatever the last one's answer, so they time the service
// as Slack would: a sender on the service's own event loop would stall with it and miss its own stall. The loop's delay
// is measured as well, primed before any work. The job's runs are judged by what the jobs table records of them.
// Usage: DATABASE_URL=… node scripts/resourceProof.ts
import { readFile } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { eq, lt } from "drizzle-orm";
import { boot } from "../src/boot.ts";
import { jobs } from "../src/db/schema/service.ts";
import { slackReceipts } from "../src/db/schema/slack.ts";
import type { Log } from "../src/log.ts";
import { cardWordsOf } from "../src/slack/cardDrawing.ts";
import { renderedCard } from "../src/slack/cardRenderer.ts";
import type { DrawnCard } from "../src/slack/playerCard.ts";

/** Slack retries an event its app hasn't acknowledged within 3 s. */
const ackDeadlineMs = 3_000;
const cards = 30;
const ackEveryMs = 100;
/** Acks sent while the cards draw: the burst takes seconds even on a fast host. */
const acksAtLeast = 5;
const job = "slack.receipts.deleteExpired";
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
// Counted as inserted: the service's own daily run of the cron may take some of them before the proof's run does.
const seeded = await operations.mutation("resourceProof.seed", async ({ tx, now, newRow }) => {
  let inserted = 0;
  for (let from = 0; from < expiredReceipts; from += 1_000) {
    const rows = Array.from({ length: Math.min(1_000, expiredReceipts - from) }, (_, n) => ({ ...newRow(), _creationTime: now - weekMs - dayMs - from - n, workspace: "T_PROOF", eventId: `EvOld${from + n}` }));
    inserted += (await tx.insert(slackReceipts).values(rows).returning({ _id: slackReceipts._id })).length;
  }
  return inserted;
});
const runsOfTheJob = () => operations.query("resourceProof.runs", ({ tx }) => tx.select({ state: jobs.state, completedAt: jobs.completedAt }).from(jobs).where(eq(jobs.name, job)));
const swapMax = (await readFile("/sys/fs/cgroup/memory.swap.max", "utf8").catch(() => "unknown")).trim();
const memoryMax = (await readFile("/sys/fs/cgroup/memory.max", "utf8").catch(() => "unknown")).trim();

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
let event = 0;
const sent = [];
async function ack() {
  event += 1;
  const body = JSON.stringify({ type: "event_callback", team_id: "T_PROOF", event_id: "EvProof" + event, event_time: Math.floor(Date.now() / 1000), event: { type: "pin_added", user: "U_PROOF", channel_id: "C_PROOF", event_ts: event + ".000100" } });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", workerData.secret).update("v0:" + timestamp + ":" + body).digest("hex");
  const at = Date.now();
  const started = performance.now();
  try {
    const answer = await fetch(workerData.url, { method: "POST", headers: { "content-type": "application/json", "x-slack-request-timestamp": timestamp, "x-slack-signature": "v0=" + signature }, body, signal: AbortSignal.timeout(10000) });
    await answer.arrayBuffer();
    return { at, status: answer.status, ms: performance.now() - started };
  } catch {
    return { at, status: 0, ms: performance.now() - started };
  }
}
const every = setInterval(() => sent.push(ack()), workerData.everyMs);
parentPort.on("message", async () => {
  clearInterval(every);
  parentPort.postMessage(await Promise.all(sent));
});`,
  { eval: true, workerData: { url: `http://127.0.0.1:${service.port}/slack/events`, secret, everyMs: ackEveryMs } },
);
const acksSent = new Promise<Array<{ at: number; status: number; ms: number }>>((resolve, reject) => {
  sender.once("message", resolve);
  sender.once("error", reject);
});

// Every card asked for at once, as a burst of shares would: the renderer takes them one at a time. The job starts once
// the first card is drawn, so the thread is up and drawing the rest while the job runs.
const drawingFrom = Date.now();
let drawingUntil = Number.POSITIVE_INFINITY;
const drawing = Array.from({ length: cards }, (_, n) => renderedCard({ ...card, name: `Wren ${n}` }, noArt, cardWordsOf({ ...card, name: `Wren ${n}` })));
const pictures = Promise.all(drawing).finally(() => (drawingUntil = Date.now()));
const [rendered, settled] = await Promise.all([
  pictures.then(
    (all) => all.length,
    (error: unknown) => (console.error(String(error)), 0),
  ),
  drawing[0]!.then(
    () => worker.runCron(job, jobBudgetMs),
    (error: unknown) => (console.error(String(error)), undefined),
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
const runs = await runsOfTheJob();
const whileDrawing = (at: number) => at >= drawingFrom && at <= drawingUntil;
const runsFailed = runs.filter(({ state }) => state !== "success").length;
const runsWhileDrawing = runs.filter(({ completedAt }) => completedAt !== null && whileDrawing(completedAt)).length;
const jobDone = settled?.done === true && runs.length > 0 && runsFailed === 0 && left === 0;
const slowest = Math.max(...acks.map(({ ms }) => ms));
const failed = acks.filter(({ status }) => status !== 200).length;
const acksWhileDrawing = acks.filter(({ at }) => whileDrawing(at)).length;
const result = {
  cards: rendered,
  drawingMs: drawingUntil - drawingFrom,
  job: { done: jobDone, runs: runs.length, runsFailed, runsWhileDrawing, expiredSeeded: seeded, expiredLeft: left },
  acks: acks.length,
  acksWhileDrawing,
  acksFailed: failed,
  slowestAckMs: Math.round(slowest),
  eventLoopDelayMs: { p99: Math.round(delay.percentile(99) / 1e6), max: Math.round(delay.max / 1e6) },
  rssMiB: { start: mib(rssAtStart), peak: mib(peakRss) },
  cgroupPeakMiB: Number.isFinite(peakCgroup) ? { peak: mib(peakCgroup) } : sampledCgroup === 0 ? null : { sampledEvery50ms: mib(sampledCgroup) },
  cgroupLimits: { memoryMax: memoryMax === "max" || memoryMax === "unknown" ? memoryMax : `${mib(Number(memoryMax))} MiB`, swapMax },
};
console.log(JSON.stringify(result));
await service.stop();
const proven =
  rendered === cards &&
  seeded === expiredReceipts &&
  jobDone &&
  runsWhileDrawing > 0 &&
  acksWhileDrawing >= acksAtLeast &&
  failed === 0 &&
  slowest < ackDeadlineMs &&
  result.eventLoopDelayMs.max < ackDeadlineMs &&
  swapMax === "0";
process.exit(proven ? 0 : 1);
