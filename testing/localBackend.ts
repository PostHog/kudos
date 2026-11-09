import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const backendVersion = "precompiled-2026-10-06-a3538c6";
const run = promisify(execFile);

// `run` runs one of the deployment's functions as its admin, as `npx convex run` does, and gives back what it printed.
// `adminKey` signs requests as the deployment's admin. `restart` stops the backend and starts it again on the same
// database, ports and deployment, with `changes` added to its process environment.
export type LocalBackend = {
  cloud: string;
  site: string;
  envFile: string;
  adminKey: string;
  run: (name: string, options?: { component?: string }) => Promise<string>;
  restart: (changes: Record<string, string>) => Promise<void>;
  stop: () => Promise<void>;
};

// `signal` cancels startup: it aborts the download, the deploy and the wait, and stops whatever had started.
// `environment` adds to the backend process's own environment, such as a preloaded library that moves its clock.
export type LocalBackendOptions = { instanceName: string; variables: (site: string) => Record<string, string>; environment?: Record<string, string>; signal?: AbortSignal };

export async function startLocalBackend({ instanceName, variables, environment, signal }: LocalBackendOptions): Promise<LocalBackend> {
  const binary = await backendBinary(signal);
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), `${instanceName}-`));
  const [cloudPort, sitePort] = [await freePort(), await freePort()];
  const cloud = `http://127.0.0.1:${cloudPort}`;
  const site = `http://127.0.0.1:${sitePort}`;
  const instanceSecret = randomBytes(32).toString("hex");
  const launch = () =>
    spawn(binary, [
      ...["--instance-name", instanceName, "--instance-secret", instanceSecret],
      ...["--port", String(cloudPort), "--site-proxy-port", String(sitePort)],
      ...["--convex-origin", cloud, "--convex-site", site],
      ...["--local-storage", join(directory, "storage"), "--disable-beacon"],
      join(directory, "db.sqlite3"),
    ], { stdio: "ignore", detached: true, env: { ...process.env, ...environment } });
  let backend = launch();
  const halt = async () => {
    const exited = new Promise((resolve) => backend.once("exit", resolve));
    const running = backend.exitCode === null && backend.signalCode === null;
    killGroup(backend);
    if (running) await exited;
  };
  const stop = async () => {
    await halt();
    await rm(directory, { recursive: true, force: true });
  };
  const restart = async (changes: Record<string, string>) => {
    await halt();
    environment = { ...environment, ...changes };
    backend = launch();
    await untilAnswering(`${cloud}/version`, backend, undefined);
  };
  try {
    await untilAnswering(`${cloud}/version`, backend, signal);
    const envFile = join(directory, "deployment.env");
    const key = await adminKey(binary, instanceName, instanceSecret, signal);
    await writeFile(envFile, `CONVEX_SELF_HOSTED_URL=${cloud}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${key}\n`);
    const variablesFile = join(directory, "variables.env");
    await writeFile(variablesFile, envLines({ ...(await signingKeys()), ...variables(site) }));
    await convex(["env", "set", "--from-file", variablesFile, "--env-file", envFile], signal);
    await convex(["deploy", "--yes", "--typecheck", "disable", "--codegen", "disable", "--env-file", envFile], signal);
    const runFunction = (name: string, { component }: { component?: string } = {}) =>
      convex(["run", ...(component === undefined ? [] : ["--component", component]), name, "--env-file", envFile], signal);
    return { cloud, site, envFile, adminKey: key, run: runFunction, restart, stop };
  } catch (failure) {
    await stop();
    throw failure;
  }
}

async function signingKeys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  return {
    JWT_PRIVATE_KEY: (await exportPKCS8(privateKey)).trimEnd().replace(/\n/g, " "),
    JWKS: JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(publicKey)) }] }),
  };
}

function envLines(variables: Record<string, string>) {
  return Object.entries(variables)
    .map(([name, value]) => `${name}='${value}'`)
    .join("\n");
}

async function backendBinary(signal?: AbortSignal) {
  if (process.env.CONVEX_LOCAL_BACKEND) return process.env.CONVEX_LOCAL_BACKEND;
  const directory = join(homedir(), ".cache", "convex", "binaries", backendVersion);
  const binary = join(directory, "convex-local-backend");
  if (existsSync(binary)) return binary;
  await mkdir(directory, { recursive: true });
  // Download and extract beside the cache, then rename the finished binary in, so an interrupted start never
  // leaves a partial binary that a later run would take for the real one.
  const staging = await mkdtemp(join(directory, ".staging-"));
  try {
    const archive = join(staging, "backend.zip");
    const download = await fetch(`https://github.com/get-convex/convex-backend/releases/download/${backendVersion}/convex-local-backend-${targetTriple()}.zip`, { signal });
    if (!download.ok) throw new Error(`the local backend ${backendVersion} didn't download: ${download.status}`);
    await writeFile(archive, Buffer.from(await download.arrayBuffer()));
    await run("unzip", ["-o", archive, "-d", staging], { signal });
    await chmod(join(staging, "convex-local-backend"), 0o755);
    await rename(join(staging, "convex-local-backend"), binary);
    return binary;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function targetTriple() {
  const cpu = process.arch === "arm64" ? "aarch64" : "x86_64";
  return process.platform === "darwin" ? `${cpu}-apple-darwin` : `${cpu}-unknown-linux-gnu`;
}

async function adminKey(binary: string, instanceName: string, instanceSecret: string, signal?: AbortSignal) {
  const { stdout } = await run(binary, ["keygen", "admin-key", "--instance-name", instanceName, "--instance-secret", instanceSecret], { signal });
  return stdout.trim().split("\n").at(-1)!;
}

// The CLI runs under npx in a process group of its own, so stopping it stops the whole tree, not just npx.
function convex(args: string[], signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    signal?.throwIfAborted();
    const cli = spawn("npx", ["--no", "--", "convex", ...args], { stdio: ["ignore", "pipe", "pipe"], detached: true });
    let errors = "";
    let output = "";
    cli.stdout.on("data", (chunk) => (output = (output + String(chunk)).slice(-16_384)));
    cli.stderr.on("data", (chunk) => (errors = (errors + String(chunk)).slice(-16_384)));
    const abort = () => killGroup(cli);
    signal?.addEventListener("abort", abort, { once: true });
    cli.once("error", reject);
    cli.once("exit", (code, killedBy) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) reject(signal.reason);
      else if (code === 0) resolve(output);
      else reject(new Error(`convex ${args[0]} exited with ${code ?? killedBy}: ${errors}`));
    });
  });
}

// A child started with `detached: true` leads its own process group. Its tools run their own children (the backend's
// node executors, npx's CLI, the E2E runner's workers), so stopping one means signalling the whole group.
export function killGroup(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // the group has already exited
  }
}

export function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no free port"))));
    });
  });
}

async function untilAnswering(url: string, backend: ChildProcess, signal: AbortSignal | undefined, withinMs = 30_000) {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (backend.exitCode !== null) throw new Error(`the local backend exited with ${backend.exitCode}`);
    const probe = AbortSignal.any([AbortSignal.timeout(1_000), ...(signal ? [signal] : [])]);
    if (await fetch(url, { signal: probe }).then((response) => response.ok, () => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the local backend didn't answer ${url} within ${withinMs} ms`);
}
