// The bootstrap: lands the modules `landed.ts` lists in the service. A module that names nothing of Convex lands
// through the copy tool, one with validators through the codemod, one that names Convex's machinery (a builder, a
// context, `internal`) through the skeleton generator, and the whole list only once the closure check finds it closed.
// A module S1 ported in part (`partlyPorted`) keeps S1's code; the skeleton of the rest lands beside it as
// `<module>.map.ts`, which S1's module re-exports by one generated last line. An export the generator can't print that
// another stack imports lands through its contract (`contracts.ts`).
// Run it from the repository's root to write them:
//   node --experimental-strip-types tools/rewrite/moduleMap/bootstrap.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript5";
import { closureCheck, servicePackages } from "./closure.ts";
import { convertModule, validatorEdits } from "./codemod.ts";
import { convexPackage, copyModule, type Landed } from "./copy.ts";
import { convexRoot, servicePathOf } from "./imports.ts";
import { landed, partlyPorted } from "./landed.ts";
import { contracts } from "./contracts.ts";
import { overContext, reachedByName, siblingOf, skeletonModule, type Skeleton } from "./skeleton.ts";

export interface LandedModule {
  convexPath: string;
  servicePath: string;
  /** `reexport`: S1's module, with the line that re-exports its sibling's stubs. */
  tool: "copy" | "convert" | "skeleton" | "reexport";
  text: string;
  /** What the skeleton generator left out, with why. */
  omitted: string[];
}

const machinery = /(^|\/)_generated\/(api|server)(\.[jt]s)?$|^convex\/server$/;

/** Every listed module as its tool lands it, and what keeps the list from landing: refusals and unresolved imports. */
export function landAll(repo: string, paths: readonly string[] = landed, partly: readonly string[] = partlyPorted): { modules: LandedModule[]; problems: string[] } {
  const exists = (path: string) => existsSync(join(repo, path));
  // Every module of convex/, since a skeleton keeps what any of them reaches by name, checked as Convex checks them.
  const program = ts.createProgram([...new Set([...convexModules(repo), ...paths, ...partly].map((path) => join(repo, path)))], convexOptions(repo));
  let reachedOnce: ReturnType<typeof reachedByName> | undefined;
  const reached = () => (reachedOnce ??= reachedByName(program.getSourceFiles().filter((file) => file.fileName.startsWith(join(repo, convexRoot, "/")) && !file.fileName.includes("/_generated/"))));
  const modules: LandedModule[] = [];
  const problems: string[] = [];
  for (const convexPath of paths) {
    const text = readFileSync(join(repo, convexPath), "utf8");
    const sourceFile = program.getSourceFile(join(repo, convexPath))!;
    const tool = toolOf(program, sourceFile, convexPath);
    const result: Skeleton | Landed = tool === "skeleton" ? skeletonModule(program, sourceFile, convexPath, reached(), exists, { contracts }) : tool === "convert" ? convertModule(program, sourceFile, convexPath, exists) : copyModule(convexPath, text, exists);
    if ("refusals" in result) problems.push(...result.refusals);
    else modules.push({ convexPath, servicePath: result.servicePath, tool, text: result.text, omitted: (result as Partial<Skeleton>).omitted ?? [] });
  }
  for (const convexPath of partly) {
    const servicePath = servicePathOf(convexPath);
    const s1 = { servicePath, text: s1Part(servicePath, readFileSync(join(repo, servicePath), "utf8")) };
    const result = skeletonModule(program, program.getSourceFile(join(repo, convexPath))!, convexPath, reached(), exists, { s1, contracts });
    if ("refusals" in result) problems.push(...result.refusals);
    else {
      modules.push({ convexPath, servicePath: result.servicePath, tool: "skeleton", text: result.text, omitted: result.omitted });
      modules.push({ convexPath, servicePath, tool: "reexport", text: withReexport(s1, result.exports), omitted: [] });
    }
  }
  const batch = new Map(modules.map(({ servicePath, text }) => [servicePath, text]));
  // A landed module's own file on disk is what the batch replaces, so only the batch speaks for it.
  problems.push(...closureCheck(batch, (path) => !batch.has(path) && exists(path), servicePackages(repo)));
  return { modules, problems };
}

/** The line S1's module ends with that re-exports its sibling's stubs. */
export const reexportLine = (servicePath: string, { values, types }: Skeleton["exports"]) =>
  `export { ${[...values.map((name) => [name, exportName(name)] as const), ...types.map((name) => [name, `type ${exportName(name)}`] as const)].sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text).join(", ")} } from "./${basename(siblingOf(servicePath))}";`;

/** A name as an export list writes it: quoted when it is no identifier (`x as "not-an-identifier"`). */
const exportName = (name: string) => (/^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u.test(name) ? name : JSON.stringify(name));

/** S1's module as S1 wrote it: without the last line a landing gave it. */
export function s1Part(servicePath: string, text: string): string {
  const last = `from "./${basename(siblingOf(servicePath))}";\n`;
  const at = text.lastIndexOf("\nexport { ");
  return at !== -1 && text.endsWith(last) && !text.slice(at + 1, -1).includes("\n") ? text.slice(0, at) : text;
}

function withReexport(s1: { servicePath: string; text: string }, exports: Skeleton["exports"]): string {
  if (exports.values.length + exports.types.length === 0) return s1.text;
  return `${s1.text}\n${reexportLine(s1.servicePath, exports)}\n`;
}

/** The tool a module lands through: the skeleton generator for one over a context, else the codemod for one with validators, else the copy tool. */
export function toolOf(program: ts.Program, sourceFile: ts.SourceFile, convexPath: string): LandedModule["tool"] {
  const imported = sourceFile.statements.flatMap((node) => ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? [node.moduleSpecifier.text] : []));
  if (imported.some((specifier) => machinery.test(specifier)) || overContext(program.getTypeChecker(), sourceFile)) return "skeleton";
  return imported.some((specifier) => convexPackage.test(specifier)) || validatorEdits(program.getTypeChecker(), sourceFile, convexPath).edits.length > 0 ? "convert" : "copy";
}

/** convex/tsconfig.json's options, whose libs (ES2023's `toSorted`) the printer needs to resolve what a module returns. */
function convexOptions(repo: string): ts.CompilerOptions {
  const folder = join(repo, convexRoot);
  const { config, error } = ts.readConfigFile(join(folder, "tsconfig.json"), ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  return { ...ts.parseJsonConfigFileContent(config, ts.sys, folder).options, noEmit: true };
}

/** Every module of convex/ but its tests, declarations and generated code, from the repository's root. */
function convexModules(repo: string): string[] {
  const walk = (folder: string): string[] =>
    readdirSync(join(repo, folder), { withFileTypes: true }).flatMap((entry) => {
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) return entry.name === "_generated" ? [] : walk(path);
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
    });
  return walk(convexRoot);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = process.cwd();
  const { modules, problems } = landAll(repo);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  for (const { servicePath, text } of modules) {
    mkdirSync(dirname(join(repo, servicePath)), { recursive: true });
    writeFileSync(join(repo, servicePath), text);
  }
  console.log(`landed ${modules.length} modules`);
}
