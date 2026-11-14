// The move, proven on a real export: what today's app (the Convex oracle) left after every E2E journey passed against
// it, exported with the move's tool (tools/move/export.ts), kept as e2e/rewrite/oracleExport.zip. It loads through the
// app's own routes with the service's own job registry, as the move will load production's.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { rewriteExport, scheduledSource } from "../../testing/exportZip.ts";
import { chunksOf } from "../../testing/zip.ts";
import { createClock } from "../clock.ts";
import { decodeStored, type Value } from "../db/codec.ts";
import { createApp } from "../http/app.ts";
import type { Log, LogFields } from "../log.ts";
import { serviceRegistry } from "../registry.ts";
import { createLoadControl, type LoadControl } from "./control.ts";
import { jobName } from "./recovery.ts";
import { restartArgs } from "./restarts.ts";
import { retiredJobs } from "./retired.ts";

const database = useTestDatabase();
const token = "an-oracle-load-token";
const fixture = new URL("../../../e2e/rewrite/oracleExport.zip", import.meta.url);

/**
 * The functions the oracle ran that the service registers no job for yet, each until the stack that ports it (or
 * retires it, in ./retired.ts) lands; every row of them in the fixture is finished. Recovery stops on any name that maps
 * to neither, so the move waits until this list is empty; a name ported or retired must leave it.
 */
const awaitingPort = new Set([
  "achievements.achievements.countKudosGiven",
  "album.emojiNames.reserveTeamNamesAfterTheSync",
  "album.items.questHoggies.earnQuestHoggie",
  "album.items.welcome.earnWelcomeItemOnGreeting",
  "album.packs.grantThoughtfulPacks",
  "analytics.isolatedUsage.recordMondayDmSent",
  "analytics.isolatedUsage.recordWelcomeDmSent",
  "analytics.person.catchUp",
  "analytics.person.identifyNewPeople",
  "analytics.subscribers.recordKudosGiven",
  "analytics.subscribers.recordPacksEarned",
  "analytics.subscribers.recordPersonCollected",
  "analytics.subscribers.recordQuestFinished",
  "analytics.subscribers.recordQuestsDrawn",
  "feedback.albumReplies.replyAfterTheGrant",
  "feedback.welcomeNudge.nudgeTheThanked",
  "leaderboard.groupTotals.countAwardsAttributed",
  "leaderboard.totals.countKudosGiven",
  "progression.questRewards.payQuestFinished",
  "slack.appHome.publishHome",
  "slack.directory.checkDirectory",
  "slack.userGroups.refreshMembers",
  "slack.welcome.deliverMondayWelcome",
  "stickers.completions.checkTeamPages",
  "stickers.stickers.recordStickers",
  "unlocks.sweep.sweep",
  "welcome.welcome.welcomeNewMembers",
  // Not in the fixture, since no journey schedules it, but production can hold its rows: it re-enqueues itself (S13).
  "workspace.customEmoji.forgetUnlistedCustomEmoji",
]);

type Status = { phase: string; error: string | null; roundTrip: { equal: boolean; tables: Array<{ table: string; equal: boolean }> } | null };
type Scheduled = { _id: string; name: string; state: { kind: string }; args: [Record<string, Value>]; scheduledTime: number };

const loads: LoadControl[] = [];
afterEach(() => loads.splice(0).forEach((load) => load.stop()));

/** Loads `archive` into an empty copy of the service through `/admin/load`, and gives back where it settled and its log. */
async function loaded(archive: Buffer): Promise<{ status: Status; logged: Array<{ message: string; fields?: LogFields }> }> {
  const logged: Array<{ message: string; fields?: LogFields }> = [];
  const log: Log = { info: (message, fields) => logged.push({ message, fields }), error: (message, fields) => logged.push({ message, fields }) };
  const load = createLoadControl({ pool: database.pool, token, log, jobs: serviceRegistry.jobs, pollMs: 50 });
  loads.push(load);
  load.resume();
  const app = createApp({ commit: "test", readiness: { migrations: () => "done" }, off: false, log, clock: createClock(), load });
  const request = (path: string, init: RequestInit = {}) => Promise.resolve(app.request(path, { ...init, headers: { "x-hedgehug-admin-token": token, ...init.headers } }));

  const chunks = chunksOf(archive, 3);
  for (const [number, chunk] of chunks.entries()) expect((await request(`/admin/load?chunk=${number}`, { method: "POST", body: new Uint8Array(chunk) })).status).toBe(200);
  const sha256 = createHash("sha256").update(archive).digest("hex");
  expect((await request("/admin/load/finish", { method: "POST", body: JSON.stringify({ chunks: chunks.length, sha256 }) })).status, "the load starts").toBe(202);
  for (let tries = 0; tries < 3_000; tries++) {
    const status = (await (await request("/admin/load")).json()) as Status;
    if (!["loading", "verifying", "recovering"].includes(status.phase) || status.error !== null) return { status, logged };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("the oracle's export didn't settle");
}

/** The fixture's scheduled functions, each with its namespace and its job name. */
async function scheduledOf(archive: Buffer): Promise<Array<Scheduled & { source: string; job: string }>> {
  const rows: Array<Scheduled & { source: string; job: string }> = [];
  await rewriteExport(archive, (name, content) => {
    const source = scheduledSource(name);
    if (source !== undefined) {
      for (const line of content.toString().split("\n").filter(Boolean)) {
        const row = JSON.parse(line) as Scheduled;
        rows.push({ ...row, source, job: jobName(source, row.name) });
      }
    }
    return content;
  });
  return rows;
}

/** The fixture with the functions awaiting their port set aside, as the move would load it once they are ported. */
function withoutAwaitingPort(archive: Buffer): Promise<Buffer> {
  return rewriteExport(archive, (name, content) => {
    const source = scheduledSource(name);
    if (source === undefined) return content;
    const kept = content
      .toString()
      .split("\n")
      .filter((line) => line !== "" && !awaitingPort.has(jobName(source, (JSON.parse(line) as Scheduled).name)));
    return Buffer.from(kept.map((line) => `${line}\n`).join(""));
  });
}

describe("the move on the oracle's own export", () => {
  test("the export carries the scheduled functions of the app and its components, as the move's tool adds them", async () => {
    const scheduled = await scheduledOf(await readFile(fixture));
    const sources = new Set(scheduled.map(({ source }) => source));
    expect(sources, "the app's and the PostHog component's").toEqual(new Set(["app", "_components/posthog"]));
    expect(scheduled.some(({ state }) => state.kind === "pending"), "work still to run").toBe(true);
  });

  test("a function awaiting its port has no job and no retirement yet, so a stack that ports one takes it off the list", () => {
    expect([...awaitingPort].filter((name) => serviceRegistry.jobs.get(name) || retiredJobs.has(name)), "ported or retired: take it off the awaiting-port list").toEqual([]);
  });

  test("recovery stops on the functions no stack has ported yet, and on nothing else, before it changes anything", async () => {
    const archive = await readFile(fixture);
    const unmapped = new Set((await scheduledOf(archive)).filter(({ job }) => !serviceRegistry.jobs.get(job) && !retiredJobs.has(job)).map(({ job }) => job));
    expect([...unmapped].filter((name) => !awaitingPort.has(name)), "neither registered, retired nor awaiting its port: register its job, retire it, or list it").toEqual([]);

    const { status } = await loaded(archive);
    if (unmapped.size === 0) expect(status, "every function maps, so the move goes through").toMatchObject({ phase: "done", error: null });
    else expect(status, "the round trip passed, and recovery stopped on what awaits a port").toMatchObject({ phase: "recovering", error: expect.stringContaining("Recovery found scheduled functions no job or retirement maps") });
    expect(status.roundTrip, "every table round-trips").toMatchObject({ equal: true });
  });

  test("with the functions awaiting their port set aside, the load round-trips every table and recovers every scheduled function", async () => {
    const archive = await withoutAwaitingPort(await readFile(fixture));
    const scheduled = await scheduledOf(archive);

    const { status, logged } = await loaded(archive);

    expect(status, "the load is done").toMatchObject({ phase: "done", error: null });
    expect(status.roundTrip?.tables.filter(({ equal }) => !equal), "every table round-trips").toEqual([]);
    expect(status.roundTrip?.tables.length, "the app's and its components' tables").toBeGreaterThan(150);
    const counts = Object.entries(Object.groupBy(scheduled, ({ source }) => source)).map(([source, rows]) => `${source} ${rows!.length}`).sort();
    expect(logged.find(({ message }) => message === "load done")?.fields, "each scheduled function a job, counted by namespace").toMatchObject({
      jobs: scheduled.length,
      scheduled: counts.join(", "),
    });
    // What the oracle had scheduled, as the service keeps it: each under its own `_id` and name, its args (any Convex
    // cursor restarted, ./restarts.ts) and time; work still to run pending, unless its function is retired.
    const expected = scheduled
      .map(({ _id, job, state, args, scheduledTime }) => ({
        _id,
        name: job,
        state: state.kind === "pending" ? (retiredJobs.has(job) ? "canceled" : "pending") : state.kind,
        args: restartArgs(job, args[0]),
        runAt: scheduledTime,
      }))
      .sort((a, b) => (a._id < b._id ? -1 : 1));
    const stored = await database.pool.query<{ _id: string; name: string; state: string; args: string; runAt: number }>(`select _id, name, state, args::text as args, "runAt" from jobs order by _id collate "C"`);
    expect(stored.rows.map((row) => ({ ...row, args: decodeStored(row.args) })), "every scheduled function its job").toStrictEqual(expected);
  });
});
