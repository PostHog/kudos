// GB9, GB10: the groups domain's logs are only ever inserted. Ports convex/groups/attributionInsertOnly.test.ts,
// historyInsertOnly.test.ts and transitionsInsertOnly.test.ts onto the service's sources.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// Every module of the service but the tests and the schema, which declares the tables.
const root = fileURLToPath(new URL("..", import.meta.url));
const sources = Object.fromEntries(
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.startsWith(join("db", "schema")))
    .map((path) => [relative(root, join(root, path)), readFileSync(join(root, path), "utf8")]),
);

function modulesNaming(table: RegExp): string[] {
  return Object.entries(sources)
    .filter(([, source]) => table.test(source))
    .map(([path]) => path)
    .toSorted();
}

const rowWrites = /\.(update|delete)\(|patchDocument\(/;

describe("GB10: an attribution is only ever inserted, never changed or deleted", () => {
  test("only the attribution module names the table, and it never updates or deletes a row", () => {
    const attributionModule = join("groups", "attribution.ts");

    expect(modulesNaming(/\battributions\b/)).toEqual([attributionModule]);
    expect(sources[attributionModule]).toContain("insertDocument(ctx.tx, attributions,");
    expect(sources[attributionModule]).not.toMatch(rowWrites);
  });
});

describe("GB9: the primary group history is only ever inserted, never changed or deleted", () => {
  test("only the history module names the table, and it never updates or deletes a row", () => {
    const historyModule = join("groups", "history.ts");

    expect(modulesNaming(/\bprimaryGroupHistory\b/)).toEqual([historyModule]);
    expect(sources[historyModule]).toContain("insertDocument(ctx.tx, primaryGroupHistory,");
    expect(sources[historyModule]).not.toMatch(rowWrites);
  });
});

describe("GB9: the transition log is only ever inserted, never changed or deleted", () => {
  test("only the transitions module names its tables, and it never updates or deletes a row", () => {
    const transitionsModule = join("groups", "transitions.ts");

    expect(modulesNaming(/\b(userGroupDepartures|groupCountingChanges)\b/)).toEqual([transitionsModule]);
    expect(sources[transitionsModule]).toContain("insertDocument(ctx.tx, userGroupDepartures,");
    expect(sources[transitionsModule]).toContain("insertDocument(ctx.tx, groupCountingChanges,");
    expect(sources[transitionsModule]).not.toMatch(rowWrites);
  });
});
