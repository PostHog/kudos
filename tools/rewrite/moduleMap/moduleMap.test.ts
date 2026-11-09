// @vitest-environment node
// The copy tool, the codemod and the closure check on fixtures shaped like today's convex/ modules.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { v } from "convex/values";
import ts from "typescript5";
import { afterAll, describe, expect, test } from "vitest";
import { z } from "../../../service/node_modules/zod/index.js";
import { zv } from "../../../service/src/values.ts";
import { closureCheck, servicePackages } from "./closure.ts";
import { convertModule } from "./codemod.ts";
import { copyModule, importOnlyDiff } from "./copy.ts";
import { disagreements } from "./equivalence.ts";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures", import.meta.url));
// A fixture's convex/ path, as the tools see it, read from the fixtures folder.
const onDisk = (convexPath: string) => join(fixtures, convexPath);
const exists = (convexPath: string) => existsSync(onDisk(convexPath));
const read = (convexPath: string) => readFileSync(onDisk(convexPath), "utf8");
const landed = <T extends object>(result: T | { refusals: string[] }): T => {
  if ("refusals" in result) throw new Error(result.refusals.join("\n"));
  return result;
};

describe("the copy tool", () => {
  const source = read("convex/pure/format.ts");
  const copy = landed(copyModule("convex/pure/format.ts", source, exists));

  test("lands a pure module at its place in the service, with only its imports changed", () => {
    expect(copy.servicePath).toBe("service/src/pure/format.ts");
    expect(copy.text).toBe(
      source
        .replace('import type { Doc, Id } from "../_generated/dataModel";', 'import type { Doc } from "../db/schema/index.ts";\nimport type { Id } from "../db/columns.ts";')
        .replace('import { greeting } from "./helper";', 'import { greeting } from "./helper.ts";')
        .replace('export { greeting as hello } from "./helper";', 'export { greeting as hello } from "./helper.ts";'),
    );
    expect(importOnlyDiff(source, copy.text)).toEqual([]);
  });

  test("the import-only diff names a body line that changed, even a blank one in a string", () => {
    expect(importOnlyDiff(source, copy.text.replace("hello", "hullo").replace("${greeting}", "${greeting}!"))).toEqual([
      'line 2 without imports: "export { greeting as hello } from \\"\\";" became "export { greeting as hullo } from \\"\\";"',
      'line 5 without imports: "  return `${greeting}, ${member}" became "  return `${greeting}!, ${member}"',
    ]);
    expect(importOnlyDiff(source, copy.text.replace("\n\n${String", "\n${String"))).not.toEqual([]);
  });

  test("refuses a module that reaches Convex or imports what no edit can reach", () => {
    expect(copyModule("convex/ctx/handler.ts", read("convex/ctx/handler.ts"), exists)).toEqual({
      refusals: [
        "convex/ctx/handler.ts: imports convex/values: a copied module uses nothing from Convex; convert or rewrite it",
        "convex/ctx/handler.ts: imports ../_generated/server, which the service has no counterpart for",
      ],
    });
    expect(copyModule("convex/ctx/lazy.ts", read("convex/ctx/lazy.ts"), exists)).toEqual({ refusals: ["convex/ctx/lazy.ts: line 2: import(), which a copy can't change"] });
    expect(copyModule("convex/pure/format.ts", 'import { gone } from "./missing";', exists)).toEqual({ refusals: ["convex/pure/format.ts: imports ./missing, which names no module of convex/"] });
    expect(copyModule("convex/pure/format.ts", 'import values = require("convex/values");', exists)).toEqual({ refusals: ["convex/pure/format.ts: line 1: import = require(), which a copy can't change"] });
  });
});

describe("the closure check", () => {
  const packages = servicePackages(repo);
  const earlier = new Set(["service/src/db/columns.ts"]);
  const check = (batch: Record<string, string>) => closureCheck(new Map(Object.entries(batch)), (path) => earlier.has(path), packages);

  test("passes a batch whose imports resolve inside it, to an earlier batch, a built-in or a listed package", () => {
    expect(
      check({
        "service/src/a/one.ts": 'import { two } from "./two.ts";\nimport type { Id } from "../db/columns.ts";\nimport { z } from "zod";\nimport { join } from "node:path";',
        "service/src/a/two.ts": 'export { Hono } from "hono/tiny";\nexport type T = import("./one.ts").X;',
      }),
    ).toEqual([]);
  });

  test("refuses every import it can't resolve, with where it is", () => {
    expect(
      check({
        "service/src/a/one.ts": [
          'import { gone } from "./gone.ts";',
          'import { two } from "./two";',
          'import { v } from "convex/values";',
          'import satori from "satori";',
          'import { outside } from "../../../convex/schema.ts";',
          "const lazy = await import(`./${name}.ts`);",
          'import type Two = require("./two.ts");',
          'export * from "zod/does-not-exist";',
        ].join("\n"),
        "service/src/a/two.ts": "",
      }),
    ).toEqual([
      "service/src/a/one.ts: ./gone.ts: no module in the batch, an earlier batch or the foundation",
      "service/src/a/one.ts: ./two: a relative import names its .ts file in the service",
      "service/src/a/one.ts: convex/values: a Convex package",
      "service/src/a/one.ts: satori: a package the service doesn't list",
      "service/src/a/one.ts: ../../../convex/schema.ts: outside the service",
      "service/src/a/one.ts: <computed>: an import of a computed specifier",
      "service/src/a/one.ts: ./two.ts: an import = require(), which an ES module can't use",
      "service/src/a/one.ts: zod/does-not-exist: nothing zod exports",
    ]);
  });
});

describe("the codemod", () => {
  const modules = ["convex/rules/shared.ts", "convex/rules/events.ts", "convex/rules/split.ts", "convex/ctx/unconvertible.ts", "convex/ctx/handler.ts"];
  const program = ts.createProgram(modules.map(onDisk), { strict: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, skipLibCheck: true });
  const convert = (path: string) => convertModule(program, program.getSourceFile(onDisk(path))!, path, exists);
  const shared = landed(convert("convex/rules/shared.ts"));
  const events = landed(convert("convex/rules/events.ts"));

  test("turns each validator into zod, and the type helpers and validator reads with them", () => {
    expect(shared.text).toBe(`import { z } from "zod";

export const messageRefValidator = z.strictObject({ channel: z.string(), ts: z.string(), revision: z.optional(z.int64()) });
export type MessageRef = z.infer<typeof messageRefValidator>;

export const toneValidator = z.union([z.literal("warm"), z.literal("loud")]);
`);
    expect(landed(convert("convex/rules/split.ts")).text).toBe(`import { z } from "zod";

export const noteValidator = z.strictObject({ text: z.string() });
export type Note = z.infer<typeof noteValidator>;
`);
    for (const line of [
      'import { z } from "zod";\nimport { zv } from "../values.ts";',
      'import type { Doc } from "../db/schema/index.ts";\nimport type { Id } from "../db/columns.ts";',
      'import { messageRefValidator, toneValidator } from "./shared.ts";',
      "function domainEvent<Fields extends z.ZodRawShape>(fields: Fields) {",
      "  return z.strictObject({ ...fields, fact: z.optional(z.string()) });",
      '  member: zv.id("members"),',
      "  score: zv.number(),",
      "  note: z.union([z.string(), z.null()]),",
      "  tallies: zv.record(z.string(), z.union([zv.number(), zv.record(z.string(), z.boolean())])),",
      "export const appFields = new VObject().fields;",
      "export type CheerEvent = z.infer<typeof cheerEventValidator>;",
      "export type CheerShape = z.infer<typeof cheerEventValidator>;",
      'export const loudnessValidator = z.union([...toneValidator.options, z.literal("quiet"), z.literal(2), z.literal(3n), z.literal(false)]);',
      "export const tones: readonly string[] = toneValidator.options.map(({ value }) => value);",
      "export const fieldNames = ({ shape: fields }: typeof messageRefValidator) => Object.keys(fields);",
      "export const nothingValidator = z.never();",
      'const refArgs = { ...messageRefValidator.shape, member: zv.id("members") };',
      "export type RefArgs = z.infer<z.ZodObject<typeof refArgs>>;",
      'export const loudRefValidator = refValidator.extend({ tone: toneValidator }).omit({ "ts": true, "revision": true });',
      'export const channelOnlyValidator = messageRefValidator.pick({ "channel": true });',
      "  return line.fields.length + line.members + member.length + (row ? 1 : 0);",
    ]) {
      expect(events.text).toContain(line);
    }
  });

  test("refuses what it can't convert, with where it is", () => {
    expect(convert("convex/ctx/unconvertible.ts")).toEqual({
      refusals: [
        "convex/ctx/unconvertible.ts:3: v.any has no zod counterpart here",
        "convex/ctx/unconvertible.ts:4: reads kind of a Convex validator, which zod has no counterpart for",
        "convex/ctx/unconvertible.ts:5: uses v other than as a call or a type",
        "convex/ctx/unconvertible.ts:7: reads isOptional of a Convex validator, which zod has no counterpart for",
        "convex/ctx/unconvertible.ts:8: reads fields of a Convex validator, which zod has no counterpart for",
        "convex/ctx/unconvertible.ts:9: a record keyed other than by v.string(), which zod would require every key of",
        "convex/ctx/unconvertible.ts:10: reads a Convex validator's members other than by name",
        "convex/ctx/unconvertible.ts:11: reads a Convex validator's members other than by name",
      ],
    });
    expect(convert("convex/ctx/handler.ts")).toEqual({ refusals: ["convex/ctx/handler.ts: imports ../_generated/server, which the service has no counterpart for"] });
  });

  describe("its output in the service", () => {
    // The output lands in a scratch tree beside the service's own modules it imports, with the service's packages.
    const scratch = mkdtempSync(join(tmpdir(), "module-map-"));
    afterAll(() => rmSync(scratch, { recursive: true, force: true }));
    symlinkSync(join(repo, "service/node_modules"), join(scratch, "node_modules"));
    writeFileSync(join(scratch, "package.json"), JSON.stringify({ type: "module" }));
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), text);
    };
    for (const module of ["values.ts", "db/columns.ts", "db/schema/index.ts"]) {
      write(`src/${module}`, `export * from ${JSON.stringify(pathToFileURL(join(repo, "service/src", module)).href.replace("file://", ""))};\n`);
    }
    for (const { servicePath, text } of [shared, events]) write(relative("service", servicePath), text);

    test("typechecks under the service's compiler options", () => {
      const options = ts.parseJsonConfigFileContent(JSON.parse(readFileSync(join(repo, "service/tsconfig.json"), "utf8")), ts.sys, scratch).options;
      const files = [join(scratch, "src/rules/events.ts"), join(scratch, "src/rules/shared.ts")];
      const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options)).filter(({ file }) => file && files.includes(file.fileName));
      expect(diagnostics.map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n"))).toEqual([]);
    }, 60_000); // a whole program: seconds alone, longer beside the gate's other workers

    test("accepts and rejects what each Convex validator does", async () => {
      const convexModules = { shared: await import("./fixtures/convex/rules/shared.ts"), events: await import("./fixtures/convex/rules/events.ts") };
      const zodModules = { shared: await import(join(scratch, "src/rules/shared.ts")), events: await import(join(scratch, "src/rules/events.ts")) };
      const compared: string[] = [];
      for (const name of ["shared", "events"] as const) {
        for (const [exported, validator] of Object.entries(convexModules[name]).filter(([key]) => key.endsWith("Validator"))) {
          compared.push(exported);
          expect(disagreements(validator as never, zodModules[name][exported]), exported).toEqual([]);
        }
      }
      expect(compared).toEqual(["messageRefValidator", "toneValidator", "cheerEventValidator", "loudnessValidator", "nothingValidator", "refValidator", "loudRefValidator", "channelOnlyValidator"]);
    });
  });
});

describe("the equivalence check", () => {
  test("finds what a hand-made zod schema would judge apart from Convex", () => {
    expect(disagreements(v.object({ a: v.number() }), z.object({ a: z.number() }))).toEqual(
      expect.arrayContaining(['{"a":"NaN"}: Convex accepts, zod rejects', '{"a":0,"unknownField":0}: Convex rejects, zod accepts']),
    );
    expect(disagreements(v.id("members"), zv.id("members"))).toEqual([]);
    expect(disagreements(v.int64(), z.bigint())).toEqual(['"9223372036854775808n": Convex rejects, zod accepts']);
    expect(disagreements(v.string(), z.string().optional())).toEqual(["undefined: Convex rejects, zod accepts"]);
    expect(disagreements(v.array(v.string()), z.array(z.string().optional()))).toEqual(["[null]: Convex rejects, zod accepts"]);
    expect(disagreements(v.record(v.string(), v.boolean()), z.record(z.string(), z.boolean()))).toEqual([
      '{"":true}: Convex rejects, zod accepts',
      '{"$dollar":true}: Convex rejects, zod accepts',
      '{"_underscore":true}: Convex rejects, zod accepts',
      '{"é":true}: Convex rejects, zod accepts',
      '{"tab\\t":true}: Convex rejects, zod accepts',
      `{"${"k".repeat(1025)}":true}: Convex rejects, zod accepts`,
    ]);
  });
});
