// The closure check: an output batch lands only when it is dependency-complete. Every import a batch's module makes
// resolves inside the batch, to a module an earlier batch or the foundation already put in the service, to a Node
// built-in, or to a package the service lists. Anything else is refused, so every head on main keeps building.
import { builtinModules } from "node:module";
import { dirname, join, normalize } from "node:path";
import ts from "typescript5";
import { convexPackage } from "./copy.ts";
import { parse } from "./imports.ts";

const builtins = new Set(builtinModules);

/** What a batch's imports leave unresolved, one line per import; empty for a closed batch. */
export function closureCheck(batch: ReadonlyMap<string, string>, exists: (path: string) => boolean, packages: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const [path, text] of batch) {
    for (const specifier of specifiers(parse(path, text))) {
      const problem = unresolved(path, specifier, (target) => batch.has(target) || exists(target), packages);
      if (problem) missing.push(`${path}: ${specifier}: ${problem}`);
    }
  }
  return missing;
}

/** Stands for an `import()` of a computed specifier, which no check can resolve. */
const computed = "<computed>";

function unresolved(path: string, specifier: string, found: (path: string) => boolean, packages: ReadonlySet<string>): string | undefined {
  if (specifier === computed) return "an import of a computed specifier";
  if (specifier.startsWith(".")) {
    if (!specifier.endsWith(".ts")) return "a relative import names its .ts file in the service";
    const target = normalize(join(dirname(path), specifier));
    if (!target.startsWith("service/")) return "outside the service";
    return found(target) ? undefined : "no module in the batch, an earlier batch or the foundation";
  }
  if (convexPackage.test(specifier)) return "a Convex package";
  if (specifier.startsWith("node:") ? builtins.has(specifier.slice(5)) : builtins.has(specifier)) return undefined;
  const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
  return packages.has(name) ? undefined : "a package the service doesn't list";
}

/** Every specifier a module names: imports, export-froms, and `import()` or `require()` of a literal. */
export function specifiers(sourceFile: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) found.push(node.argument.literal.text);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0]
    )
      found.push(ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : computed);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
