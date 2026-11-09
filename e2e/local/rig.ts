// What both local runners share: each starts an app and its fakes, writes a target file, runs journeys on it, and
// stops everything it started, also when a step fails or the runner is interrupted.
import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:os";
import { killGroup } from "../../testing/localBackend.ts";

export type Rig = {
  /** Aborts once the runner is interrupted. */
  signal: AbortSignal;
  /** Stops something the run started; the last one deferred stops first. */
  defer: (cleanup: () => Promise<unknown>) => void;
  /** Runs `e2e run` with `filters` on the target file, and answers its exit code. */
  runJourneys: (targetFile: string, filters: string[]) => Promise<number>;
  interrupted: () => boolean;
};

/** Runs `body`, stops everything it deferred, and exits with its answer, or as the signal that interrupted it. */
export async function runRig(body: (rig: Rig) => Promise<number>): Promise<never> {
  const cleanups: (() => Promise<unknown>)[] = [];
  let runner: ChildProcess | undefined;
  let interrupted: NodeJS.Signals | undefined;
  const startup = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    // The rig stops what it started itself, in order: a library's own handler would cut that short, as embedded
    // Postgres's does when it stops its servers and exits.
    process.removeAllListeners(signal);
    process.on(signal, () => {
      interrupted = signal;
      startup.abort();
      if (runner !== undefined) killGroup(runner, signal);
    });
  }

  const runJourneys = (targetFile: string, filters: string[]) =>
    new Promise<number>((resolve) => {
      runner = spawn("npx", ["--no", "--", "e2e", "run", "--config", "e2e/e2e.config.ts", ...filters], {
        stdio: "inherit",
        detached: true,
        env: { ...process.env, E2E_TARGET: targetFile, E2E_TELEMETRY_DISABLED: "1" },
      });
      runner.once("error", (failure) => {
        console.error(failure);
        resolve(1);
      });
      runner.once("exit", (code, signal) => resolve(code ?? (signal === null ? 1 : 128 + constants.signals[signal])));
    });

  let exitCode = 1;
  try {
    exitCode = await body({ signal: startup.signal, defer: (cleanup) => cleanups.push(cleanup), runJourneys, interrupted: () => interrupted !== undefined });
  } catch (failure) {
    if (interrupted === undefined) console.error(failure);
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup().catch((failure: unknown) => console.error(failure));
  }
  process.exit(interrupted === undefined ? exitCode : 128 + constants.signals[interrupted]);
}
