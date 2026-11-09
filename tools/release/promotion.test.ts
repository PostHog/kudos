// @vitest-environment node
import { describe, expect, test } from "vitest";
import { fastForward, waitForChecks, waitForSandbox, type CheckState, type Health, type Patience } from "./promotion.ts";

const sha = "a".repeat(40);
const older = "b".repeat(40);
const newer = "c".repeat(40);
const elsewhere = "d".repeat(40);

// History as the checkout knows it: older, then sha, then newer, on main; elsewhere on no line with them.
const line = [older, sha, newer];
const isAncestor = async (ancestor: string, of: string) => line.includes(ancestor) && line.includes(of) && line.indexOf(ancestor) <= line.indexOf(of);

// A clock that only the waits move, so a test runs every poll of a long wait at once.
function patience(deadlineMs = 60_000): Patience & { waited: number[] } {
  let now = 0;
  const waited: number[] = [];
  return { deadlineMs, intervalMs: 10_000, now: () => now, sleep: async (ms) => void (waited.push(ms), (now += ms)), waited };
}

function answers<Value>(...sequence: Value[]) {
  let index = 0;
  return async () => sequence[Math.min(index++, sequence.length - 1)]!;
}

describe("waiting for the commit's checks", () => {
  const required = ["gate", "e2e-rewrite", "hosthog/deploy (hedgehug-sandbox)"];
  const checks = (states: Record<string, CheckState["state"]>): CheckState[] => Object.entries(states).map(([name, state]) => ({ name, state }));

  test("goes on once every required check passed, whatever else ran", async () => {
    const read = answers(checks({ gate: "pending", "e2e-rewrite": "success" }), checks({ gate: "success", "e2e-rewrite": "success", "hosthog/deploy (hedgehug-sandbox)": "success", e2e: "failure" }));

    await expect(waitForChecks({ read, required, patience: patience() })).resolves.toBeUndefined();
  });

  test("stops at the first required check that failed", async () => {
    const read = answers(checks({ gate: "success", "e2e-rewrite": "failure" }));

    await expect(waitForChecks({ read, required, patience: patience() })).rejects.toThrow("e2e-rewrite failed");
  });

  test("gives up when a required check never reports by the deadline", async () => {
    const wait = patience(30_000);

    await expect(waitForChecks({ read: answers(checks({ gate: "success", "e2e-rewrite": "success" })), required, patience: wait })).rejects.toThrow("hosthog/deploy (hedgehug-sandbox) did not pass within 30 s");
    expect(wait.waited).toEqual([10_000, 10_000, 10_000]);
  });
});

describe("waiting for the sandbox to serve the commit", () => {
  const health = (commit: string, more: Partial<Health> = {}): Health => ({ commit, migrations: "done", off: false, ...more });

  test("is ready once the sandbox serves exactly the commit with its migrations done", async () => {
    const read = answers(health(older), health(sha, { migrations: "running" }), health(sha));

    await expect(waitForSandbox({ read, sha, isAncestor, patience: patience() })).resolves.toBe("ready");
  });

  test("stands down when the sandbox already serves a later commit of main, which its own run promotes", async () => {
    await expect(waitForSandbox({ read: answers(health(older), health(newer)), sha, isAncestor, patience: patience() })).resolves.toBe("superseded");
  });

  test("aborts when the sandbox moves off the commit to one that isn't later", async () => {
    await expect(waitForSandbox({ read: answers(health(sha, { migrations: "running" }), health(older)), sha, isAncestor, patience: patience() })).rejects.toThrow(`the sandbox moved from ${sha} to ${older}`);
  });

  test("never counts a sandbox that is switched off as serving the commit", async () => {
    await expect(waitForSandbox({ read: answers(health(sha, { off: true })), sha, isAncestor, patience: patience(20_000) })).rejects.toThrow(`the sandbox did not serve ${sha} with its migrations done within 20 s`);
  });

  test("keeps waiting through answers that aren't health, as while the sandbox restarts", async () => {
    const read = answers<Health | undefined>(undefined, health(sha));

    await expect(waitForSandbox({ read, sha, isAncestor, patience: patience() })).resolves.toBe("ready");
  });

  test("gives up on a sandbox that serves a commit off main's line", async () => {
    await expect(waitForSandbox({ read: answers(health(elsewhere)), sha, isAncestor, patience: patience(20_000) })).rejects.toThrow(`the sandbox did not serve ${sha} with its migrations done within 20 s; it serves ${elsewhere}`);
  });
});

describe("fast-forwarding production", () => {
  function git(production: string | undefined) {
    const pushed: string[] = [];
    return { pushed, production: async () => production, isAncestor, push: async (to: string, from: string) => void pushed.push(`${from}..${to}`) };
  }

  test("does nothing while the promotion switch is off", async () => {
    const remote = git(older);

    await expect(fastForward({ sha, enabled: false, git: remote })).resolves.toBe("off");
    expect(remote.pushed).toEqual([]);
  });

  test("moves production forward to exactly the commit", async () => {
    const remote = git(older);

    await expect(fastForward({ sha, enabled: true, git: remote })).resolves.toBe("moved");
    expect(remote.pushed, "a push only while production is still where it was read").toEqual([`${older}..${sha}`]);
  });

  test("leaves production alone when it already is the commit", async () => {
    const remote = git(sha);

    await expect(fastForward({ sha, enabled: true, git: remote })).resolves.toBe("current");
    expect(remote.pushed).toEqual([]);
  });

  test("never moves production back or sideways", async () => {
    for (const production of [newer, elsewhere]) {
      const remote = git(production);
      await expect(fastForward({ sha, enabled: true, git: remote })).rejects.toThrow(`production is at ${production}, which ${sha} doesn't follow`);
      expect(remote.pushed).toEqual([]);
    }
  });

  test("never creates production: a person creates it at the cutover", async () => {
    const remote = git(undefined);

    await expect(fastForward({ sha, enabled: true, git: remote })).rejects.toThrow("there is no production branch");
    expect(remote.pushed).toEqual([]);
  });
});
