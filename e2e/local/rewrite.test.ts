// @vitest-environment node
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { constants } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { targetOf } from "../target.ts";
import { startRewrite, supportedJourneys } from "./rewriteTarget.ts";

const e2e = fileURLToPath(new URL("..", import.meta.url));
const runner = fileURLToPath(new URL("./rewrite.ts", import.meta.url));

// Nothing the rig started may outlive it: no process that names its folder, as Postgres does, and no folder.
async function leftBehind({ folder, urls }: { folder: string; urls: string[] }) {
  const processes = execFileSync("ps", ["-eo", "args"], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.includes(folder));
  const answering = [];
  for (const url of urls) if (await fetch(`${url}/healthz`).then(() => true, () => false)) answering.push(url);
  return { processes, folder: existsSync(folder), answering };
}

const nothing = { processes: [], folder: false, answering: [] };

describe("the rewrite as an E2E target", () => {
  test("its supported list names journey files that exist, the front door's and the health check's first", () => {
    const journeys = supportedJourneys();

    expect(journeys.slice(0, 2)).toEqual(["journeys/health.e2e.ts", "journeys/frontDoor.e2e.ts"]);
    for (const journey of journeys) expect(existsSync(`${e2e}/${journey.replace(/:\d+$/, "")}`), journey).toBe(true);
  });

  test("runs the service on a throwaway Postgres behind the edge stand-in, migrated before the target file names it, and leaves nothing behind once stopped", async () => {
    const rewrite = await startRewrite();
    let health: unknown;
    try {
      const target = targetOf(rewrite.targetFile);
      expect(target).toMatchObject({ kind: "rewrite", appUrl: rewrite.appUrl, signIn: "edge-header" });
      expect(target.testSecret).toBeTruthy();
      health = await (await fetch(`${target.appUrl}/healthz`)).json();
    } finally {
      await rewrite.stop();
    }

    expect(health).toEqual({ commit: expect.stringMatching(/^[0-9a-f]{40}$/), migrations: "done", off: false });
    expect(await leftBehind({ folder: rewrite.folder, urls: [rewrite.appUrl, rewrite.serviceUrl] })).toEqual(nothing);
  }, 120_000);

  test.each([
    ["interrupted", [], "SIGTERM" as const, 128 + constants.signals.SIGTERM],
    ["whose journeys fail", ["--no-such-option"], undefined, expect.any(Number)],
  ])("a run that is %s stops everything it started", async (_, args, signal, exitCode) => {
    const child = spawn(process.execPath, [runner, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
    const started = await new Promise<RegExpExecArray>((resolve, reject) => {
      const look = () => {
        const found = /the rewrite answers at (\S+) behind the edge stand-in at (\S+), its target file in (\S+)/.exec(output);
        if (found) resolve(found);
      };
      child.stdout.on("data", look);
      void exited.then(() => reject(new Error(`the runner exited before it started the rewrite:\n${output}`)));
    });
    if (signal) child.kill(signal);
    const code = await exited;

    expect(code, output).toEqual(exitCode);
    expect(code, output).not.toBe(0);
    expect(await leftBehind({ folder: started[3]!, urls: [started[1]!, started[2]!] })).toEqual(nothing);
  }, 120_000);
});
