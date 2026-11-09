// The promotion from the sandbox to production: wait for a commit of main to pass its checks and reach the sandbox,
// then move the `production` branch, which the production app deploys from, forward to exactly that commit. Every
// outside call comes in as a function, so the rules are proven on fakes; `promote.ts` wires them to GitHub, git and
// the sandbox.

/** How long a wait polls, and the clock it polls by. */
export type Patience = { deadlineMs: number; intervalMs: number; now: () => number; sleep: (ms: number) => Promise<void> };

/** A check on the commit, by its name: a GitHub check run, or a commit status by its context. */
export type CheckState = { name: string; state: "pending" | "success" | "failure" };

/** What the app's `/healthz` answers. */
export type Health = { commit: string; migrations: string; off: boolean };

export type IsAncestor = (ancestor: string, of: string) => Promise<boolean>;

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

async function poll<Done>(patience: Patience, step: () => Promise<Done | undefined>, late: () => string): Promise<Done> {
  const deadline = patience.now() + patience.deadlineMs;
  for (;;) {
    const done = await step();
    if (done !== undefined) return done;
    if (patience.now() >= deadline) throw new Error(late());
    await patience.sleep(patience.intervalMs);
  }
}

/** Resolves once every required check passed on the commit; throws at the first that failed, or at the deadline. */
export async function waitForChecks({ read, required, patience }: { read: () => Promise<CheckState[]>; required: string[]; patience: Patience }) {
  let missing = required;
  await poll(
    patience,
    async () => {
      const states = new Map((await read()).map(({ name, state }) => [name, state]));
      const failed = required.find((name) => states.get(name) === "failure");
      if (failed !== undefined) throw new Error(`${failed} failed on this commit, so it is not promoted`);
      missing = required.filter((name) => states.get(name) !== "success");
      return missing.length === 0 ? true : undefined;
    },
    () => `${missing.join(", ")} did not pass within ${seconds(patience.deadlineMs)}`,
  );
}

/**
 * Waits until the sandbox serves exactly `sha` with its migrations done and the app on: `ready`. A sandbox already on
 * a later commit of main is `superseded`, since the run for that commit promotes it. A sandbox that served `sha` and
 * moved to anything else aborts: what the gate would test is no longer what it would promote.
 */
export async function waitForSandbox({ read, sha, isAncestor, patience }: { read: () => Promise<Health | undefined>; sha: string; isAncestor: IsAncestor; patience: Patience }) {
  let served: string | undefined;
  let seenSha = false;
  return poll<"ready" | "superseded">(
    patience,
    async () => {
      const health = await read();
      if (health === undefined) return undefined;
      served = health.commit;
      if (served === sha) {
        seenSha = true;
        return health.migrations === "done" && !health.off ? "ready" : undefined;
      }
      if (/^[0-9a-f]{40}$/.test(served) && (await isAncestor(sha, served))) return "superseded";
      if (seenSha) throw new Error(`the sandbox moved from ${sha} to ${served} before the gate ran, so it is not promoted`);
      return undefined;
    },
    () => `the sandbox did not serve ${sha} with its migrations done within ${seconds(patience.deadlineMs)}${served === undefined ? "" : `; it serves ${served}`}`,
  );
}

export type ProductionBranch = {
  /** The commit `production` points at, or undefined when the branch doesn't exist. */
  production: () => Promise<string | undefined>;
  isAncestor: IsAncestor;
  /** Moves `production` from `from` to `sha`, only while the remote still has it at `from`. */
  push: (sha: string, from: string) => Promise<void>;
};

/** Moves `production` forward to exactly `sha`, only while the promotion switch is on, and never back or sideways. */
export async function fastForward({ sha, enabled, git }: { sha: string; enabled: boolean; git: ProductionBranch }): Promise<"off" | "current" | "moved"> {
  if (!enabled) return "off";
  const production = await git.production();
  if (production === undefined) throw new Error("there is no production branch: a person creates it at the cutover, and the promotion only moves it forward");
  if (production === sha) return "current";
  if (!(await git.isAncestor(production, sha))) throw new Error(`production is at ${production}, which ${sha} doesn't follow, so it is not moved`);
  await git.push(sha, production);
  return "moved";
}
