import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { LocalBackend } from "../../testing/localBackend.ts";
import { cronIds, testSecretHeader, type CronId, type TimeAnswer, type TimeStep } from "../time.ts";

// Today's app reads the time from its backend's own clock, so the local driver moves that clock: it runs the backend
// under libfaketime, and each advance restarts it, on the same database and ports, with the new offset. A backend whose
// clock jumps while it runs keeps sleeping towards the jobs it had already planned, so it never runs them; one started at
// the offset runs whatever came due at once, and catches each cron up once. `runCron` runs the cron's job with the
// backend's admin key, and `settle` waits until no job due by the app's clock is pending or running, in the app and in
// each of its components.
const libraries = [
  process.env.KUDOS_LIBFAKETIME,
  "/usr/lib/x86_64-linux-gnu/faketime/libfaketimeMT.so.1",
  "/usr/lib/aarch64-linux-gnu/faketime/libfaketimeMT.so.1",
  "/usr/local/lib/faketime/libfaketimeMT.so.1",
];

// The contract's budget for one step: under the 30 s a host waits for a response's headers.
const budgetMs = 25_000;

export type Clock = { url: string; stop: () => Promise<void> };

export async function startClock(backend: LocalBackend, { secret, components }: { secret: string; components: string[] }): Promise<Clock> {
  let offsetMs = 0;
  const appNow = () => Date.now() + offsetMs;

  const call = async (path: string, args: Record<string, unknown>, componentPath = "") => {
    const response = await fetch(`${backend.cloud}/api/function`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Convex ${backend.adminKey}` },
      body: JSON.stringify({ path, args, componentPath, format: "json" }),
    });
    const answer = (await response.json()) as { status: string; value?: unknown; errorMessage?: string };
    if (answer.status !== "success") throw new Error(`${path} failed: ${answer.errorMessage ?? response.status}`);
    return answer.value;
  };

  type Job = { name: string; scheduledTime: number; state: { kind: string } };
  const unfinished = async (componentPath: string) => {
    const jobs: Job[] = [];
    for (let cursor: string | null = null, isDone = false; !isDone; ) {
      const page = (await call("_system/cli/tableData", { table: "_scheduled_functions", order: "desc", paginationOpts: { cursor, numItems: 1000 } }, componentPath)) as {
        page: Job[];
        isDone: boolean;
        continueCursor: string;
      };
      jobs.push(...page.page.filter((job) => job.state.kind === "pending" || job.state.kind === "inProgress"));
      ({ isDone, continueCursor: cursor } = page);
    }
    return jobs;
  };

  const settle = async () => {
    const until = Date.now() + budgetMs;
    const ran = new Set<string>();
    // Two quiet reads in a row, so a job that a finishing one scheduled is seen before the queue counts as settled.
    for (let quiet = 0; quiet < 2; ) {
      const now = appNow();
      const due = (await Promise.all(["", ...components].map(unfinished))).flat().filter((job) => job.scheduledTime <= now);
      for (const job of due) ran.add(job.name);
      quiet = due.length === 0 ? quiet + 1 : 0;
      if (Date.now() > until) throw new Error(`jobs still due after ${budgetMs} ms: ${due.map((job) => job.name).join(", ")}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return [...ran];
  };

  const advance = async (ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) throw new Error(`the clock moves only forward, by a number of ms, not ${ms}`);
    if (ms === 0) return [];
    const library = libraries.find((path) => path !== undefined && existsSync(path));
    if (library === undefined) throw new Error("moving the app's clock needs libfaketime: install it (`sudo apt-get install faketime`) or set KUDOS_LIBFAKETIME to its libfaketimeMT.so.1");
    offsetMs += ms;
    await backend.restart({ LD_PRELOAD: library, FAKETIME: `+${(offsetMs / 1000).toFixed(3)}` });
    return [];
  };

  const runCron = async (id: CronId) => {
    const dot = id.lastIndexOf(".");
    await call(`${id.slice(0, dot).replaceAll(".", "/")}:${id.slice(dot + 1)}`, {});
    return [id, ...(await settle())];
  };

  const step = (body: TimeStep): Promise<string[]> => {
    if ("advance" in body) return advance(body.advance);
    if ("runCron" in body) {
      if (!(cronIds as readonly string[]).includes(body.runCron)) throw new Error(`no cron is named ${body.runCron}`);
      return runCron(body.runCron);
    }
    if (body.settle === true) return settle();
    throw new Error(`no step is named in ${JSON.stringify(body)}`);
  };

  // One step at a time: a restart in the middle of another step would pull the backend from under it.
  let queue: Promise<unknown> = Promise.resolve();
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/testing/time" || request.headers[testSecretHeader] !== secret) {
      response.writeHead(404).end();
      return;
    }
    let text = "";
    request.on("data", (chunk) => (text += String(chunk)));
    request.on("end", () => {
      const done = queue.then(async () => {
        try {
          const ran = await step(JSON.parse(text) as TimeStep);
          response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ now: appNow(), ran } satisfies TimeAnswer));
        } catch (failure) {
          response.writeHead(400).end(failure instanceof Error ? failure.message : String(failure));
        }
      });
      queue = done;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/testing/time`,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
