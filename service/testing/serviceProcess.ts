// Starts the service as the image does (`node src/main.ts`), on a free port, and reads its log lines.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));

export interface ServiceProcess {
  url: string;
  /** Every log line so far, parsed. */
  lines(): Array<Record<string, unknown>>;
  /** The raw stdout and stderr so far. */
  output(): string;
  /** Resolves with the first log line that matches. */
  waitFor(match: (line: Record<string, unknown>) => boolean, timeoutMs?: number): Promise<Record<string, unknown>>;
  signal(signal: NodeJS.Signals): void;
  exited: Promise<number | null>;
}

export async function startServiceProcess(env: Record<string, string>): Promise<ServiceProcess> {
  const child = spawn(process.execPath, [main], {
    env: { PATH: process.env.PATH ?? "", PORT: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const listeners = new Set<() => void>();
  const onData = (chunk: Buffer) => {
    output += chunk.toString();
    for (const listener of listeners) listener();
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));

  const lines = () =>
    output
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  const waitFor: ServiceProcess["waitFor"] = (match, timeoutMs = 15_000) =>
    new Promise((resolve, reject) => {
      const check = () => {
        const found = lines().find(match);
        if (!found) return;
        cleanup();
        resolve(found);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`No matching log line within ${timeoutMs} ms. Output:\n${output}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        listeners.delete(check);
      };
      listeners.add(check);
      check();
    });

  const listening = await waitFor((line) => line.message === "listening").catch((error: unknown) => {
    child.kill("SIGKILL");
    throw error;
  });
  return {
    url: `http://127.0.0.1:${listening.port as number}`,
    lines,
    output: () => output,
    waitFor,
    signal: (signal) => child.kill(signal),
    exited,
  };
}
