// The bootstrap: lands the modules `landed.ts` lists in the service. A module that names nothing of Convex lands
// through the copy tool, one with validators through the codemod, and the whole list only once the closure check finds
// it closed. Run it from the repository's root to write them:
//   node --experimental-strip-types tools/rewrite/moduleMap/bootstrap.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript5";
import { closureCheck, servicePackages } from "./closure.ts";
import { convertModule, validatorEdits } from "./codemod.ts";
import { convexPackage, copyModule } from "./copy.ts";
import { landed } from "./landed.ts";

export interface LandedModule {
  convexPath: string;
  servicePath: string;
  tool: "copy" | "convert";
  text: string;
}

/** Every listed module as its tool lands it, and what keeps the list from landing: refusals and unresolved imports. */
export function landAll(repo: string, paths: readonly string[] = landed): { modules: LandedModule[]; problems: string[] } {
  const exists = (path: string) => existsSync(join(repo, path));
  const program = ts.createProgram(
    paths.map((path) => join(repo, path)),
    { strict: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, skipLibCheck: true },
  );
  const checker = program.getTypeChecker();
  const modules: LandedModule[] = [];
  const problems: string[] = [];
  for (const convexPath of paths) {
    const text = readFileSync(join(repo, convexPath), "utf8");
    const sourceFile = program.getSourceFile(join(repo, convexPath))!;
    const namesConvex = ts.forEachChild(sourceFile, (node) => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && convexPackage.test(node.moduleSpecifier.text)) ?? false;
    const tool = namesConvex || validatorEdits(checker, sourceFile, convexPath).edits.length > 0 ? "convert" : "copy";
    const result = tool === "convert" ? convertModule(program, sourceFile, convexPath, exists) : copyModule(convexPath, text, exists);
    if ("refusals" in result) problems.push(...result.refusals);
    else modules.push({ convexPath, servicePath: result.servicePath, tool, text: result.text });
  }
  const batch = new Map(modules.map(({ servicePath, text }) => [servicePath, text]));
  // A landed module's own file on disk is what the batch replaces, so only the batch speaks for it.
  problems.push(...closureCheck(batch, (path) => !batch.has(path) && exists(path), servicePackages(repo)));
  return { modules, problems };
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
