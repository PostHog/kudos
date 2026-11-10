// The closure check: an output batch lands only when it is dependency-complete. Every import a batch's module makes
// resolves inside the batch, to a module an earlier batch or the foundation already put in the service, to a Node
// built-in, or to what a package the service lists exports. Anything else is refused, so every head on main keeps
// building.
import { isBuiltin } from "node:module";
import { dirname, join, normalize } from "node:path";
import ts from "typescript5";
import { convexPackage } from "./copy.ts";
import { parse } from "./imports.ts";

/** The packages the service lists, and whether a specifier resolves among them as the service's Node would. */
export interface Packages {
  listed: ReadonlySet<string>;
  resolves: (specifier: string) => boolean;
}

/** The service's own packages: those its package.json lists, resolved from its source under its compiler options. */
export function servicePackages(repo: string): Packages {
  const manifest = JSON.parse(ts.sys.readFile(join(repo, "service/package.json"))!) as Record<string, Record<string, string> | undefined>;
  const listed = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);
  const config = ts.readConfigFile(join(repo, "service/tsconfig.json"), ts.sys.readFile).config;
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, join(repo, "service"));
  const from = join(repo, "service/src/module.ts");
  // Resolved as an ES module imports it, under the `import` condition: the service's modules are ES modules.
  return { listed, resolves: (specifier) => ts.resolveModuleName(specifier, from, options, ts.sys, undefined, undefined, ts.ModuleKind.ESNext).resolvedModule !== undefined };
}

/** What a batch's imports leave unresolved, one line per import; empty for a closed batch. */
export function closureCheck(batch: ReadonlyMap<string, string>, exists: (path: string) => boolean, packages: Packages): string[] {
  const missing: string[] = [];
  for (const [path, text] of batch) {
    for (const { specifier, problem: refused } of specifiers(parse(path, text))) {
      const problem = refused ?? unresolved(path, specifier, (target) => batch.has(target) || exists(target), packages);
      if (problem) missing.push(`${path}: ${specifier}: ${problem}`);
    }
  }
  return missing;
}

/** Stands for an `import()` of a computed specifier, which no check can resolve. */
const computed = "<computed>";

function unresolved(path: string, specifier: string, found: (path: string) => boolean, packages: Packages): string | undefined {
  if (specifier === computed) return "an import of a computed specifier";
  if (specifier.startsWith(".")) {
    if (!specifier.endsWith(".ts")) return "a relative import names its .ts file in the service";
    const target = normalize(join(dirname(path), specifier));
    if (!target.startsWith("service/")) return "outside the service";
    return found(target) ? undefined : "no module in the batch, an earlier batch or the foundation";
  }
  if (convexPackage.test(specifier)) return "a Convex package";
  if (isBuiltin(specifier)) return undefined;
  const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
  if (!packages.listed.has(name)) return "a package the service doesn't list";
  return packages.resolves(specifier) ? undefined : `nothing ${name} exports`;
}

/**
 * Every specifier a module names: imports, export-froms, and `import()` or `require()` of a literal; an
 * `import x = require()` comes refused, since the service's modules are ES modules.
 */
export function specifiers(sourceFile: ts.SourceFile): Array<{ specifier: string; problem?: string }> {
  const found: Array<{ specifier: string; problem?: string }> = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push({ specifier: node.moduleSpecifier.text });
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) found.push({ specifier: node.argument.literal.text });
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      found.push({ specifier: ts.isStringLiteralLike(expression) ? expression.text : computed, problem: "an import = require(), which an ES module can't use" });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0]
    )
      found.push({ specifier: ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : computed });
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
