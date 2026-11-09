// Spike only, never merged. The container's one process tree, as an app host with one port would run it:
// start the open-source Convex backend on loopback, push this repo's functions and function env to it,
// and only then listen on $PORT with a small front that routes the one port to the backend's two.
//
// Env (all from the host's runtime secrets):
//   PORT                     the one public port (default 8080)
//   INSTANCE_NAME            names the Postgres database: hyphens become underscores
//   INSTANCE_SECRET          64 hex characters; persistent, or every admin key and signed token changes
//   DATABASE_URL             postgres://user:pass@host:port/<database>; the database must match INSTANCE_NAME
//   PUBLIC_URL               the origin members and Slack reach, e.g. https://kudos.example.dev
//   CONVEX_ENV_<NAME>        becomes the function env variable <NAME>
//   DO_NOT_REQUIRE_SSL, PG_CA_FILE, POSTGRES_MAX_CONNECTIONS and the backend's other knobs pass straight through.
import { spawn, execFile } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import { openMirror } from "./mirror.mjs";

const run = promisify(execFile);
const startedAt = Date.now();
const port = Number(process.env.PORT ?? 8080);
const backendPort = Number(process.env.BACKEND_PORT ?? 3210);
const sitePort = Number(process.env.SITE_PORT ?? 3211);
const dataDir = process.env.DATA_DIR ?? "/tmp/convex";
const instanceName = required("INSTANCE_NAME");
const instanceSecret = required("INSTANCE_SECRET");
const publicUrl = (process.env.PUBLIC_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
const local = `http://127.0.0.1:${backendPort}`;
const dist = "/app/website/dist";

const mark = (step, extra = {}) => console.log(JSON.stringify({ spike: step, ms: Date.now() - startedAt, ...extra }));

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
  return value;
}

// Convex takes a cluster URL and derives the database from the instance name, so check they agree rather than
// let the backend create a second database the app's role may not own.
function clusterUrl() {
  const url = new URL(required("DATABASE_URL"));
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const expected = instanceName.replaceAll("-", "_");
  if (database !== expected) {
    console.error(`DATABASE_URL names database ${database}, but INSTANCE_NAME ${instanceName} maps to ${expected}`);
    process.exit(2);
  }
  url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

await rm(dataDir, { recursive: true, force: true });
await mkdir(join(dataDir, "tmp"), { recursive: true });
await mkdir(join(dataDir, "storage"), { recursive: true });
await mkdir(process.env.HOME ?? "/tmp/home", { recursive: true });

// Blobs (module packages, the Node dependency package, stored files) live on scratch; bring back the mirrored copy
// before the backend reads the database rows that point at them.
const storageDir = join(dataDir, "storage");
const mirror = await openMirror(required("DATABASE_URL"), process.env.DO_NOT_REQUIRE_SSL ? false : { ca: process.env.PG_CA_FILE ? await readFile(process.env.PG_CA_FILE, "utf8") : undefined });
const restored = await mirror.restore(storageDir);
mark("blobs-restored", restored);
// A restart of the image whose push already finished, with its blobs back from the mirror, needs no push: pushing
// re-analyzes every module and is the boot's memory peak.
const digest = await new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  createReadStream("/app/push.json").on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
});
const skipPush = restored.files > 0 && (await mirror.deployedDigest()) === digest;

const backendEnv = { ...process.env, TMPDIR: join(dataDir, "tmp") };
for (const name of Object.keys(backendEnv)) if (name.startsWith("CONVEX_ENV_") || name === "DATABASE_URL") delete backendEnv[name];
const backend = spawn("/convex/convex-local-backend", [
  ...["--instance-name", instanceName, "--instance-secret", instanceSecret],
  ...["--interface", "127.0.0.1", "--port", String(backendPort), "--site-proxy-port", String(sitePort)],
  ...["--convex-origin", local, "--convex-site", `http://127.0.0.1:${sitePort}`],
  ...["--local-storage", join(dataDir, "storage"), "--disable-beacon", "--redact-logs-to-client"],
  ...(process.env.DO_NOT_REQUIRE_SSL ? ["--do-not-require-ssl"] : []),
  ...["--db", "postgres-v5", clusterUrl()],
], { stdio: ["ignore", "inherit", "inherit"], env: backendEnv, cwd: "/convex" });
backend.on("exit", (code, signal) => {
  mark("backend-exit", { code, signal });
  process.exit(code ?? 1);
});
mark("backend-spawned", { pid: backend.pid });

let syncing = Promise.resolve();
const syncBlobs = (why) => (syncing = syncing.then(() => mirror.sync(storageDir)).then((result) => { if (result.added || result.removed) mark("blobs-mirrored", { why, ...result }); }, (error) => mark("blobs-mirror-failed", { why, error: String(error) })));
const stop = (signal) => {
  mark("stopping", { signal });
  setTimeout(() => process.exit(0), 4000).unref();
  syncBlobs("stop").then(() => backend.kill("SIGTERM"));
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

await until(async () => (await fetch(`${local}/version`)).ok, 60_000, "the backend answers /version");
mark("backend-answering");

const adminKey = (await run("/convex/convex-local-backend", ["keygen", "admin-key", "--instance-name", instanceName, "--instance-secret", instanceSecret])).stdout.trim().split("\n").at(-1);
// The push runs in a short-lived child so the memory it takes to read and send the push request is returned.
await new Promise((resolve, reject) => {
  const child = spawn("node", ["/app/spike/push.mjs"], {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    env: { ...process.env, SPIKE_SKIP_PUSH: skipPush ? "1" : "", SPIKE_STARTED_AT: String(startedAt), SPIKE_LOCAL: local, SPIKE_ADMIN_KEY: adminKey, SPIKE_PUBLIC_URL: publicUrl },
  });
  // The push asks for a mirrored, read-back copy of every blob before finish_push commits the module rows that point at
  // them, so no crash can leave committed references to blobs only the lost disk held.
  child.on("message", (message) => {
    if (message?.type !== "mirror-before-commit") return;
    syncing = syncing.then(() => mirror.sync(storageDir));
    syncing.then((result) => { mark("blobs-mirrored", { why: "before-commit", ...result }); child.send({ ok: true }); }, (error) => child.send({ ok: false, error: String(error) }));
  });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`the push exited with ${code}`))));
});
for (const name of Object.keys(process.env)) if (name.startsWith("CONVEX_ENV_")) delete process.env[name];
// Fail closed: the digest is recorded only once every blob is mirrored and read back.
syncing = syncing.then(() => mirror.sync(storageDir));
mark("blobs-mirrored", { why: "push", ...(await syncing) });
if (!skipPush) await mirror.markDeployed(digest);
setInterval(() => syncBlobs("interval"), 5000).unref();

// The one port. HTTP actions (Slack, Convex Auth, its discovery documents) go to the site port, the Convex API and
// its sync socket to the API port, and everything else is the website, served from the image rather than from
// file storage so nothing on scratch has to survive a restart.
const toSite = (path) => path.startsWith("/slack/") || path.startsWith("/api/auth/") || path.startsWith("/.well-known/");
const toApi = (path) => path.startsWith("/api/") || path === "/version" || path === "/instance_name";

function upstreamPortOf(path) {
  if (toSite(path)) return sitePort;
  if (toApi(path)) return backendPort;
  return null;
}

// Some hosts strip Authorization at their edge; a client that sends the same value as X-Convex-Authorization gets it back.
function forwardedHeaders(headers) {
  const out = { ...headers };
  if (!out.authorization && out["x-convex-authorization"]) out.authorization = out["x-convex-authorization"];
  delete out["x-convex-authorization"];
  return out;
}

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon", ".webp": "image/webp", ".txt": "text/plain" };
const policy = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'",
  `connect-src 'self' ${publicUrl} ${publicUrl.replace(/^http/, "ws")}`,
  "img-src 'self' https://avatars.slack-edge.com https://secure.gravatar.com https://emoji.slack-edge.com https://a.slack-edge.com https://res.cloudinary.com",
  "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

async function serveWebsite(request, response) {
  const path = normalize(decodeURIComponent(new URL(request.url, publicUrl).pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(dist, path);
  const found = await stat(file).then((s) => s.isFile(), () => false);
  if (!found) file = join(dist, "index.html");
  const body = await readFile(file);
  const type = types[extname(file)] ?? "application/octet-stream";
  const headers = { "content-type": type };
  if (type.startsWith("text/html")) headers["content-security-policy"] = policy;
  else if (/^\/assets\/[^/]+\.[A-Za-z0-9]+$/.test(path)) headers["cache-control"] = "public, max-age=31536000, immutable";
  response.writeHead(200, headers).end(body);
}

const front = createServer((request, response) => {
  const path = new URL(request.url, publicUrl).pathname;
  if (path === "/healthz") return void response.writeHead(200, { "content-type": "text/plain" }).end("ok");
  const upstream = upstreamPortOf(path);
  if (upstream === null) return void serveWebsite(request, response).catch(() => response.writeHead(500).end());
  const proxied = httpRequest({ host: "127.0.0.1", port: upstream, method: request.method, path: request.url, headers: forwardedHeaders(request.headers) }, (answer) => {
    response.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(response);
  });
  proxied.on("error", () => (response.headersSent ? response.destroy() : response.writeHead(502).end()));
  request.pipe(proxied);
});

// The Convex sync protocol is a WebSocket on /api/<version>/sync; pass the upgrade through untouched.
front.on("upgrade", (request, socket, head) => {
  const upstream = upstreamPortOf(new URL(request.url, publicUrl).pathname) ?? backendPort;
  const backendSocket = connect(upstream, "127.0.0.1", () => {
    const headers = forwardedHeaders(request.headers);
    const lines = [`${request.method} ${request.url} HTTP/1.1`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), "", ""];
    backendSocket.write(lines.join("\r\n"));
    if (head.length > 0) backendSocket.write(head);
    socket.pipe(backendSocket).pipe(socket);
  });
  const close = () => { socket.destroy(); backendSocket.destroy(); };
  backendSocket.on("error", close);
  socket.on("error", close);
});

front.listen(port, "0.0.0.0", () => mark("listening", { port }));

async function until(check, withinMs, what) {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${what} did not happen within ${withinMs} ms`);
}
