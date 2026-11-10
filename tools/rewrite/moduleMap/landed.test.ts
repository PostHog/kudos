// @vitest-environment node
// What the module map has landed in the service stays what its tools make of today's convex/ modules: the batch is
// closed, each module is its tool's output and loads without running a stub, a copy differs from its source only in
// its imports, a converted module's zod schemas accept and reject as its Convex validators do, and nothing it wrote is
// registered yet.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { landAll } from "./bootstrap.ts";
import { importOnlyDiff } from "./copy.ts";
import { disagreements } from "./equivalence.ts";
import ts from "typescript5";
import { contracts } from "./contracts.ts";
import { convexRoot, parse, servicePathOf } from "./imports.ts";
import { landed } from "./landed.ts";

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
  } else if (tool !== "reexport") {
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
  // S1's module beside a sibling is S1's: only the sibling is the map's.
  const ours = modules.filter(({ convexPath, tool }) => !isTest(convexPath) && tool !== "reexport");
  const jobs = (await Promise.all(ours.map(({ servicePath }) => load(servicePath)))).flatMap((exports) => Object.values(exports).filter(isJob));

  expect(jobs.length).toBeGreaterThan(0);
  // By the job itself, not its name: S1 holds a placeholder under a name the map writes too (`analytics.drain.drain`),
  // which the stack that ports the module replaces.
  expect(jobs.filter((job) => registered.get(job.name) === job).map(({ name }) => name)).toEqual([]);
});

test("every contract stands for an export of a module the map holds", () => {
  expect(Object.keys(contracts).filter((convexPath) => !landed.includes(convexPath))).toEqual([]);
});

// What the generator leaves out that another module imports, each replaced by its stack's own design rather than ported.
const leftOut: Record<string, string> = {
  "convex/analytics/boundary.ts:observedAction": "a builder of Convex actions: each stack ports its actions as jobs, whose worker owns their failures",
  "convex/auth.ts:auth": "Convex Auth's wiring; the website platform's sign-in replaces it",
  "convex/bus/publish.ts:subscribers": "Convex's subscriber table; S1's registry holds each domain's subscriptions",
  "convex/slack/commands.ts:slackCommands": "an HTTP action of Convex's router; S1's front door routes Slack's commands",
  "convex/slack/interactivity.ts:slackInteractivity": "an HTTP action of Convex's router; S1's front door routes Slack's interactions",
  "convex/website/hosting.ts:registerWebsite": "it registers routes on Convex's router; the website platform serves the website",
  "convex/website/memberMutation.ts:memberMutation": "a builder of Convex mutations: the website's routes port onto the service's operations",
  "convex/website/memberQuery.ts:memberQuery": "a builder of Convex queries: the website's routes port onto the service's operations",
};

test("every import between convex/ modules names an export of the landed module, or one left out for a reason", () => {
  const batch = new Map(modules.map(({ servicePath, text }) => [servicePath, text]));
  const exportsOf = (servicePath: string): Set<string> | undefined => {
    const text = batch.get(servicePath) ?? (existsSync(join(repo, servicePath)) ? read(servicePath) : undefined);
    if (text === undefined) return undefined;
    const names = new Set<string>();
    for (const statement of parse(servicePath, text).statements) {
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) statement.exportClause.elements.forEach((element) => names.add(element.name.text));
      else if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isVariableStatement(statement)) statement.declarationList.declarations.forEach((declaration) => ts.isIdentifier(declaration.name) && names.add(declaration.name.text));
        else if ((statement as ts.DeclarationStatement).name) names.add((statement as ts.DeclarationStatement).name!.getText());
      }
    }
    return names;
  };
  const walk = (folder: string): string[] =>
    readdirSync(join(repo, folder), { withFileTypes: true }).flatMap((entry) => {
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) return entry.name === "_generated" ? [] : walk(path);
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
    });
  const missing = new Set<string>();
  for (const importer of walk(convexRoot)) {
    for (const statement of parse(importer, read(importer)).statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      if (!specifier.startsWith(".") || specifier.includes("_generated")) continue;
      const target = posix.normalize(posix.join(posix.dirname(importer), specifier)).replace(/(\.ts)?$/, ".ts");
      const bindings = statement.importClause?.namedBindings;
      const names = bindings && ts.isNamedImports(bindings) ? bindings.elements.map((element) => (element.propertyName ?? element.name).text) : [];
      const exported = exportsOf(servicePathOf(target));
      for (const name of names) if (!exported?.has(name)) missing.add(`${target}:${name}`);
    }
  }
  expect([...missing].filter((key) => !(key in leftOut)).sort()).toEqual([]);
  // A reason for a name that lands now is stale.
  expect(Object.keys(leftOut).filter((key) => !missing.has(key))).toEqual([]);
});
