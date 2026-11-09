// The promotion workflow's steps (.github/workflows/promote-production.yml), wired to GitHub's API, git and the
// health check of the app it waits for. `node tools/release/promote.ts <checks|serves|fast-forward>`, configured by env.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fastForward, waitForChecks, waitForSandbox, type CheckState, type Health, type Patience } from "./promotion.ts";

const need = (name: string) => process.env[name] || fail(`${name} is not set`);
const sha = need("SHA");
if (!/^[0-9a-f]{40}$/.test(sha)) fail(`SHA must be a full commit, not ${sha}`);

const patience = (deadlineMs: number): Patience => ({ deadlineMs, intervalMs: 15_000, now: Date.now, sleep: (ms) => sleep(ms) });

function git(...args: string[]) {
  const { status, stdout, stderr } = spawnSync("git", args, { encoding: "utf8" });
  return { status, stdout: stdout.trim(), stderr: stderr.trim() };
}

// A commit the checkout hasn't fetched yet, such as one pushed after the run started, is fetched once and asked again.
async function isAncestor(ancestor: string, of: string) {
  if (git("cat-file", "-e", `${of}^{commit}`).status !== 0) git("fetch", "--quiet", "origin", "main");
  return git("merge-base", "--is-ancestor", ancestor, of).status === 0;
}

async function github<Body>(path: string): Promise<Body> {
  const answer = await fetch(`${process.env.GITHUB_API_URL || "https://api.github.com"}/repos/${need("GITHUB_REPOSITORY")}/commits/${sha}/${path}`, {
    headers: { authorization: `Bearer ${need("GITHUB_TOKEN")}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
  });
  if (!answer.ok) throw new Error(`GitHub answered ${answer.status} for the commit's ${path}`);
  return answer.json() as Promise<Body>;
}

type CheckRun = { id: number; name: string; status: string; conclusion: string | null };

// Check runs, the latest run of each name, and commit statuses, which is how a hosting platform may report its deploy.
async function readChecks(): Promise<CheckState[]> {
  const { check_runs } = await github<{ check_runs: CheckRun[] }>("check-runs?per_page=100");
  const latest = new Map<string, CheckRun>();
  for (const run of check_runs) if ((latest.get(run.name)?.id ?? -1) < run.id) latest.set(run.name, run);
  const { statuses } = await github<{ statuses: { context: string; state: string }[] }>("status");
  return [
    ...[...latest.values()].map(({ name, status, conclusion }): CheckState => ({ name, state: status !== "completed" ? "pending" : conclusion === "success" ? "success" : ["failure", "cancelled", "timed_out", "action_required"].includes(conclusion ?? "") ? "failure" : "pending" })),
    ...statuses.map(({ context, state }): CheckState => ({ name: context, state: state === "success" ? "success" : state === "pending" ? "pending" : "failure" })),
  ];
}

async function readHealth(): Promise<Health | undefined> {
  try {
    const answer = await fetch(new URL("/healthz", need("APP_URL")), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (answer.status !== 200) return undefined;
    const { commit, migrations, off } = (await answer.json()) as Partial<Health>;
    return typeof commit === "string" && typeof migrations === "string" && typeof off === "boolean" ? { commit, migrations, off } : undefined;
  } catch {
    return undefined;
  }
}

function output(name: string, value: string) {
  console.log(`${name}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function fail(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

const step = process.argv[2];
try {
  if (step === "checks") {
    const required = need("REQUIRED_CHECKS").split("\n").map((name) => name.trim()).filter(Boolean);
    await waitForChecks({ read: readChecks, required, patience: patience(Number(need("DEADLINE_MS"))) });
  } else if (step === "serves") {
    output("outcome", await waitForSandbox({ read: readHealth, sha, isAncestor, patience: patience(Number(need("DEADLINE_MS"))) }));
  } else if (step === "fast-forward") {
    const production = {
      production: async () => {
        const { status, stdout, stderr } = git("ls-remote", "--exit-code", "origin", "refs/heads/production");
        if (status === 2) return undefined;
        if (status !== 0) throw new Error(`git ls-remote failed: ${stderr}`);
        return stdout.split(/\s/)[0];
      },
      isAncestor,
      push: async (to: string) => {
        const { status, stderr } = git("push", "origin", `${to}:refs/heads/production`);
        if (status !== 0) throw new Error(`git push to production failed: ${stderr}`);
      },
    };
    output("production", await fastForward({ sha, enabled: process.env.HEDGEHUG_PROMOTION === "production", git: production }));
  } else {
    fail(`usage: node tools/release/promote.ts <checks|serves|fast-forward>, not ${step}`);
  }
} catch (failure) {
  fail(failure instanceof Error ? failure.message : String(failure));
}
