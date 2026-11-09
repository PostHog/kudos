// The copy tool: a module whose body uses nothing from Convex lands in the service with only its imports changed.
// The import-only diff proves it: with every import declaration and every export-from's specifier taken out of both,
// the copy equals its source character for character.
import ts from "typescript5";
import { applyEdits, parse, planImports, servicePathOf } from "./imports.ts";

export const convexPackage = /^(convex|convex-test|@posthog\/convex)(\/|$)|^@convex-dev\//;

export type Landed = { servicePath: string; text: string } | { refusals: string[] };

export function copyModule(convexPath: string, text: string, exists: (path: string) => boolean): Landed {
  const sourceFile = parse(convexPath, text);
  const plan = planImports(sourceFile, convexPath, exists, (specifier) => (convexPackage.test(specifier) ? "a copied module uses nothing from Convex; convert or rewrite it" : true));
  plan.refusals.push(...dynamicImports(sourceFile).map((what) => `${convexPath}: ${what}, which a copy can't change`));
  if (plan.refusals.length > 0) return { refusals: plan.refusals };
  return { servicePath: servicePathOf(convexPath), text: applyEdits(text, plan.edits) };
}

/** Lines where a copy differs from its source outside its imports; none for a faithful copy. */
export function importOnlyDiff(source: string, copy: string): string[] {
  const [a, b] = [source, copy].map((text) => withoutImports(text).split("\n"));
  const differing: string[] = [];
  for (let line = 0; line < Math.max(a!.length, b!.length); line++) {
    if (a![line] !== b![line]) differing.push(`line ${line + 1} without imports: ${JSON.stringify(a![line] ?? "")} became ${JSON.stringify(b![line] ?? "")}`);
  }
  return differing;
}

function withoutImports(text: string): string {
  const sourceFile = parse("module.ts", text);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) edits.push(wholeLines(text, statement.getStart(sourceFile), statement.getEnd()));
    else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) edits.push({ start: statement.moduleSpecifier.getStart(sourceFile), end: statement.moduleSpecifier.getEnd(), text: '""' });
  }
  return applyEdits(text, edits);
}

/** A declaration alone on its lines goes with its line break, so one import becoming two leaves no trace. */
function wholeLines(text: string, start: number, end: number) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const alone = /^[ \t]*$/.test(text.slice(lineStart, start)) && /^[ \t]*(\r?\n|$)/.test(text.slice(end));
  if (!alone) return { start, end, text: "" };
  const lineEnd = text.indexOf("\n", end);
  return { start: lineStart, end: lineEnd === -1 ? text.length : lineEnd + 1, text: "" };
}

/** `import("…")`, `require("…")`, `import x = require("…")` and `import.meta`, whose specifiers no import edit reaches. */
export function dynamicImports(sourceFile: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      found.push(`line ${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: import = require()`);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      found.push(`line ${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: ${node.expression.getText(sourceFile)}()`);
    } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      found.push(`line ${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: import.meta`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
