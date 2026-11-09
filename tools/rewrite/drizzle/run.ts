// Run once, from the repo root, to write service/src/db/schema/ from today's convex/schema.ts:
//   node --experimental-transform-types --no-warnings --import ./tools/rewrite/resolveTs.ts tools/rewrite/drizzle/run.ts
// Then: cd service && pnpm exec drizzle-kit generate --name <name>
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { archivedTables } from "./archivedTables.ts";
import { generate, type ExportedSchema } from "./generate.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const out = join(root, "service/src/db/schema");


const { default: schema } = (await import(join(root, "convex/schema.ts"))) as { default: { export(): string } };
const exported = JSON.parse(schema.export()) as ExportedSchema;

// Each table goes to the domain folder whose code inserts it most; failing that, the one that names it most.
// Code at convex/'s root (sign-in) counts as the website's. Tables no code names any more go where their validator lives.
const unnamed: Record<string, string> = { thoughtfulTallies: "album", boardCountedAwards: "album", homes: "feedback" };
const sources = files(join(root, "convex")).map((path) => ({ domain: domainOfPath(path), text: readFileSync(path, "utf8") }));
const domains = new Map<string, string>();
for (const { tableName } of exported.tables.filter(({ tableName }) => !archivedTables.has(tableName))) {
  const pick = (pattern: RegExp) => {
    const counts = new Map<string, number>();
    for (const { domain, text } of sources) counts.set(domain, (counts.get(domain) ?? 0) + (text.match(pattern)?.length ?? 0));
    const [best] = [...counts].filter(([, count]) => count > 0).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
    return best?.[0];
  };
  const domain = pick(new RegExp(`insert\\(\\s*"${tableName}"`, "g")) ?? pick(new RegExp(`"${tableName}"`, "g")) ?? unnamed[tableName];
  if (!domain) throw new Error(`No code names the table ${tableName}`);
  domains.set(tableName, domain);
}

const { files: output, mixedIndexFields } = generate(exported, (table) => domains.get(table)!, archivedTables);
mkdirSync(out, { recursive: true });
for (const [path, source] of Object.entries(output)) writeFileSync(join(out, path), source);
console.log(`wrote ${Object.keys(output).length} files to ${relative(root, out)}`);
console.log(`indexed fields stored as jsonb:\n${mixedIndexFields.map((line) => `  ${line}`).join("\n")}`);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "_generated" || name === "node_modules") return [];
    if (statSync(path).isDirectory()) return files(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

function domainOfPath(path: string): string {
  const parts = relative(join(root, "convex"), path).split(sep);
  return parts.length > 1 ? parts[0]! : "website";
}
