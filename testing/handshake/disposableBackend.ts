import { startLocalBackend } from "../localBackend";
import { allowedWorkspace, issuer } from "./mockSlackIssuer";

export default async function startDisposableBackend() {
  if (process.env.HANDSHAKE_ENV_FILE) return;
  const { site, envFile, stop } = await startLocalBackend({ instanceName: "kudos-handshake", variables: deploymentVariables });
  process.env.HANDSHAKE_ENV_FILE = envFile;
  process.env.HANDSHAKE_SITE_URL = site;
  return stop;
}

function deploymentVariables(site: string) {
  return {
    SLACK_WORKSPACE_ID: allowedWorkspace,
    SLACK_OIDC_ISSUER: issuer,
    SLACK_API_URL: `${issuer}/api`,
    POSTHOG_HOST: issuer,
    AUTH_SLACK_ID: "mock-client",
    AUTH_SLACK_SECRET: "mock-client-secret",
    SITE_URL: site,
    POSTHOG_PROJECT_TOKEN: "phc_handshake",
    POSTHOG_PERSONAL_API_KEY: "phx_handshake",
    SLACK_BOT_TOKEN: "xoxb-handshake",
    SLACK_SIGNING_SECRET: "handshake-signing-secret",
  };
}
