// The test-port ledger's check. The ledger is a Markdown table, one row per test file of the root `convex` Vitest
// project, sorted by path, so each stack edits only its own rows and a conflict keeps both sides:
// | Convex test | Stack | Ported to | Waits on |
// - Stack: the stack that ports the file, S1 to S20.
// - Ported to: the service test that ports it, from the repository's root; empty until it is ported.
// - Waits on: the stacks whose bodies the port reaches and that haven't merged them, space-separated; empty when none.
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Where the ledger lives, from the repository's root. */
export const ledgerPath = "service/testing/testPortLedger.md";

const header = ["Convex test", "Stack", "Ported to", "Waits on"];
const isStack = (text: string) => /^S([1-9]|1[0-9]|20)$/.test(text);
// A port is a service test by its plain path from the root: no `.` or `..` step, no backslash, no leading slash.
const isPortPath = (path: string) => /^service(\/[\w.-]+)+\.test\.ts$/.test(path) && !path.split("/").some((step) => step === "." || step === "..");

interface Row {
  file: string;
  stack: string;
  port: string;
  waits: string[];
}

/** What is wrong with the ledger's text, one line per problem; none when it is right. */
export function checkLedger(text: string, convexTests: readonly string[], exists: (path: string) => boolean): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => sameCells(cells(line), header));
  if (start < 0) return ["the ledger's table has no header row"];
  const problems: string[] = [];
  const rows: Row[] = [];
  for (const [i, line] of lines.entries()) {
    if (i <= start + 1 || !line.trim().startsWith("|")) continue;
    const row = cells(line);
    if (row.length !== header.length) {
      problems.push(`line ${i + 1} isn't a row of four columns`);
      continue;
    }
    const [file, stack, port, waits] = row as [string, string, string, string];
    rows.push({ file, stack, port, waits: waits.split(/\s+/).filter(Boolean) });
  }

  const known = new Set(convexTests);
  const seen = new Set<string>();
  for (const [i, { file, stack, port, waits }] of rows.entries()) {
    if (seen.has(file)) problems.push(`${file} has more than one row`);
    seen.add(file);
    if (!known.has(file)) problems.push(`${file} is no test of the convex project`);
    if (i > 0 && rows[i - 1]!.file > file) problems.push(`${file} is out of order: rows go by path`);
    for (const named of [stack, ...waits]) if (!isStack(named)) problems.push(`${file}: ${named} is no stack from S1 to S20`);
    if (port !== "" && !isPortPath(port)) problems.push(`${file}: its port ${port} isn't a test file under service/`);
    else if (port !== "" && !exists(port)) problems.push(`${file}: its port ${port} doesn't exist`);
    if (port === "" && waits.length > 0) problems.push(`${file} waits on ${waits.join(" ")} but has no port`);
  }
  for (const file of convexTests) if (!seen.has(file)) problems.push(`${file} has no row`);
  return problems;
}

/**
 * Every test file the root `convex` Vitest project runs, from the repository's root and sorted: `**\/*.test.ts`,
 * dot folders included, but not the root `node_modules`, `website` or `service` folders, as `vitest.config.ts` says.
 */
export function convexProjectTests(repository: string): string[] {
  const excluded = new Set(["node_modules", "website", "service", ".git"]);
  const walk = (folder: string, prefix: string): string[] =>
    readdirSync(join(repository, folder), { withFileTypes: true }).flatMap((entry) => {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) return prefix === "" && excluded.has(entry.name) ? [] : walk(path, `${path}/`);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
    });
  return walk("", "").sort();
}

function cells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function sameCells(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((cell, i) => cell === b[i]);
}
