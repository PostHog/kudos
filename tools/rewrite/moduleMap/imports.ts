// Where a module of today's convex/ lands in the service, and what each of its imports becomes there.
// convex/<path>.ts lands at service/src/<path>.ts, so a relative import between two such modules keeps its path and
// gains the `.ts` the service's NodeNext resolution needs. The generated data model's types come from the Drizzle
// model. Anything else from Convex is no import a landed module may keep: the tool that meets one refuses the module.
import { dirname, join, relative } from "node:path";
import ts from "typescript5";

/** Repo-relative paths, with `/` separators. */
export const convexRoot = "convex";
export const serviceRoot = "service/src";

/** Where the generated data model's types live in the service. */
const dataModel: Record<string, string> = { Doc: `${serviceRoot}/db/schema/index.ts`, Id: `${serviceRoot}/db/columns.ts` };

export function servicePathOf(convexPath: string): string {
  if (!convexPath.startsWith(`${convexRoot}/`) || !convexPath.endsWith(".ts")) throw new Error(`${convexPath} is no module of ${convexRoot}/`);
  return `${serviceRoot}/${convexPath.slice(convexRoot.length + 1)}`;
}

/** The convex/ module a relative specifier names, as Convex's bundler finds it: as written, then `.ts`, then `/index.ts`. */
export function resolveConvexImport(fromPath: string, specifier: string, exists: (path: string) => boolean): string | undefined {
  const base = join(dirname(fromPath), specifier);
  return [base, `${base}.ts`, `${base}/index.ts`].find((path) => path.endsWith(".ts") && exists(path));
}

export function specifierFrom(fromServicePath: string, toServicePath: string): string {
  const path = relative(dirname(fromServicePath), toServicePath);
  return path.startsWith(".") ? path : `./${path}`;
}

export interface ImportPlan {
  /** Each import declaration's replacement text, by the declaration's start and end in the source. */
  edits: Array<{ start: number; end: number; text: string }>;
  refusals: string[];
}

const generated = /(^|\/)_generated\/(dataModel|api|server)(\.[jt]s)?$/;

/**
 * Rewrites every import and export-from of a convex/ module for its place in the service. `keep` decides about a
 * package import (true keeps it, a string refuses it with that reason); the module's own Convex packages are the
 * caller's to handle and arrive here only to be refused.
 */
export function planImports(sourceFile: ts.SourceFile, convexPath: string, exists: (path: string) => boolean, keep: (specifier: string) => true | string): ImportPlan {
  const plan: ImportPlan = { edits: [], refusals: [] };
  const servicePath = servicePathOf(convexPath);
  const replaceSpecifier = (node: ts.ImportDeclaration | ts.ExportDeclaration, literal: ts.StringLiteral, specifier: string) => {
    const text = sourceFile.text;
    const quote = text[literal.getStart(sourceFile)];
    const start = node.getStart(sourceFile);
    plan.edits.push({ start, end: node.getEnd(), text: text.slice(start, literal.getStart(sourceFile)) + quote + specifier + quote + text.slice(literal.getEnd(), node.getEnd()) });
  };
  for (const statement of sourceFile.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || !statement.moduleSpecifier) continue;
    const literal = statement.moduleSpecifier as ts.StringLiteral;
    const specifier = literal.text;
    if (generated.test(specifier)) {
      const which = generated.exec(specifier)![2];
      if (which !== "dataModel" || !ts.isImportDeclaration(statement)) {
        plan.refusals.push(`${convexPath}: imports ${specifier}, which the service has no counterpart for`);
        continue;
      }
      const rewritten = dataModelImport(statement, servicePath);
      if (typeof rewritten === "string") plan.edits.push({ start: statement.getStart(sourceFile), end: statement.getEnd(), text: rewritten });
      else plan.refusals.push(...rewritten.refusals.map((name) => `${convexPath}: imports ${name} from the data model, which the service doesn't define`));
      continue;
    }
    if (!specifier.startsWith(".")) {
      const verdict = keep(specifier);
      if (verdict !== true) plan.refusals.push(`${convexPath}: imports ${specifier}: ${verdict}`);
      continue;
    }
    const target = resolveConvexImport(convexPath, specifier, exists);
    if (!target) plan.refusals.push(`${convexPath}: imports ${specifier}, which names no module of ${convexRoot}/`);
    else replaceSpecifier(statement, literal, specifierFrom(servicePath, servicePathOf(target)));
  }
  return plan;
}

/** `import type { Doc, Id } from "../_generated/dataModel"` becomes one import per service module the names live in. */
function dataModelImport(statement: ts.ImportDeclaration, servicePath: string): string | { refusals: string[] } {
  const clause = statement.importClause;
  const named = clause?.namedBindings;
  if (!clause || clause.name || !named || !ts.isNamedImports(named)) return { refusals: ["a default or namespace import"] };
  const refusals = named.elements.map((element) => (element.propertyName ?? element.name).text).filter((name) => !(name in dataModel));
  if (refusals.length > 0) return { refusals };
  const byTarget = new Map<string, string[]>();
  for (const element of named.elements) {
    const target = dataModel[(element.propertyName ?? element.name).text]!;
    byTarget.set(target, [...(byTarget.get(target) ?? []), element.getText()]);
  }
  const typeOnly = clause.isTypeOnly ? "type " : "";
  return [...byTarget].map(([target, names]) => `import ${typeOnly}{ ${names.join(", ")} } from "${specifierFrom(servicePath, target)}";`).join("\n");
}

/** Applies non-overlapping edits to a text; an insertion lands before a replacement that starts where it does. */
export function applyEdits(text: string, edits: ReadonlyArray<{ start: number; end: number; text: string }>): string {
  let output = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return output;
}

export function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
