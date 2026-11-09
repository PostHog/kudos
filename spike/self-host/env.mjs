// Spike only, never merged. Prints a docker --env-file with the function env the handshake suite expects
// (testing/handshake/disposableBackend.ts), each as CONVEX_ENV_<NAME> so the supervisor sets it at boot.
// The signing keys are generated once per run directory, so every copy of the app shares them.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const port = process.argv[2];
const out = process.env.OUT;
const keysFile = join(out, "jwt-keys.json");
if (!existsSync(keysFile)) {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(publicKey)) }] });
  const signingKey = (await exportPKCS8(privateKey)).trimEnd().replace(/\n/g, " ");
  writeFileSync(keysFile, JSON.stringify({ jwks, signingKey }), { mode: 0o600 });
}
const { jwks, signingKey } = JSON.parse(readFileSync(keysFile, "utf8"));
const issuer = "http://127.0.0.1:3412";
const site = process.env.PUBLIC_SITE ?? `http://127.0.0.1:${port}`;
const variables = {
  SLACK_WORKSPACE_ID: "TALLOWED",
  SLACK_OIDC_ISSUER: issuer,
  SLACK_API_URL: `${issuer}/api`,
  POSTHOG_HOST: issuer,
  AUTH_SLACK_ID: "mock-client",
  AUTH_SLACK_SECRET: "mock-client-secret",
  SITE_URL: site,
  JWT_PRIVATE_KEY: signingKey,
  JWKS: jwks,
  POSTHOG_PROJECT_TOKEN: "phc_handshake",
  POSTHOG_PERSONAL_API_KEY: "phx_handshake",
  SLACK_BOT_TOKEN: "xoxb-handshake",
  SLACK_SIGNING_SECRET: "handshake-signing-secret",
};
console.log(Object.entries(variables).map(([name, value]) => `CONVEX_ENV_${name}=${value}`).join("\n"));
console.log(`PUBLIC_URL=${site}`);
