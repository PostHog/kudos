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
import { NotPortedError } from "../../../service/src/notPorted.ts";
import { zv } from "../../../service/src/values.ts";
import { closureCheck, servicePackages } from "./closure.ts";
import { convertModule } from "./codemod.ts";
import { copyModule, importOnlyDiff } from "./copy.ts";
import { disagreements } from "./equivalence.ts";
import { reachedByName, skeletonModule } from "./skeleton.ts";

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
const compilerOptions = { strict: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, skipLibCheck: true };

/**
 * A scratch service: tools' output lands beside re-exports of the service's own modules it imports, with the
 * service's packages, so it typechecks under the service's compiler options and imports for real.
 */
function scratchService(serviceModules: string[], output: Array<{ servicePath: string; text: string }>) {
  const scratch = mkdtempSync(join(tmpdir(), "module-map-"));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));
  symlinkSync(join(repo, "service/node_modules"), join(scratch, "node_modules"));
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ type: "module" }));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  };
  for (const module of serviceModules) {
    write(`src/${module}`, `export * from ${JSON.stringify(pathToFileURL(join(repo, "service/src", module)).href.replace("file://", ""))};\n`);
  }
  const files = output.map(({ servicePath, text }) => {
    write(relative("service", servicePath), text);
    return join(scratch, relative("service", servicePath));
  });
  return {
    path: (servicePath: string) => join(scratch, relative("service", servicePath)),
    diagnostics: () => {
      const options = ts.parseJsonConfigFileContent(JSON.parse(readFileSync(join(repo, "service/tsconfig.json"), "utf8")), ts.sys, scratch).options;
      const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options)).filter(({ file }) => file && files.includes(file.fileName));
      return diagnostics.map(({ file, start, messageText }) => `${relative(scratch, file!.fileName)}:${file!.getLineAndCharacterOfPosition(start!).line + 1}: ${ts.flattenDiagnosticMessageText(messageText, "\n")}`);
    },
  };
}

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
        "service/src/a/one.ts": 'import { two } from "./two.ts";\nimport type { Id } from "../db/columns.ts";\nimport { z } from "zod";\nimport { join } from "node:path";\nimport { test } from "node:test";',
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
  const program = ts.createProgram(modules.map(onDisk), compilerOptions);
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
        "convex/ctx/unconvertible.ts:12: reads a Convex validator's members other than by name",
        "convex/ctx/unconvertible.ts:14: a record keyed other than by v.string(), which zod would require every key of",
        "convex/ctx/unconvertible.ts:15: reads a Convex validator's members other than by name",
        "convex/ctx/unconvertible.ts:16: reads isOptional of a Convex validator, which zod has no counterpart for",
        "convex/ctx/unconvertible.ts:17: reads isOptional of a Convex validator, which zod has no counterpart for",
        "convex/ctx/unconvertible.ts:18: reads isOptional of a Convex validator, which zod has no counterpart for",
        "convex/ctx/unconvertible.ts:19: reads isOptional of a Convex validator, which zod has no counterpart for",
        "convex/ctx/unconvertible.ts:20: reads a member of an optional Convex validator, which zod wraps in z.optional",
        "convex/ctx/unconvertible.ts:21: passes type arguments to v.object, which zod's builders take differently",
      ],
    });
    expect(convert("convex/ctx/handler.ts")).toEqual({ refusals: ["convex/ctx/handler.ts: imports ../_generated/server, which the service has no counterpart for"] });
  });

  describe("its output in the service", () => {
    const scratch = scratchService(["values.ts", "db/columns.ts", "db/schema/index.ts"], [shared, events]);

    test("typechecks under the service's compiler options", () => {
      expect(scratch.diagnostics()).toEqual([]);
    }, 60_000); // a whole program: seconds alone, longer beside the gate's other workers

    test("accepts and rejects what each Convex validator does", async () => {
      const convexModules = { shared: await import("./fixtures/convex/rules/shared.ts"), events: await import("./fixtures/convex/rules/events.ts") };
      const zodModules = { shared: await import(scratch.path(shared.servicePath)), events: await import(scratch.path(events.servicePath)) };
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
    expect(disagreements(v.array(v.string()), z.array(z.string().optional()))).toEqual(["[undefined]: Convex rejects, zod accepts"]);
    expect(disagreements(v.record(v.string(), v.string()), z.record(z.string(), z.string().optional()))).toContain('{"key":undefined}: Convex rejects, zod accepts');
    expect(disagreements(v.record(v.string(), v.boolean()), z.record(z.string(), z.boolean()))).toEqual([
      '{"":true}: Convex rejects, zod accepts',
      '{"$dollar":true}: Convex rejects, zod accepts',
      '{"_underscore":true}: Convex rejects, zod accepts',
      '{"__proto__":true}: Convex rejects, zod accepts',
      '{"é":true}: Convex rejects, zod accepts',
      '{"tab\\t":true}: Convex rejects, zod accepts',
      `{"${"k".repeat(1025)}":true}: Convex rejects, zod accepts`,
    ]);
  });
});

describe("the skeleton generator", () => {
  const modules = ["convex/skeleton/awards.ts", "convex/skeleton/caller.ts", "convex/skeleton/tangled.ts", "convex/skeleton/edges.ts", "convex/skeleton/refused.ts", "convex/skeleton/inline.ts", "convex/skeleton/shadowed.ts", "convex/skeleton/appTypes.ts", "convex/skeleton/helpers.ts"];
  const program = ts.createProgram(modules.map(onDisk), compilerOptions);
  const sourceFiles = modules.map((module) => program.getSourceFile(onDisk(module))!);
  const reached = reachedByName(sourceFiles);
  const skeleton = (index: number) => skeletonModule(program, sourceFiles[index]!, modules[index]!, reached, exists);
  const awards = landed(skeleton(0));
  const edges = landed(skeleton(3));
  const appTypes = landed(skeleton(7));
  const helpers = landed(skeleton(8));

  test("finds every function reached by name: run in place by an action, or later by the scheduler, a cron or the bus", () => {
    expect(Object.fromEntries([...reached].map(([path, how]) => [path, [...how]]))).toEqual({
      "skeleton.awards.notifyAll": ["job"],
      "skeleton.awards.sweepAwards": ["job"],
      "skeleton.edges.byValidator": ["job"],
      "skeleton.edges.byShorthand": ["job"],
      "skeleton.edges.viaAlias": ["job"],
      "skeleton.appTypes.noArgs": ["job"],
      "skeleton.awards.memberOf": ["run"],
      "skeleton.awards.recordAward": ["run"],
    });
  });

  test("lands what needs no context as it is, and every other export another module reaches as a stub in the service's types", () => {
    expect(awards.servicePath).toBe("service/src/skeleton/awards.ts");
    expect(awards.text).toBe(`// The module map's skeleton of convex/skeleton/awards.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import { zv } from "../values.ts";
import type { Id } from "../db/columns.ts";
import type { Doc } from "../db/schema/index.ts";
import type { ActionContext, MutationContext, QueryContext } from "../operations.ts";
import { notPorted, notPortedValue } from "../notPorted.ts";
import { mutationJob, actionJob } from "../jobs/define.ts";

export const awardIdValidator = z.union([z.literal("first"), z.literal("tenth")]);
export type AwardId = z.infer<typeof awardIdValidator>;

const DAY = 86_400_000;

/** The day an award counts on. */
export function dayOf(at: number): number {
  return Math.floor(at / DAY);
}

type Tally = { member: Id<"members">; count: number };

export type Hook = { claims: (ctx: QueryContext, text: string) => Promise<boolean> };

export const awardHook: Hook = notPortedValue("skeleton.awards.awardHook");

export async function tallyOf(ctx: QueryContext, member: Id<"members">): Promise<Tally> {
  throw notPorted("skeleton.awards.tallyOf");
}

export async function grant(ctx: MutationContext, member: Id<"members">, award: AwardId): Promise<void> {
  throw notPorted("skeleton.awards.grant");
}

export function kindOf(): string {
  throw notPorted("skeleton.awards.kindOf");
}

export const recordAwardArgs = z.strictObject({ member: zv.id("members"), award: awardIdValidator });
export async function recordAward(ctx: MutationContext, args: z.infer<typeof recordAwardArgs>): Promise<null> {
  throw notPorted("skeleton.awards.recordAward");
}

export const sweepAwardsArgs = z.strictObject({ before: z.optional(zv.number()) });
export async function sweepAwards(ctx: MutationContext, args: z.infer<typeof sweepAwardsArgs>): Promise<void> {
  throw notPorted("skeleton.awards.sweepAwards");
}
export const sweepAwardsJob = mutationJob("skeleton.awards.sweepAwards", sweepAwardsArgs, sweepAwards);

export const memberOfArgs = z.strictObject({ member: zv.id("members") });
export async function memberOf(ctx: QueryContext, args: z.infer<typeof memberOfArgs>): Promise<null | Doc<"members">> {
  throw notPorted("skeleton.awards.memberOf");
}

export const notifyAllArgs = z.strictObject({ note: z.string() });
export async function notifyAll(ctx: ActionContext, args: z.infer<typeof notifyAllArgs>): Promise<null | Doc<"members">> {
  throw notPorted("skeleton.awards.notifyAll");
}
export const notifyAllJob = actionJob("skeleton.awards.notifyAll", notifyAllArgs, notifyAll);
`);
    expect(awards.omitted).toEqual(["nobodyCalls: a registered query no module reaches by name"]);
  });

  test("leaves out Convex's machinery and what nobody reaches, and refuses an export that needs either", () => {
    expect(landed(skeleton(1)).omitted).toEqual(["scheduled: Convex's machinery, not a function or value over a context", "kickOff: a registered action no module reaches by name"]);
    expect(skeleton(2)).toEqual({
      refusals: [
        "convex/skeleton/tangled.ts:4: Target is over a context or Convex's machinery, and an export that lands needs it",
        "convex/skeleton/tangled.ts:8: reads kind of a Convex validator, which zod has no counterpart for",
      ],
    });
  });

  test("knows Convex's names by what they refer to, a context behind a union, and lands what statements and lists export", () => {
    expect(edges.text).toBe(`// The module map's skeleton of convex/skeleton/edges.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { z } from "zod";
import type { Id } from "../db/columns.ts";
import type { Page } from "../db/page.ts";
import type { Doc } from "../db/schema/index.ts";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

type AnyCtx = QueryContext | MutationContext;

export async function countAny(ctx: AnyCtx): Promise<number> {
  throw notPorted("skeleton.edges.countAny");
}

export const firstName: (ctx: QueryContext) => Promise<string> = async (ctx): Promise<string> => {
  throw notPorted("skeleton.edges.firstName");
};

export async function stamped(ctx: QueryContext, member: Id<"members">): Promise<{ _id: Id<"members">; _creationTime: number; extra: string }> {
  throw notPorted("skeleton.edges.stamped");
}

export async function projected(ctx: QueryContext, member: Id<"members">): Promise<{ _creationTime: number; _id: Id<"members"> }> {
  throw notPorted("skeleton.edges.projected");
}

export async function indexed(ctx: QueryContext, member: Id<"members">): Promise<{ _id: Id<"members">; _creationTime: number; name: string; xp: number; [key: string]: unknown }> {
  throw notPorted("skeleton.edges.indexed");
}

export type Drafts = Page<Omit<Doc<"members">, "_id" | "_creationTime">>;

const names = new Map<string, number>();
names.set("first", 1);

const half = (n: number) => n / 2;
export { half, names };

export const cache = new Map<string, number>();
const seeded = cache.set("first", 1);
const called = (() => cache.set("called", 1))();
class Seeder {
  static seeded = cache.set("static", 1);
}
const cast = ((() => cache.set("cast", 1)) as () => unknown)();
const viaCall = (() => cache.set("call", 1)).call(null);
class Computed {
  static [cache.set("computed", 1).size]() {}
}

const query = (fn: () => number) => fn();
export const answer = query(() => 42);

export const byValidatorArgs = z.strictObject({ note: z.string() });
export async function byValidator(ctx: MutationContext, args: z.infer<typeof byValidatorArgs>): Promise<null> {
  throw notPorted("skeleton.edges.byValidator");
}
export const byValidatorJob = mutationJob("skeleton.edges.byValidator", byValidatorArgs, byValidator);

const args = z.strictObject({ note: z.string() });

export const byShorthandArgs = args;
export async function byShorthand(ctx: MutationContext, args: z.infer<typeof byShorthandArgs>): Promise<null> {
  throw notPorted("skeleton.edges.byShorthand");
}
export const byShorthandJob = mutationJob("skeleton.edges.byShorthand", byShorthandArgs, byShorthand);

export const viaAliasArgs = z.strictObject({});
export async function viaAlias(ctx: QueryContext, args: z.infer<typeof viaAliasArgs>): Promise<null> {
  throw notPorted("skeleton.edges.viaAlias");
}
`);
    expect(edges.omitted).toEqual([
      'build: returns a constructor, { new (): { value: string; }; _id: Id<"members">; }',
      "internalQuery: Convex's machinery, exported by a list",
      "readerSeed: state over a context or Convex's machinery that only stubbed bodies read",
    ]);
  });

  test("tells the app's own types from Convex's, and keeps overloads, tuples, body-local types and a handler's own args", () => {
    expect(appTypes.text).toBe(`// The module map's skeleton of convex/skeleton/appTypes.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
import { query } from "./helpers.ts";
import { z } from "zod";
import type { MutationContext, QueryContext } from "../operations.ts";
import { notPorted } from "../notPorted.ts";
import { mutationJob } from "../jobs/define.ts";

type Id<T> = { value: T };
type QueryCtx = { value: string };

export function plainRead(ctx: QueryCtx): string {
  return ctx.value;
}

export async function wrapped(ctx: QueryContext): Promise<Id<"members">> {
  throw notPorted("skeleton.appTypes.wrapped");
}

export async function local(ctx: QueryContext): Promise<{ n: number }> {
  throw notPorted("skeleton.appTypes.local");
}

export function tupled(ctx: QueryContext): readonly [string, (boolean | undefined)?, ...number[]] {
  throw notPorted("skeleton.appTypes.tupled");
}

export function pick(ctx: QueryContext, key: string): Promise<string>;
export function pick(ctx: QueryContext, key: number): Promise<number>;
export async function pick(ctx: QueryContext, key: string | number): Promise<string | number> {
  throw notPorted("skeleton.appTypes.pick");
}

export const settings: Record<string, boolean> = {};
const ready = Object.assign(settings, { ready: true });

export const noArgsArgs = z.custom<{ note: string }>();
export async function noArgs(ctx: MutationContext, args: z.infer<typeof noArgsArgs>): Promise<string> {
  throw notPorted("skeleton.appTypes.noArgs");
}
export const noArgsJob = mutationJob("skeleton.appTypes.noArgs", noArgsArgs, noArgs);

// ReviewHog's second round: a built-in generic over a private type, an imported helper named like a builder, a
// parameter named like a private helper over a context, and an enum a printed type would name.
type Row = { n: number };
export function rows(ctx: QueryContext): Map<string, Row> {
  throw notPorted("skeleton.appTypes.rows");
}

export const answer = query(() => 42);
export function keyed(ctx: QueryContext, key: string): string {
  throw notPorted("skeleton.appTypes.keyed");
}
`);
    expect(appTypes.omitted).toEqual(["kind: names the enum Kind, which the service's erasableSyntaxOnly has no counterpart for"]);
  });

  test("imports a service helper only where a stub writes it, not for a module's own of the same name", () => {
    expect(helpers.text).toBe(`// The module map's skeleton of convex/skeleton/helpers.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
// A module of plain helpers that share names with Convex's builder and the service's stub helper: no context anywhere.
export function query<T>(make: () => T): T {
  return make();
}

export function notPorted() {
  return 42;
}
`);
  });

  test("refuses what it can't stub without changing what other modules see, and any way of reaching Convex in what it writes", () => {
    expect(skeleton(4)).toEqual({
      refusals: [
        "convex/skeleton/refused.ts:14: exports viaList by a list; export the declaration itself",
        "convex/skeleton/refused.ts:16: declares one, two in one statement over a context; declare each on its own",
        "convex/skeleton/refused.ts:19: a top-level statement over a context or Convex's machinery",
        "convex/skeleton/refused.ts:22: declares the enum Mode, which the service's erasableSyntaxOnly forbids; port it as a union of literals",
        "convex/skeleton/refused.ts: declares or imports QueryContext, a name the skeleton writes for the service's own",
      ],
    });
    expect(skeleton(5)).toEqual({
      refusals: [
        "convex/skeleton/inline.ts: its skeleton imports convex/server, which no skeleton may",
        "convex/skeleton/inline.ts: its skeleton imports ../_generated/api, which no skeleton may",
        "convex/skeleton/inline.ts: its skeleton line 7: import(), which no skeleton may",
      ],
    });
    expect(skeleton(6)).toEqual({
      refusals: [
        "convex/skeleton/shadowed.ts:5: declares QueryContext, a name the skeleton writes for the service's own",
        "convex/skeleton/shadowed.ts:9: declares Doc, a name the skeleton writes for the service's own",
      ],
    });
  });

  describe("its output in the service", () => {
    const serviceModules = ["values.ts", "notPorted.ts", "operations.ts", "jobs/define.ts", "db/columns.ts", "db/schema/index.ts", "db/page.ts"];
    const scratch = scratchService(serviceModules, [awards, edges, appTypes, helpers]);

    test("typechecks under the service's compiler options", () => {
      expect(scratch.diagnostics()).toEqual([]);
    }, 60_000);

    test("runs: the real exports work, a stub fails by its Convex path, and a job carries its name, kind and args", async () => {
      const module = await import(scratch.path(awards.servicePath));
      expect(module.dayOf(2 * 86_400_000 + 1)).toBe(2);
      expect(module.awardIdValidator.parse("tenth")).toBe("tenth");

      await expect(module.recordAward({}, { member: "m", award: "first" })).rejects.toThrow(new NotPortedError("skeleton.awards.recordAward"));
      await expect(module.tallyOf({}, "m")).rejects.toMatchObject({ path: "skeleton.awards.tallyOf" });
      expect(() => module.kindOf()).toThrow(NotPortedError);
      expect(() => module.awardHook.claims).toThrow("skeleton.awards.awardHook is not ported yet");

      expect(module.sweepAwardsJob).toMatchObject({ name: "skeleton.awards.sweepAwards", kind: "mutation", handler: module.sweepAwards });
      expect(module.notifyAllJob).toMatchObject({ name: "skeleton.awards.notifyAll", kind: "action", handler: module.notifyAll });
      expect(module.sweepAwardsJob.args.safeParse({ before: Number.NaN }).success).toBe(true);
      expect(module.sweepAwardsJob.args.safeParse({ after: 1 }).success).toBe(false);
      expect(module.memberOfJob).toBeUndefined(); // a query runs in place, never later
      expect(module.recordAwardJob).toBeUndefined(); // only run in place

      const edgesModule = await import(scratch.path(edges.servicePath));
      expect(edgesModule.half(4)).toBe(2);
      expect(edgesModule.names.get("first")).toBe(1); // its top-level statement ran
      await expect(edgesModule.firstName({})).rejects.toThrow(new NotPortedError("skeleton.edges.firstName"));
      expect(edgesModule.byValidatorJob.args.safeParse({ note: "x" }).success).toBe(true);
      expect(edgesModule.byValidatorJob.args.safeParse({ note: "x", extra: 1 }).success).toBe(false);
      expect(edgesModule.byShorthandJob.args.safeParse({ note: "x" }).success).toBe(true); // `{ args }` keeps its fields
      // Unread initializers still ran: a function called at once (also through a cast or `.call`), a static field and a computed member name.
      expect([...edgesModule.cache.keys()]).toEqual(["first", "called", "static", "cast", "call", "computed"]);
      expect(edgesModule.answer).toBe(42); // a local function named like a builder is no builder
      await expect(edgesModule.viaAlias({}, {})).rejects.toThrow(new NotPortedError("skeleton.edges.viaAlias")); // a builder through a local alias is one
      expect(edgesModule.viaAliasJob).toBeUndefined();

      const appModule = await import(scratch.path(appTypes.servicePath));
      expect(appModule.plainRead({ value: "x" })).toBe("x"); // an app type named QueryCtx is no context
      expect(appModule.settings).toEqual({ ready: true }); // Object.assign on a module value still ran
      expect(appModule.noArgsJob.args.safeParse({ note: "x", more: 1 }).success).toBe(true); // Convex checks no args it wasn't given
      expect(appModule.answer).toBe(42); // an imported helper named like a builder is no builder
    });
  });
});
