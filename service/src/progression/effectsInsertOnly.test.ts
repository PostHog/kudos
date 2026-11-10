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

const effectsModule = join("progression", "effects.ts");

test("P8: effects records are only ever inserted, never changed or deleted", () => {
  const touchingEffectsRecords = Object.entries(sources)
    .filter(([, source]) => /\beffectsRecords\b/.test(source))
    .map(([path]) => path);
  const effectsSource = sources[effectsModule] ?? "";

  expect(touchingEffectsRecords).toEqual([effectsModule]);
  expect(effectsSource).toContain("ctx.tx.insert(effectsRecords)");
  // The code alone, so a comment may say what the module never does. Any update, upsert or delete, by method, by
  // bracket or by name, in any case or inside a longer name such as onConflictDoUpdate. And any raw statement, which
  // could change rows behind the builder; a `sql` fragment inside a read is fine.
  const code = withoutComments(effectsSource);
  expect(code).not.toMatch(/update|delete|truncate|upsert|onconflict/i);
  expect(code).not.toMatch(/\.execute\(|\$client|sql\.raw/);
});

/** Drops whole-line and block comments that start a line; a `//` inside a string can't hide the code after it. */
function withoutComments(source: string): string {
  return source.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
}
