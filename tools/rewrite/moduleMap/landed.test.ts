// @vitest-environment node
// What the module map has landed in the service stays what its tools make of today's convex/ modules: the batch is
// closed, each module is its tool's output and loads without running a stub, a copy differs from its source only in
// its imports, a converted module's zod schemas accept and reject as its Convex validators do, and nothing it wrote is
// registered yet.
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
const load = (servicePath: string): Promise<Record<string, unknown>> => import(join(repo, servicePath));
// A ported test is a module the service's test runner loads, not one another module imports.
const isTest = (convexPath: string) => convexPath.endsWith(".test.ts");

test("the landed modules land without refusal and form a closed batch", () => {
  expect(problems).toEqual([]);
});

describe.each(modules)("$convexPath", ({ convexPath, servicePath, tool, text }) => {
  test("is what its tool makes of its source", () => {
    expect(read(servicePath)).toBe(text);
  });

  if (!isTest(convexPath)) {
    test("loads without running a stub", async () => {
      await expect(load(servicePath)).resolves.toBeDefined();
    });
  }

  if (tool === "copy") {
    test("differs from its source only in its imports", () => {
      expect(importOnlyDiff(read(convexPath), read(servicePath))).toEqual([]);
    });
  } else {
    test("accepts and rejects as its Convex validators do", async () => {
      const convex: Record<string, unknown> = await import(join(repo, convexPath));
      const service = await load(servicePathOf(convexPath));
      const validators = Object.entries(convex).filter(([, value]) => (value as { isConvexValidator?: unknown } | null)?.isConvexValidator === true);
      for (const [name, validator] of validators) {
        expect(service[name], name).toHaveProperty("safeParse");
        expect(disagreements(validator as Parameters<typeof disagreements>[0], service[name] as Parameters<typeof disagreements>[1]), name).toEqual([]);
      }
    });
  }
});

test("nothing the module map wrote is registered yet", async () => {
  const { serviceRegistry } = await load("service/src/registry.ts");
  const registered = (serviceRegistry as { jobs: ReadonlyMap<string, unknown> }).jobs;
  const isJob = (value: unknown): value is { name: string; kind: string } => typeof value === "object" && value !== null && "handler" in value && "kind" in value && "name" in value;
  const jobs = (await Promise.all(modules.filter(({ convexPath }) => !isTest(convexPath)).map(({ servicePath }) => load(servicePath)))).flatMap((exports) => Object.values(exports).filter(isJob));

  expect(jobs.length).toBeGreaterThan(0);
  // By the job itself, not its name: S1 holds a placeholder under a name the map writes too (`analytics.drain.drain`),
  // which the stack that ports the module replaces.
  expect(jobs.filter((job) => registered.get(job.name) === job).map(({ name }) => name)).toEqual([]);
});
