// The test-port ledger: every test file of the root `convex` Vitest project, the stack that ports it, where its port
// lives once there is one, and the stacks whose bodies that port waits on.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { checkLedger, convexProjectTests, ledgerPath } from "./testPortLedger.ts";

const repository = fileURLToPath(new URL("../..", import.meta.url));

const header = ["| Convex test | Stack | Ported to | Waits on |", "| --- | --- | --- | --- |"];
const ledger = (...rows: string[]) => [...header, ...rows].join("\n");
const tests = ["convex/a.test.ts", "convex/b.test.ts"];
const ports = new Set(["service/src/a.test.ts"]);
const check = (text: string) => checkLedger(text, tests, (path) => ports.has(path));

describe("the test-port ledger", () => {
  test("lists every test file of the convex project once, sorted, each with its owning stack and any port and waits right", () => {
    const files = convexProjectTests(repository);

    expect(files, "the convex project's own files").toContain(".github/workflows/gate.test.ts");
    expect(files.filter((file) => /^(service|website|node_modules)\//.test(file)), "the other projects' files").toEqual([]);
    expect(checkLedger(readFileSync(join(repository, ledgerPath), "utf8"), files, (path) => existsSync(join(repository, path)) && statSync(join(repository, path)).isFile())).toEqual([]);
  });

  test("the check passes a well-kept ledger", () => {
    expect(check(ledger("| convex/a.test.ts | S4 | service/src/a.test.ts | S5 S6 |", "| convex/b.test.ts | S20 | | |"))).toEqual([]);
  });

  test("the check names each way a ledger goes wrong", () => {
    const ok = "| convex/b.test.ts | S20 | | |";
    expect(check(ledger(ok)), "a file with no row").toEqual(["convex/a.test.ts has no row"]);
    expect(check(ledger("| convex/a.test.ts | S4 | | |", ok, "| convex/gone.test.ts | S4 | | |")), "a row for no file").toEqual([
      "convex/gone.test.ts is no test of the convex project",
    ]);
    expect(check(ledger("| convex/a.test.ts | S4 | | |", "| convex/a.test.ts | S5 | | |", ok)), "a repeated row").toEqual(["convex/a.test.ts has more than one row"]);
    expect(check(ledger("| convex/a.test.ts | S21 | | |", ok)), "a stack that isn't one").toEqual(["convex/a.test.ts: S21 is no stack from S1 to S20"]);
    expect(check(ledger("| convex/a.test.ts | S4 | service/src/missing.test.ts | |", ok)), "a port that isn't there").toEqual([
      "convex/a.test.ts: its port service/src/missing.test.ts doesn't exist",
    ]);
    expect(check(ledger("| convex/a.test.ts | S4 | | S5 |", ok)), "waiting without a port").toEqual(["convex/a.test.ts waits on S5 but has no port"]);
    expect(check(ledger("| convex/a.test.ts | S4 | service/src/a.test.ts | S0 |", ok)), "waiting on no stack").toEqual(["convex/a.test.ts: S0 is no stack from S1 to S20"]);
    expect(check(ledger(ok, "| convex/a.test.ts | S4 | | |")), "rows out of order").toEqual(["convex/a.test.ts is out of order: rows go by path"]);
    expect(check(ledger("| convex/a.test.ts | S4 | |", ok)), "a row with a column missing").toContain("line 3 isn't a row of four columns");
    expect(check(["| Test | Stack |", ...ledger(ok).split("\n").slice(1)].join("\n")), "another header").toContain("the ledger's table has no header row");
    expect(check(ledger("| convex/a.test.ts | S4 | | |", ok, "  | convex/c.test.ts | S21 | | S0 |")), "an indented row is a row").toEqual([
      "convex/c.test.ts is no test of the convex project",
      "convex/c.test.ts: S21 is no stack from S1 to S20",
      "convex/c.test.ts: S0 is no stack from S1 to S20",
      "convex/c.test.ts waits on S0 but has no port",
    ]);
  });

  test("every line of the table is a whole row, outer pipes and all, until a blank line ends it", () => {
    const ok = "| convex/b.test.ts | S20 | | |";
    expect(check(ledger("| convex/a.test.ts | S4 | | |", ok, "convex/a.test.ts | S21 | README.md | S0 |")), "a row without its outer pipes").toEqual([
      "line 5 isn't a row of four columns",
    ]);
    expect(check(`${ledger("| convex/a.test.ts | S4 | | |", ok)}\n\nA paragraph after the table, with a | in it.`), "text after the table").toEqual([]);
  });

  test("a port is a service test file by its plain path from the repository's root", () => {
    const anything = (port: string) => checkLedger(ledger(`| convex/a.test.ts | S4 | ${port} | |`, "| convex/b.test.ts | S20 | | |"), tests, () => true);
    for (const port of ["README.md", "service/src", "service/src/a.ts", "convex/a.test.ts", "service/../convex/a.test.ts", "service/src/./a.test.ts", "/service/src/a.test.ts", "service\\src\\a.test.ts"]) {
      expect(anything(port), port).toEqual([`convex/a.test.ts: its port ${port} isn't a test file under service/`]);
    }
    expect(anything("service/src/engine/engine.test.ts")).toEqual([]);
  });
});
