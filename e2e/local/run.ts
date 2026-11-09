import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { flagsKey, projectToken } from "../../testing/fakePostHog.ts";
import { killGroup, startLocalBackend, type LocalBackend } from "../../testing/localBackend.ts";
import { clientId, clientSecret } from "../../testing/slackOpenId.ts";
import { startFakes } from "../fakes/server.ts";
import { startClock } from "./clock.ts";
import { runRig, type Rig } from "./rig.ts";
import { targetLines, type Target } from "../target.ts";

const workspace = "T1";
const appId = "A_KUDOS";

await runRig(async (rig) => {
  let backend: LocalBackend | undefined;
  const fakes = await startFakes({ flagsChanged: () => loadFlags(backend!) });
  rig.defer(fakes.stop);
  const signingSecret = randomBytes(24).toString("hex");
  backend = await startLocalBackend({
    instanceName: "kudos-e2e",
    signal: rig.signal,
    variables: (site) => ({
      SITE_URL: site,
      SLACK_OIDC_ISSUER: fakes.url,
      AUTH_SLACK_ID: clientId,
      AUTH_SLACK_SECRET: clientSecret,
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
  rig.defer(backend.stop);
  // The flags component loads definitions only when its supervising cron first runs, minutes after a deploy, so the
  // app would read every flag as off until then. Load them now, before the first journey, and again whenever a
  // journey changes them.
  await loadFlags(backend);
  // The website reads its flag for the workspace, which needs the workspace's analytics key; production's workspace
  // had one long before it was paused, and a fresh backend makes it at its first kudos. Make it now.
  await backend.run("website/flag:prepareWebsiteFlag");
  await publishWebsite(backend, rig);

  const directory = await mkdtemp(join(tmpdir(), "kudos-e2e-target-"));
  rig.defer(() => rm(directory, { recursive: true, force: true }));
  const targetFile = join(directory, "local.env");
  // The app's components keep job queues of their own, which settling waits for too.
  const testSecret = randomBytes(24).toString("hex");
  const clock = await startClock(backend, { secret: testSecret, components: ["posthog", "staticHosting"] });
  rig.defer(clock.stop);
  const target: Target = { kind: "oracle", appUrl: backend.site, signingSecret, workspace, appId, fakesUrl: fakes.url, signIn: "slack-openid", timeUrl: clock.url, testSecret };
  await writeFile(targetFile, targetLines(target), { mode: 0o600 });

  // Moving the clock restarts the backend and catches every cron up at once, so with no filter of the caller's the
  // journeys that move it run after the others, which then never meet that churn.
  const asked = process.argv.slice(2).filter((argument) => argument !== "--");
  const passes = asked.length > 0 ? [asked] : [["--exclude-tag", "@time"], ["--tag", "@time"]];
  const results: number[] = [];
  for (const pass of passes) if (!rig.interrupted()) results.push(await rig.runJourneys(targetFile, pass));
  return Math.max(...results);
});

async function loadFlags(backend: LocalBackend) {
  const loaded = await backend.run("lib:refreshFlagDefinitions", { component: "posthog" });
  if (!loaded.includes('"updated"')) throw new Error(`the app didn't load the fakes' flag definitions: ${loaded}`);
}

// Builds the website against this backend and uploads it to the backend's static hosting, as a deploy does.
async function publishWebsite(backend: LocalBackend, rig: Rig) {
  const dist = await mkdtemp(join(tmpdir(), "kudos-e2e-website-"));
  rig.defer(() => rm(dist, { recursive: true, force: true }));
  const deployment = parseEnv(await readFile(backend.envFile, "utf8"));
  await finished(["pnpm", "--dir", "website", "exec", "vite", "build", "--logLevel", "warn", "--outDir", dist, "--emptyOutDir"], { VITE_CONVEX_URL: backend.cloud }, rig.signal);
  await finished(["npx", "--no", "--", "static-hosting", "upload", "--dist", dist], deployment, rig.signal);
}

function finished([command, ...args]: string[], env: Record<string, string | undefined>, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command!, args, { stdio: ["ignore", "ignore", "inherit"], detached: true, env: { ...process.env, ...env } });
    const abort = () => killGroup(child);
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      signal.removeEventListener("abort", abort);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}
