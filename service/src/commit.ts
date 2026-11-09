import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The file the image build writes the commit into, beside the service's `package.json`. */
export const commitFile = fileURLToPath(new URL("../COMMIT", import.meta.url));

/** The commit this copy serves: `HEDGEHUG_COMMIT` when set, else the file the image build wrote, else `unknown`. */
export function readCommit(env: NodeJS.ProcessEnv, file = commitFile): string {
  if (env.HEDGEHUG_COMMIT) return env.HEDGEHUG_COMMIT;
  if (existsSync(file)) return readFileSync(file, "utf8").trim() || "unknown";
  return "unknown";
}

/**
 * The commit a checkout's `HEAD` points at, read from its `.git` folder without a `git` binary,
 * so the slim build image can bake it in. `unknown` when there is no `.git` or the ref can't be found.
 */
export function gitHead(checkout: string): string {
  const gitDir = join(checkout, ".git");
  const read = (path: string) => (existsSync(join(gitDir, path)) ? readFileSync(join(gitDir, path), "utf8").trim() : undefined);
  const head = read("HEAD");
  if (!head) return "unknown";
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const ref = /^ref: (.+)$/.exec(head)?.[1];
  if (!ref) return "unknown";
  const loose = read(ref);
  if (loose && /^[0-9a-f]{40}$/.test(loose)) return loose;
  const packed = read("packed-refs")
    ?.split("\n")
    .map((line) => line.split(" "))
    .find(([, name]) => name === ref)?.[0];
  return packed && /^[0-9a-f]{40}$/.test(packed) ? packed : "unknown";
}
