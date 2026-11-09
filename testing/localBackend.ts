import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const backendVersion = "precompiled-2026-10-06-a3538c6";
const run = promisify(execFile);

export type LocalBackend = { cloud: string; site: string; envFile: string; stop: () => Promise<void> };

// `signal` cancels startup: it aborts the download, the deploy and the wait, and stops whatever had started.
export type LocalBackendOptions = { instanceName: string; variables: (site: string) => Record<string, string>; signal?: AbortSignal };

export async function startLocalBackend({ instanceName, variables, signal }: LocalBackendOptions): Promise<LocalBackend> {
  const binary = await backendBinary(signal);
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), `${instanceName}-`));
  const [cloudPort, sitePort] = [await freePort(), await freePort()];
  const cloud = `http://127.0.0.1:${cloudPort}`;
  const site = `http://127.0.0.1:${sitePort}`;
  const instanceSecret = randomBytes(32).toString("hex");
  const backend = spawn(binary, [
    ...["--instance-name", instanceName, "--instance-secret", instanceSecret],
    ...["--port", String(cloudPort), "--site-proxy-port", String(sitePort)],
    ...["--convex-origin", cloud, "--convex-site", site],
    ...["--local-storage", join(directory, "storage"), "--disable-beacon"],
    join(directory, "db.sqlite3"),
  ], { stdio: "ignore" });
  const stop = async () => {
    const exited = new Promise((resolve) => backend.once("exit", resolve));
    if (backend.exitCode === null && backend.kill()) await exited;
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await untilAnswering(`${cloud}/version`, backend, signal);
    const envFile = join(directory, "deployment.env");
    await writeFile(envFile, `CONVEX_SELF_HOSTED_URL=${cloud}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${await adminKey(binary, instanceName, instanceSecret, signal)}\n`);
    const variablesFile = join(directory, "variables.env");
    await writeFile(variablesFile, envLines({ ...(await signingKeys()), ...variables(site) }));
    await convex(["env", "set", "--from-file", variablesFile, "--env-file", envFile], signal);
    await convex(["deploy", "--yes", "--typecheck", "disable", "--codegen", "disable", "--env-file", envFile], signal);
    return { cloud, site, envFile, stop };
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
  const archive = join(directory, "backend.zip");
  const download = await fetch(`https://github.com/get-convex/convex-backend/releases/download/${backendVersion}/convex-local-backend-${targetTriple()}.zip`, { signal });
  if (!download.ok) throw new Error(`the local backend ${backendVersion} didn't download: ${download.status}`);
  await writeFile(archive, Buffer.from(await download.arrayBuffer()));
  await run("unzip", ["-o", archive, "-d", directory], { signal });
  await rm(archive);
  await chmod(binary, 0o755);
  return binary;
}

function targetTriple() {
  const cpu = process.arch === "arm64" ? "aarch64" : "x86_64";
  return process.platform === "darwin" ? `${cpu}-apple-darwin` : `${cpu}-unknown-linux-gnu`;
}

async function adminKey(binary: string, instanceName: string, instanceSecret: string, signal?: AbortSignal) {
  const { stdout } = await run(binary, ["keygen", "admin-key", "--instance-name", instanceName, "--instance-secret", instanceSecret], { signal });
  return stdout.trim().split("\n").at(-1)!;
}

async function convex(args: string[], signal?: AbortSignal) {
  await run("npx", ["--no", "--", "convex", ...args], { maxBuffer: 16 * 1024 * 1024, signal });
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
