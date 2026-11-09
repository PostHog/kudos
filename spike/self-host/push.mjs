// Spike only, never merged. A short-lived child of the supervisor, so the push request's memory is returned when
// it exits. Sets the function env from CONVEX_ENV_<NAME>, replays the push request the image build wrote, and points
// the canonical URLs at the public origin.
import { readFile } from "node:fs/promises";
import { brotliCompressSync } from "node:zlib";

const startedAt = Number(process.env.SPIKE_STARTED_AT ?? Date.now());
const local = process.env.SPIKE_LOCAL;
const adminKey = process.env.SPIKE_ADMIN_KEY;
const publicUrl = process.env.SPIKE_PUBLIC_URL;
const mark = (step, extra = {}) => console.log(JSON.stringify({ spike: step, ms: Date.now() - startedAt, ...extra }));

const admin = (path, body, compressed = false) => fetch(`${local}${path}`, {
  method: "POST",
  headers: { authorization: `Convex ${adminKey}`, "content-type": "application/json", "convex-client": "npm-cli-1.46.0", ...(compressed && { "content-encoding": "br" }) },
  body: compressed ? brotliCompressSync(JSON.stringify(body)) : JSON.stringify(body),
}).then(async (answer) => {
  const text = await answer.text();
  if (!answer.ok) throw new Error(`${path} answered ${answer.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
});

// Function env comes from the host's runtime secrets on every boot, so the database never has to be the only copy.
const changes = Object.entries(process.env).filter(([name]) => name.startsWith("CONVEX_ENV_")).map(([name, value]) => ({ name: name.slice("CONVEX_ENV_".length), value }));
const setEnv = async () => {
  if (changes.length > 0) await admin("/api/update_environment_variables", { changes });
  mark("function-env-set", { variables: changes.length });
};
// The push needs the app's required env, so set it first. An env update re-reads the deployed modules, so if their
// bytes are missing (a restart without the blob mirror) it fails; then push first and set the env after.
let envSet = false;
try {
  await setEnv();
  envSet = true;
} catch (error) {
  mark("env-refused-before-push", { error: String(error.message).slice(0, 300) });
}

if (process.env.SPIKE_SKIP_PUSH) {
  mark("push-skipped", { why: "this image's push already finished and its blobs came back from the mirror" });
} else {
  // Every module, not only the ones whose hashes changed: module bytes live on scratch, and a restart loses them while
  // the database still lists them.
  let push = JSON.parse(await readFile("/app/push.json", "utf8"));
  push.adminKey = adminKey;
  const counts = { modules: push.appDefinition.changedModules.length, components: push.componentDefinitions.length };
  const started = await admin("/api/deploy2/start_push", push, true);
  push = null;
  mark("push-started");
  for (;;) {
    const status = await admin("/api/deploy2/wait_for_schema", { adminKey, schemaChange: started.schemaChange, timeoutMs: 10_000, dryRun: false });
    if (status.type === "complete") break;
    if (status.type !== "inProgress") throw new Error(`schema ${status.type}: ${JSON.stringify(status).slice(0, 500)}`);
  }
  mark("schema-ready");
  await admin("/api/deploy2/finish_push", { adminKey, startPush: started, dryRun: false }, true);
  mark("functions-deployed", counts);
}
if (!envSet) await setEnv();

for (const requestDestination of ["convexCloud", "convexSite"]) await admin("/api/update_canonical_url", { requestDestination, url: publicUrl });
mark("canonical-urls-set", { publicUrl });
