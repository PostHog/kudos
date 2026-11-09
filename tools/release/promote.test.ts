// @vitest-environment node
// The promotion's steps as the workflow runs them, against a bare repository standing in for GitHub's and local
// servers standing in for GitHub's API and the app's health check.
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const cli = fileURLToPath(new URL("./promote.ts", import.meta.url));
let dir: string;
let servers: Server[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "promote-"));
  servers = [];
});

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim();

// A remote with two commits on main, and a checkout of it, as the workflow's checkout makes one.
function repository() {
  const origin = join(dir, "origin.git");
  const checkout = join(dir, "checkout");
  git(dir, "init", "--quiet", "--bare", "--initial-branch=main", origin);
  git(dir, "clone", "--quiet", origin, checkout);
  const commit = (message: string) => (git(checkout, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", message), git(checkout, "rev-parse", "HEAD"));
  const first = commit("first");
  const second = commit("second");
  git(checkout, "push", "--quiet", "origin", "main");
  return { origin, checkout, first, second, production: () => git(origin, "rev-parse", "--verify", "--quiet", "refs/heads/production") };
}

async function serve(answer: (path: string) => unknown) {
  const server = createServer((request, response) => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(answer(request.url ?? ""))));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function run(step: string, cwd: string, env: Record<string, string>) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) =>
    execFile(process.execPath, [cli, step], { cwd, env: { PATH: process.env.PATH!, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...env } }, (error, stdout, stderr) => resolve({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr })),
  );
}

describe("the promotion's steps", () => {
  test("fast-forward moves an existing production branch to the commit, and only when the switch says production", async () => {
    const repo = repository();
    git(repo.checkout, "push", "--quiet", "origin", `${repo.first}:refs/heads/production`);

    for (const off of ["", "sandbox", "on"]) {
      expect(await run("fast-forward", repo.checkout, { SHA: repo.second, HEDGEHUG_PROMOTION: off })).toMatchObject({ code: 0, stdout: "production=off\n" });
      expect(repo.production()).toBe(repo.first);
    }

    expect(await run("fast-forward", repo.checkout, { SHA: repo.second, HEDGEHUG_PROMOTION: "production" })).toMatchObject({ code: 0, stdout: "production=moved\n" });
    expect(repo.production()).toBe(repo.second);
  });

  test("fast-forward refuses to move production back", async () => {
    const repo = repository();
    git(repo.checkout, "push", "--quiet", "origin", `${repo.second}:refs/heads/production`);

    const { code, stderr } = await run("fast-forward", repo.checkout, { SHA: repo.first, HEDGEHUG_PROMOTION: "production" });

    expect(code).toBe(1);
    expect(stderr).toContain(`production is at ${repo.second}, which ${repo.first} doesn't follow`);
    expect(repo.production()).toBe(repo.second);
  });

  test("fast-forward never creates production", async () => {
    const repo = repository();

    const { code, stderr } = await run("fast-forward", repo.checkout, { SHA: repo.second, HEDGEHUG_PROMOTION: "production" });

    expect(code).toBe(1);
    expect(stderr).toContain("there is no production branch");
    expect(() => repo.production()).toThrow();
  });

  test("serves reads the app's health check and stands down when the app already serves a later commit of main", async () => {
    const repo = repository();
    const appUrl = await serve(() => ({ commit: repo.second, migrations: "done", off: false }));

    expect(await run("serves", repo.checkout, { SHA: repo.second, APP_URL: appUrl, DEADLINE_MS: "0" })).toMatchObject({ code: 0, stdout: "outcome=ready\n" });
    expect(await run("serves", repo.checkout, { SHA: repo.first, APP_URL: appUrl, DEADLINE_MS: "0" })).toMatchObject({ code: 0, stdout: "outcome=superseded\n" });
  });

  test("checks reads the commit's check runs and statuses from GitHub's API", async () => {
    const repo = repository();
    const seen: string[] = [];
    const api = await serve((path) => {
      seen.push(path);
      return path.includes("/check-runs")
        ? { check_runs: [{ id: 1, name: "gate", status: "completed", conclusion: "failure" }, { id: 2, name: "gate", status: "completed", conclusion: "success" }] }
        : { statuses: [{ context: "hosthog/deploy (hedgehug-sandbox)", state: "success" }] };
    });
    const env = { SHA: repo.second, GITHUB_API_URL: api, GITHUB_REPOSITORY: "owner/repo", GITHUB_TOKEN: "t", DEADLINE_MS: "0" };

    expect(await run("checks", repo.checkout, { ...env, REQUIRED_CHECKS: "gate\nhosthog/deploy (hedgehug-sandbox)\n" })).toMatchObject({ code: 0 });
    expect(seen).toContain(`/repos/owner/repo/commits/${repo.second}/check-runs?per_page=100`);
    const missing = await run("checks", repo.checkout, { ...env, REQUIRED_CHECKS: "gate\ne2e-rewrite" });
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("e2e-rewrite did not pass within 0 s");
  });
});
