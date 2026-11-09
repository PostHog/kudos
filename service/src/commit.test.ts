import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, onTestFinished, test } from "vitest";
import { gitHead, readCommit } from "./commit.ts";

function repository() {
  const dir = mkdtempSync(join(tmpdir(), "hedgehug-commit-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
  git("init", "-q", "-b", "main");
  git("commit", "-q", "--allow-empty", "-m", "one");
  return { dir, git };
}

test("the image build reads HEAD's commit from a branch, a packed branch or a detached HEAD without git", () => {
  const { dir, git } = repository();
  expect(gitHead(dir), "a loose branch ref").toBe(git("rev-parse", "HEAD"));

  git("pack-refs", "--all");
  expect(gitHead(dir), "a packed branch ref").toBe(git("rev-parse", "HEAD"));

  git("commit", "-q", "--allow-empty", "-m", "two");
  git("checkout", "-q", "--detach");
  expect(gitHead(dir), "a detached HEAD").toBe(git("rev-parse", "HEAD"));
});

test("without a .git folder the commit is unknown", () => {
  const dir = mkdtempSync(join(tmpdir(), "hedgehug-commit-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  expect(gitHead(dir)).toBe("unknown");
});

test("the served commit is HEDGEHUG_COMMIT when set, else the baked file, else unknown", () => {
  const dir = mkdtempSync(join(tmpdir(), "hedgehug-commit-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "COMMIT");

  expect(readCommit({}, file), "no env, no file").toBe("unknown");
  writeFileSync(file, "abc123\n");
  expect(readCommit({}, file), "the baked file").toBe("abc123");
  expect(readCommit({ HEDGEHUG_COMMIT: "def456" }, file), "the env wins").toBe("def456");
});
