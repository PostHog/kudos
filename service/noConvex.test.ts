// The service is the rewrite: no Convex package and no module from today's convex/ folder, ever.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL(".", import.meta.url));
// This file names forbidden imports in strings, as fixtures of the check itself.
const self = fileURLToPath(import.meta.url);
const forbiddenPackage = /^(convex|convex-test|@posthog\/convex)(\/|$)|^@convex-dev\//;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const path = join(dir, entry.name);
    if (path === self) return [];
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

/** Every module specifier a file names in an import, an export-from, a dynamic import or a require. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const patterns = [/\b(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g, /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) found.push(match[1]!);
  return found;
}

function convexImports(file: string, source: string): string[] {
  const outside = (specifier: string) => specifier.startsWith(".") && relative(root, join(file, "..", specifier)).startsWith("..");
  return specifiers(source).filter((specifier) => forbiddenPackage.test(specifier) || outside(specifier));
}

test("no service module imports a Convex package or anything outside the service folder", () => {
  const offenders = sourceFiles(root).flatMap((file) =>
    convexImports(file, readFileSync(file, "utf8")).map((specifier) => `${relative(root, file)}: ${specifier}`),
  );

  expect(offenders).toEqual([]);
});

test("the service's package lists no Convex package", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
  const packages = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((field) => Object.keys(manifest[field] ?? {}));

  expect(packages.filter((name) => forbiddenPackage.test(name))).toEqual([]);
});

test("the check catches each way a file could reach Convex", () => {
  const file = join(root, "src", "domain", "module.ts");
  const source = [
    'import { v } from "convex/values";',
    'import type { Doc } from "../../../convex/_generated/dataModel";',
    'export { thing } from "@convex-dev/auth/server";',
    'const lazy = await import("convex-test");',
    'import "@posthog/convex";',
    'import { fine } from "../fine.ts";',
    'import { Hono } from "hono";',
  ].join("\n");

  expect(convexImports(file, source)).toEqual(["convex/values", "../../../convex/_generated/dataModel", "@convex-dev/auth/server", "@posthog/convex", "convex-test"]);
});
