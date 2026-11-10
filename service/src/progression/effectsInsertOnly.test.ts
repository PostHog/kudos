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
  // Any update or delete, by method, by bracket or by name, and raw SQL, which could change rows behind the builder.
  expect(effectsSource).not.toMatch(/\b(update|delete|truncate)\b/i);
  expect(effectsSource).not.toMatch(/\bsql\b|\.execute\(/);
});
