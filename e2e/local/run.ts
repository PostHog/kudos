import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flagsKey, projectToken } from "../../testing/fakePostHog.ts";
import { startLocalBackend } from "../../testing/localBackend.ts";
import { startFakes } from "../fakes/server.ts";
import { targetLines, type Target } from "../target.ts";

const workspace = "T1";

const fakes = await startFakes();
const signingSecret = randomBytes(24).toString("hex");
const backend = await startLocalBackend({
  instanceName: "kudos-e2e",
  variables: (site) => ({
    SITE_URL: site,
    SLACK_API_URL: `${fakes.url}/api`,
    SLACK_SIGNING_SECRET: signingSecret,
    SLACK_BOT_TOKEN: "xoxb-e2e",
    SLACK_APP_ID: "A_KUDOS",
    SLACK_WORKSPACE_ID: workspace,
    POSTHOG_HOST: fakes.url,
    POSTHOG_PROJECT_TOKEN: projectToken,
    POSTHOG_PERSONAL_API_KEY: flagsKey,
    KUDOS_ENVIRONMENT: "sandbox",
  }),
}).catch(async (failure) => {
  await fakes.stop();
  throw failure;
});

const directory = await mkdtemp(join(tmpdir(), "kudos-e2e-target-"));
const targetFile = join(directory, "local.env");
const target: Target = { appUrl: backend.site, signingSecret, workspace, fakesUrl: fakes.url };
await writeFile(targetFile, targetLines(target), { mode: 0o600 });

const exitCode = await new Promise<number>((resolve) => {
  const runner = spawn("npx", ["--no", "--", "e2e", "run", "--config", "e2e/e2e.config.ts", ...process.argv.slice(2).filter((argument) => argument !== "--")], {
    stdio: "inherit",
    env: { ...process.env, E2E_TARGET: targetFile, E2E_TELEMETRY_DISABLED: "1" },
  });
  runner.once("exit", (code, signal) => resolve(code ?? (signal === null ? 1 : 128)));
});

await backend.stop();
await fakes.stop();
await rm(directory, { recursive: true, force: true });
process.exit(exitCode);
