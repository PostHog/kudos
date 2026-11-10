import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// Every module of the service but the tests and the schema, which declares the table.
const root = fileURLToPath(new URL("..", import.meta.url));
const sources = Object.fromEntries(
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.startsWith(join("db", "schema")))
    .map((path) => [relative(root, join(root, path)), readFileSync(join(root, path), "utf8")]),
);

const rewardsModule = join("progression", "rewards.ts");

test("P87: reward records are only ever inserted, never changed or deleted", () => {
  const touchingRewardRecords = Object.entries(sources)
    .filter(([, source]) => /\brewardRecords\b/.test(source))
    .map(([path]) => path);
  const rewardsSource = sources[rewardsModule] ?? "";

  expect(touchingRewardRecords).toEqual([rewardsModule]);
  expect(rewardsSource).toContain("ctx.tx.insert(rewardRecords)");
  expect(rewardsSource).not.toMatch(/\.(update|delete)\(/);
});
