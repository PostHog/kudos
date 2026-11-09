// The rewrite as a target: the service as the image runs it, on a throwaway Postgres, with the fakes beside it and the
// edge stand-in in front, all inside one folder of its own that `stop` removes.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startPostgres } from "../../service/testing/embeddedPostgres.ts";
import { startServiceProcess } from "../../service/testing/serviceProcess.ts";
import { startFakes } from "../fakes/server.ts";
import { targetLines } from "../target.ts";
import { startEdge } from "./edge.ts";

export type RewriteTarget = { folder: string; targetFile: string; appUrl: string; serviceUrl: string; serviceOutput: () => string; stop: () => Promise<void> };

const repository = fileURLToPath(new URL("../..", import.meta.url));

/** The journeys the rewrite passes: the supported list's lines, without its comments and blank lines. */
export function supportedJourneys(): string[] {
  return readFileSync(new URL("../rewrite/supported.txt", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export async function startRewrite(signal?: AbortSignal): Promise<RewriteTarget> {
  const stops: (() => Promise<unknown>)[] = [];
  const stop = async () => {
    for (const step of stops.reverse()) await step().catch((failure: unknown) => console.error(failure));
  };
  try {
    const folder = await mkdtemp(join(tmpdir(), "kudos-e2e-rewrite-"));
    stops.push(() => rm(folder, { recursive: true, force: true }));
    const postgres = await startPostgres({ dir: join(folder, "postgres") });
    stops.push(postgres.stop);
    const fakes = await startFakes();
    stops.push(fakes.stop);
    const signingSecret = randomBytes(24).toString("hex");
    const testSecret = randomBytes(24).toString("hex");
    const service = await startServiceProcess({ DATABASE_URL: postgres.url, SLACK_SIGNING_SECRET: signingSecret, HEDGEHUG_TEST_SECRET: testSecret, HEDGEHUG_COMMIT: head() });
    stops.push(() => (service.signal("SIGTERM"), service.exited));
    await migrated(service.url, signal);
    const edge = await startEdge(service.url);
    stops.push(edge.stop);
    const targetFile = join(folder, "rewrite.env");
    const target = { kind: "rewrite", appUrl: edge.url, signingSecret, workspace: "T1", appId: "A_KUDOS", fakesUrl: fakes.url, signIn: "edge-header", testSecret } as const;
    await writeFile(targetFile, targetLines(target), { mode: 0o600 });
    return { folder, targetFile, appUrl: edge.url, serviceUrl: service.url, serviceOutput: service.output, stop };
  } catch (failure) {
    await stop();
    throw failure;
  }
}

// The commit the service says it runs, as the image build bakes it in.
function head() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
}

// Every route but /healthz answers 503 until the migrations are done, so the journeys start after.
async function migrated(serviceUrl: string, signal?: AbortSignal, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    const health: { migrations?: string } = await fetch(`${serviceUrl}/healthz`).then((answer) => answer.json(), () => ({}));
    if (health.migrations === "done") return;
    if (Date.now() > until) throw new Error(`the service's migrations weren't done within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
