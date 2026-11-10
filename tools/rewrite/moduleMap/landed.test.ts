// @vitest-environment node
// What the module map has landed in the service stays what its tools make of today's convex/ modules: the batch is
// closed, each module is its tool's output, a copy differs from its source only in its imports, and a converted
// module's zod schemas accept and reject as its Convex validators do.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { landAll } from "./bootstrap.ts";
import { importOnlyDiff } from "./copy.ts";
import { disagreements } from "./equivalence.ts";
import { servicePathOf } from "./imports.ts";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const read = (path: string) => readFileSync(join(repo, path), "utf8");
const { modules, problems } = landAll(repo);

test("the landed modules land without refusal and form a closed batch", () => {
  expect(problems).toEqual([]);
});

describe.each(modules)("$convexPath", ({ convexPath, servicePath, tool, text }) => {
  test("is what its tool makes of its source", () => {
    expect(read(servicePath)).toBe(text);
  });

  if (tool === "copy") {
    test("differs from its source only in its imports", () => {
      expect(importOnlyDiff(read(convexPath), read(servicePath))).toEqual([]);
    });
  } else {
    test("accepts and rejects as its Convex validators do", async () => {
      const convex: Record<string, unknown> = await import(join(repo, convexPath));
      const service: Record<string, unknown> = await import(join(repo, servicePathOf(convexPath)));
      const validators = Object.entries(convex).filter(([, value]) => (value as { isConvexValidator?: unknown } | null)?.isConvexValidator === true);
      for (const [name, validator] of validators) {
        expect(service[name], name).toHaveProperty("safeParse");
        expect(disagreements(validator as Parameters<typeof disagreements>[0], service[name] as Parameters<typeof disagreements>[1]), name).toEqual([]);
      }
    });
  }
});
