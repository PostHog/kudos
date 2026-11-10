// R18, as today's convex/engine/awardsInsertOnly.test.ts proves it: awards are only ever inserted, never changed or
// deleted. In the service an award is written through the Drizzle table `awards`, so only the awards module writes it,
// and only by inserting.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const sourceRoot = join(import.meta.dirname, "..");
const sources = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
  .map((path) => [relative(sourceRoot, join(sourceRoot, path)), readFileSync(join(sourceRoot, path), "utf8")] as const);

const awardsModule = join("engine", "awards.ts");
const writesOf = (source: string) => [...source.matchAll(/\.(insert|update|delete)\(\s*awards\s*\)/g)].map(([, kind]) => kind);

test("R18: awards are only ever inserted, never changed or deleted", () => {
  const writing = sources.filter(([, source]) => writesOf(source).length > 0).map(([path]) => path);

  expect(sources.length, "the service's sources read").toBeGreaterThan(100);
  expect(writing, "the modules that write awards").toEqual([awardsModule]);
  expect(writesOf(sources.find(([path]) => path === awardsModule)?.[1] ?? ""), "how the awards module writes them").toEqual(["insert"]);
});
