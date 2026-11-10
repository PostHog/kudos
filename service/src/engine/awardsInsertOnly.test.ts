// R18, as today's convex/engine/awardsInsertOnly.test.ts proves it: awards are only ever inserted, never changed or
// deleted. Today's test lets only the awards module name the table and forbids any patch, replace or delete in it. In
// the service a module names the table by importing the Drizzle table `awards` from the schema, under any alias, so
// only the awards module may import it, it holds no update or delete at all, and it inserts. A module that imports the
// whole schema reaches every table by name; those are pinned, so a new one is looked at before it can write awards.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

type Source = readonly [path: string, text: string];

const sourceRoot = join(import.meta.dirname, "..");
const sources: Source[] = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.startsWith(join("db", "schema")))
  .map((path) => [relative(sourceRoot, join(sourceRoot, path)), readFileSync(join(sourceRoot, path), "utf8")] as const);

const awardsModule = join("engine", "awards.ts");
const schemaModule = /(?:^|\/)schema\/(?:index|engine)\.ts$/;
const namedFromSchema = /\b(?:import|export)\s+(?!type\b)\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
const wholeSchema = /\bimport\s+\*\s+as\s+\w+\s+from\s*["']([^"']+)["']/g;

/** Whether the module binds the schema's awards table by name, under any alias, in a value import or re-export. */
function namesAwards(text: string) {
  return [...text.matchAll(namedFromSchema)].some(([, names = "", from = ""]) => {
    return schemaModule.test(from) && names.split(",").some((name) => /^\s*awards(?:\s+as\s+\w+)?\s*$/.test(name));
  });
}

const importsWholeSchema = (text: string) => [...text.matchAll(wholeSchema)].some(([, from = ""]) => schemaModule.test(from));

/** What R18 finds wrong in these sources; nothing when awards are only inserted, by the awards module alone. */
function breachesOfR18(all: readonly Source[]) {
  const breaches: string[] = [];
  for (const [path, text] of all) {
    if (path !== awardsModule && namesAwards(text)) breaches.push(`${path} names the awards table`);
  }
  const awardsSource = all.find(([path]) => path === awardsModule)?.[1] ?? "";
  if (/\.(?:update|delete)\(/.test(awardsSource)) breaches.push(`${awardsModule} updates or deletes`);
  if (!/\.insert\(\s*awards\s*\)/.test(awardsSource)) breaches.push(`${awardsModule} inserts no award`);
  return breaches;
}

const inserting: Source = [awardsModule, 'import { awards } from "../db/schema/index.ts";\nawait ctx.tx.insert(awards).values(row);\n'];

describe("R18: awards are only ever inserted, never changed or deleted", () => {
  test("the service's sources insert awards in the awards module alone, and only the pinned modules reach every table", () => {
    expect(sources.length, "the service's sources read").toBeGreaterThan(100);
    expect(breachesOfR18(sources), "what R18 finds").toEqual([]);
    expect(sources.filter(([, text]) => importsWholeSchema(text)).map(([path]) => path).sort(), "the modules that import the whole schema").toEqual([
      // Moves the creation clock past every table's rows; it writes no row.
      join("db", "creationClock.ts"),
      // The cutover load copies Convex's export into empty tables, inserting only (S18).
      join("load", "loader.ts"),
    ]);
  });

  test("any update or delete in the awards module breaks it, however it is spelled", () => {
    for (const write of ["ctx.tx.delete(awards,)", "ctx.tx.delete(table)", "ctx.tx.update(awards).set({ kudos: 2 })"]) {
      const [path, text] = inserting;
      expect(breachesOfR18([[path, `${text}${write};\n`]]), write).toEqual([`${awardsModule} updates or deletes`]);
    }
  });

  test("another module naming the awards table breaks it, under an alias or beside other tables", () => {
    for (const binding of ["{ awards }", "{ awards as given }", "{ members, awards as rows, }"]) {
      const other: Source = [join("groups", "attribution.ts"), `import ${binding} from "../db/schema/index.ts";\n`];
      expect(breachesOfR18([inserting, other]), binding).toEqual([`${other[0]} names the awards table`]);
    }
    const typeOnly: Source = [join("groups", "attribution.ts"), 'import type { awards } from "../db/schema/engine.ts";\n'];
    expect(breachesOfR18([inserting, typeOnly]), "a type-only import").toEqual([]);
  });
});
