// Imports that only types use, marked as types. The service compiles with verbatimModuleSyntax, so every import
// without `import type` stays a runtime import, even `import { type X }`, which still loads its module. A skeleton's
// stubs drop the bodies that used most of its imports as values; a runtime import kept for its signatures alone would
// load modules today's Convex bundle never loaded together, and close cycles that leave a module's exports undefined
// while another is still loading. TypeScript itself decides what a value use is: transpiled without
// verbatimModuleSyntax, it keeps exactly the import bindings that something uses as a value.
import ts from "typescript5";
import { applyEdits, parse } from "./imports.ts";

interface Binding {
  /** The local name the module binds. */
  local: string;
  form: "default" | "namespace" | "named";
  /** As the import writes it, less any `type` modifier: `X`, `X as Y`, `* as ns`. */
  text: string;
  /** Marked `type` in the import already. */
  typeOnly: boolean;
}

/** Each runtime import binding of a module that only types use, one line per import; empty when there is none. */
export function typeOnlyImports(sourceFile: ts.SourceFile): string[] {
  const values = valueBindings(sourceFile);
  return runtimeImports(sourceFile).flatMap(({ statement, bindings }) => {
    const unused = typesLoaded(bindings, values);
    if (unused.length === 0) return [];
    const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
    const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    return [`line ${line}: ${statement.getText(sourceFile).replace(/;$/, "")} loads ${specifier} for ${unused.map(({ local }) => local).join(", ")}, which only types use`];
  });
}

/**
 * A module's text with each import binding only types use marked as a type: a whole import becomes `import type`,
 * a mixed one keeps its values and marks its types. A default or namespace import beside other bindings takes a
 * declaration of its own when its kind differs from theirs, since `import type` can't mix them. Import attributes
 * (`with { type: "json" }`) stay on what still loads its module and leave a type-only import, which may not carry them.
 */
export function importTypesAsTypes(path: string, text: string): string {
  const sourceFile = parse(path, text);
  const values = valueBindings(sourceFile);
  const edits = runtimeImports(sourceFile).flatMap(({ statement, bindings }) => {
    if (typesLoaded(bindings, values).length === 0) return [];
    const specifier = statement.moduleSpecifier.getText(sourceFile);
    const from = statement.attributes ? `${specifier} ${statement.attributes.getText(sourceFile)}` : specifier;
    const isValue = ({ local }: Binding) => values.has(local);
    const named = bindings.filter(({ form }) => form === "named");
    const lone = bindings.filter(({ form }) => form !== "named");
    const lines: string[] = [];
    if (!named.some(isValue)) {
      // No named value: each default or namespace binding stands on its own, the named ones go as one `import type`.
      for (const binding of lone) lines.push(isValue(binding) ? `import ${binding.text} from ${from};` : `import type ${binding.text} from ${specifier};`);
      if (named.length > 0) lines.push(`import type { ${named.map(({ text }) => text).join(", ")} } from ${specifier};`);
    } else {
      // Named values keep the declaration, with any default or namespace value; a type of those goes on its own.
      const kept = lone.filter(isValue).map(({ text }) => text);
      const namedText = named.map((binding) => (isValue(binding) ? binding.text : `type ${binding.text}`)).join(", ");
      lines.push(`import ${[...kept, `{ ${namedText} }`].join(", ")} from ${from};`);
      for (const binding of lone.filter((binding) => !isValue(binding))) lines.push(`import type ${binding.text} from ${specifier};`);
    }
    return [{ start: statement.getStart(sourceFile), end: statement.getEnd(), text: lines.join("\n") }];
  });
  return applyEdits(text, edits);
}

/** The bindings of a runtime import that load its module for a type: all of them when none is a value, else the unmarked types. */
function typesLoaded(bindings: readonly Binding[], values: ReadonlySet<string>): Binding[] {
  const types = bindings.filter(({ local }) => !values.has(local));
  return types.length === bindings.length ? types : types.filter(({ typeOnly }) => !typeOnly);
}

/** The import declarations that load their module at runtime, with what each binds; side-effect-only imports aside. */
function runtimeImports(sourceFile: ts.SourceFile): Array<{ statement: ts.ImportDeclaration; bindings: Binding[] }> {
  return sourceFile.statements.flatMap((statement) => {
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
    if (!ts.isImportDeclaration(statement) || !clause || clause.isTypeOnly) return [];
    const bindings: Binding[] = [];
    if (clause.name) bindings.push({ local: clause.name.text, form: "default", text: clause.name.text, typeOnly: false });
    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named)) bindings.push({ local: named.name.text, form: "namespace", text: `* as ${named.name.text}`, typeOnly: false });
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        const text = element.propertyName ? `${element.propertyName.getText(sourceFile)} as ${element.name.text}` : element.name.text;
        bindings.push({ local: element.name.text, form: "named", text, typeOnly: element.isTypeOnly });
      }
    }
    return bindings.length > 0 ? [{ statement, bindings }] : [];
  });
}

/** The local names of the import bindings something in the module uses as a value, as TypeScript's emit decides. */
function valueBindings(sourceFile: ts.SourceFile): Set<string> {
  const { outputText } = ts.transpileModule(sourceFile.text, {
    fileName: sourceFile.fileName,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, verbatimModuleSyntax: false, isolatedModules: true },
    reportDiagnostics: false,
  });
  const emitted = ts.createSourceFile("emitted.js", outputText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const values = new Set<string>();
  for (const { bindings } of runtimeImports(emitted)) for (const { local, typeOnly } of bindings) if (!typeOnly) values.add(local);
  return values;
}
