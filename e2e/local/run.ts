import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";
import { flagsKey, projectToken } from "../../testing/fakePostHog.ts";
import { killGroup, startLocalBackend } from "../../testing/localBackend.ts";
import { startFakes } from "../fakes/server.ts";
import { startClock } from "./clock.ts";
import { targetLines, type Target } from "../target.ts";

const workspace = "T1";
const appId = "A_KUDOS";
const cleanups: (() => Promise<unknown>)[] = [];
let runner: ChildProcess | undefined;
let interrupted: NodeJS.Signals | undefined;
const startup = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    interrupted = signal;
    startup.abort();
    if (runner !== undefined) killGroup(runner, signal);
  });
}

let exitCode = 1;
try {
  const fakes = await startFakes();
  cleanups.push(fakes.stop);
  const signingSecret = randomBytes(24).toString("hex");
  const backend = await startLocalBackend({
    instanceName: "kudos-e2e",
    signal: startup.signal,
    variables: (site) => ({
      SITE_URL: site,
      SLACK_API_URL: `${fakes.url}/api`,
      SLACK_SIGNING_SECRET: signingSecret,
      SLACK_BOT_TOKEN: "xoxb-e2e",
      SLACK_APP_ID: appId,
      SLACK_WORKSPACE_ID: workspace,
      POSTHOG_HOST: fakes.url,
      POSTHOG_PROJECT_TOKEN: projectToken,
      POSTHOG_PERSONAL_API_KEY: flagsKey,
      KUDOS_ENVIRONMENT: "sandbox",
    }),
  });
  cleanups.push(backend.stop);
  // The flags component loads definitions only when its supervising cron first runs, minutes after a deploy, so the
  // app would read every flag as off until then. Load them now, before the first journey.
  const loaded = await backend.run("lib:refreshFlagDefinitions", { component: "posthog" });
  if (!loaded.includes('"updated"')) throw new Error(`the app didn't load the fakes' flag definitions: ${loaded}`);

  const directory = await mkdtemp(join(tmpdir(), "kudos-e2e-target-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const targetFile = join(directory, "local.env");
  // The app's components keep job queues of their own, which settling waits for too.
  const testSecret = randomBytes(24).toString("hex");
  const clock = await startClock(backend, { secret: testSecret, components: ["posthog", "staticHosting"] });
  cleanups.push(clock.stop);
  const target: Target = { appUrl: backend.site, signingSecret, workspace, appId, fakesUrl: fakes.url, timeUrl: clock.url, testSecret };
  await writeFile(targetFile, targetLines(target), { mode: 0o600 });

  // Moving the clock restarts the backend and catches every cron up at once, so with no filter of the caller's the
  // journeys that move it run after the others, which then never meet that churn.
  const asked = process.argv.slice(2).filter((argument) => argument !== "--");
  const passes = asked.length > 0 ? [asked] : [["--exclude-tag", "@time"], ["--tag", "@time"]];
  const results: number[] = [];
  for (const pass of passes) if (interrupted === undefined) results.push(await runJourneys(targetFile, pass));
  if (interrupted === undefined) exitCode = Math.max(...results);
} catch (failure) {
  if (interrupted === undefined) console.error(failure);
} finally {
  for (const cleanup of cleanups.reverse()) await cleanup().catch((failure: unknown) => console.error(failure));
}
process.exit(interrupted === undefined ? exitCode : 128 + constants.signals[interrupted]);

function runJourneys(targetFile: string, filters: string[]) {
  return new Promise<number>((resolve) => {
    runner = spawn("npx", ["--no", "--", "e2e", "run", "--config", "e2e/e2e.config.ts", ...filters], {
      stdio: "inherit",
      detached: true,
      env: { ...process.env, E2E_TARGET: targetFile, E2E_TELEMETRY_DISABLED: "1" },
    });
    runner.once("error", (failure) => {
      console.error(failure);
      resolve(1);
    });
    runner.once("exit", (code, signal) => resolve(code ?? (signal === null ? 1 : 128 + constants.signals[signal])));
  });
}
