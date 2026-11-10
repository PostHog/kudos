// The skeleton generator: the module map's signatures, before any body. For a module of today's convex/ that touches
// an operation's context, it writes the service module that keeps every export another stack can reach:
// - an export that needs no operation context lands as the real thing, through the codemod: types, zod schemas,
//   constants and pure functions, with the module's other declarations they need;
// - an exported function over a context keeps its signature, the context as the service's (`QueryContext`,
//   `MutationContext`, `ActionContext`), with a body that throws `notPorted("<path>")`; so does one whose body the
//   codemod can't convert, and an exported value over a context (a parse hook) keeps its type and throws on use;
// - a registered function another module reaches by name (`ctx.run*(internal.…)`, the scheduler, a cron, the bus)
//   becomes a function over the service's context with its args as a zod schema, and, when the scheduler, a cron or
//   the bus reaches it, a job of the same dotted name;
// - the rest (a registered function nobody reaches by name, such as a website route, Convex's own machinery, and a
//   class over a context) is left out, and listed.
// Names stay the Convex paths, dotted. Nothing it writes imports Convex.
import { posix } from "node:path";
import ts from "typescript5";
import { specifiers } from "./closure.ts";
import { validatorClassOf, validatorEdits, type Edit } from "./codemod.ts";
import { convexPackage, dynamicImports, type Landed } from "./copy.ts";
import { applyEdits, convexRoot, parse, resolveConvexImport, servicePathOf, serviceRoot, specifierFrom } from "./imports.ts";
import { importTypesAsTypes } from "./typeImports.ts";

export type Reach = "run" | "job";
/** Every registered function reached by name, by dotted path, and how. */
export type Reached = ReadonlyMap<string, ReadonlySet<Reach>>;

const contexts = { query: "QueryContext", mutation: "MutationContext", action: "ActionContext" } as const;

/** Convex's types a signature may name, as the service names them; any other Convex type is refused. */
const serverTypes: Record<string, (args: string[]) => string> = {
  QueryCtx: () => "QueryContext",
  MutationCtx: () => "MutationContext",
  ActionCtx: () => "ActionContext",
  GenericQueryCtx: () => "QueryContext",
  GenericMutationCtx: () => "MutationContext",
  GenericActionCtx: () => "ActionContext",
  PaginationOptions: () => "PageOptions",
  PaginationResult: ([item]) => `Page<${item}>`,
  WithoutSystemFields: ([document]) => `Omit<${document}, "_id" | "_creationTime">`,
};
const serviceTypes: Record<string, string> = {
  QueryContext: "operations.ts",
  MutationContext: "operations.ts",
  ActionContext: "operations.ts",
  PageOptions: "db/page.ts",
  Page: "db/page.ts",
  Doc: "db/schema/index.ts",
  Id: "db/columns.ts",
};

const machinery = /(^|\/)_generated\/(api|server)(\.[jt]s)?$|^convex\/server$/;

export const dottedPath = (convexPath: string, name: string) => `${convexPath.slice(convexRoot.length + 1, -3).replaceAll("/", ".")}.${name}`;

/** Every `internal.…` reference in the modules: run in place by an action, or scheduled (a cron, the bus, `runAfter`). */
export function reachedByName(sourceFiles: readonly ts.SourceFile[]): Map<string, Set<Reach>> {
  const reached = new Map<string, Set<Reach>>();
  for (const sourceFile of sourceFiles) {
    // `internal` however the module names it: `import { internal as refs } from "../_generated/api"`.
    const internalNames = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !/(^|\/)_generated\/api(\.[jt]s)?$/.test((statement.moduleSpecifier as ts.StringLiteral).text)) continue;
      const named = statement.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) for (const element of named.elements) if ((element.propertyName ?? element.name).text === "internal") internalNames.add(element.name.text);
    }
    // Parents passed down: a program's files carry none until something binds them.
    const visit = (node: ts.Node, parent: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && !ts.isPropertyAccessExpression(parent)) {
        const chain = node.getText(sourceFile).replace(/\s/g, "").split(".");
        if (internalNames.has(chain[0]!) && chain.length > 2) {
          const call = parent;
          const runs = ts.isCallExpression(call) && call.arguments[0] === node && /\.run(Query|Mutation|Action)$/.test(call.expression.getText(sourceFile));
          const path = chain.slice(1).join(".");
          reached.set(path, (reached.get(path) ?? new Set()).add(runs ? "run" : "job"));
          return;
        }
      }
      ts.forEachChild(node, (child) => visit(child, node));
    };
    visit(sourceFile, sourceFile);
  }
  return reached;
}

/**
 * Whether a module is over a context even where it names nothing of Convex: it registers a function, through any
 * builder (the app's own `memberQuery` too), or a function of it takes a context.
 */
export function overContext(checker: ts.TypeChecker, sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some((statement) => {
    if (registrationOf(checker, statement)) return true;
    let found = false;
    walk(statement, (node, inType) => {
      if (!inType && ts.isFunctionLike(node) && node.parameters.some((parameter) => isContext(checker.getTypeAtLocation(parameter)))) found = true;
    });
    return found;
  });
}

interface Declaration {
  statement: ts.Statement;
  names: string[];
  exported: boolean;
  /** Top-level names of this module it refers to. */
  uses: Set<string>;
  /** Those it refers to as a value: a type named like a value over a context (`type Entry`) carries no context. */
  valueUses: Set<string>;
  /** It refers to Convex's machinery by value (a builder, `internal`) or names a context in a value's signature. */
  convex: boolean;
  /** It refers to Convex's machinery by value, such as a table of `internal` references. */
  machinery: boolean;
  isType: boolean;
}

export interface Skeleton {
  servicePath: string;
  text: string;
  /** Exports left out, with why. */
  omitted: string[];
  /** What it exports, by namespace: a module beside S1's is re-exported by name. */
  exports: { values: string[]; types: string[] };
}

/** The module beside S1's partial port of a Convex module that holds the module map's stubs of the rest. */
export const siblingOf = (servicePath: string) => servicePath.replace(/\.ts$/, ".map.ts");

/** What S1's port of part of a module owns: the names it exports, and the Convex paths of the jobs it registers. */
export function s1Owns(servicePath: string, text: string): { exports: Set<string>; jobs: Set<string> } {
  const file = parse(servicePath, text);
  const exports = new Set<string>();
  const builders = new Set<string>();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && posix.join(posix.dirname(servicePath), (statement.moduleSpecifier as ts.StringLiteral).text) === `${serviceRoot}/jobs/define.ts`) {
      for (const { local, imported } of importedNames(statement)) if (imported === "mutationJob" || imported === "actionJob") builders.add(local);
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) statement.exportClause.elements.forEach((element) => exports.add(element.name.text));
    else if (isExported(statement)) declaredNames(statement).forEach((name) => exports.add(name));
  }
  // Its jobs by the calls of the service's job builders, however it imports them.
  const jobs = new Set<string>();
  walk(file, (node) => {
    const [name] = ts.isCallExpression(node) && ts.isIdentifier(node.expression) && builders.has(node.expression.text) ? node.arguments : [];
    if (name && ts.isStringLiteralLike(name)) jobs.add(name.text);
  });
  return { exports, jobs };
}

/** A service declaration for an export the generator can't print that another stack imports, keyed by Convex path and name. */
export type Contracts = Readonly<Record<string, Readonly<Record<string, { text: string; uses?: readonly string[] }>>>>;

export interface SkeletonOptions {
  /** S1's port of part of the module: the skeleton is then its sibling, of only what S1 doesn't own. */
  s1?: { servicePath: string; text: string };
  contracts?: Contracts;
}

/**
 * The skeleton of a Convex module. Given S1's port of part of it, it is the sibling module of the rest: what S1 exports
 * and the jobs S1 registers stay S1's, and a type of S1's a stub names is imported from S1's module by type only.
 */
export function skeletonModule(program: ts.Program, sourceFile: ts.SourceFile, convexPath: string, reached: Reached, exists: (path: string) => boolean, options: SkeletonOptions = {}): Skeleton | { refusals: string[] } {
  const checker = program.getTypeChecker(); // binds the files, which sets the parents the walk reads
  const text = sourceFile.text;
  const { s1, contracts = {} } = options;
  const servicePath = s1 ? siblingOf(s1.servicePath) : servicePathOf(convexPath);
  const refusals: string[] = [];
  const omitted: string[] = [];
  const line = (node: ts.Node) => `${convexPath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`;
  const owned = s1 ? s1Owns(s1.servicePath, s1.text) : { exports: new Set<string>(), jobs: new Set<string>() };
  const s1Declarations = new Set<Declaration>();
  /** S1's types the stubs name, imported from its module by type only: a value would close a cycle at load. */
  const fromS1 = new Set<string>();

  // Imports: which local names come from Convex's machinery, which from elsewhere.
  // Machinery is known by symbol, so an alias (`QueryCtx as Q`) is still Convex's and a local of the same name isn't.
  const machinerySymbols = new Map<ts.Symbol, string>();
  const imports: ts.ImportDeclaration[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    if (machinery.test(specifier) || (convexPackage.test(specifier) && specifier !== "convex/values")) {
      for (const { node, imported } of importedIdentifiers(statement)) machinerySymbols.set(checker.getSymbolAtLocation(node)!, imported);
    } else imports.push(statement);
  }
  /** The name Convex exports what an identifier refers to under, when it is Convex's machinery. */
  const machineryOf = (node: ts.Identifier): string | undefined => {
    const symbol = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
    return symbol ? machinerySymbols.get(symbol) : undefined;
  };
  /** A Convex type a signature names that the service has no counterpart for. */
  const foreignIn = (nodes: readonly ts.Node[]) => {
    let found: string | undefined;
    for (const node of nodes) walk(node, (child) => {
      const imported = ts.isIdentifier(child) ? machineryOf(child) : undefined;
      if (imported && !(imported in serverTypes)) found ??= imported;
    });
    return found;
  };

  // Top-level declarations and what they refer to.
  const declarations: Declaration[] = [];
  // A name may have several declarations: overloads, or an interface merged from parts. Each one lands with it.
  const byName = new Map<string, Declaration[]>();
  const declarationsOf = (name: string) => byName.get(name) ?? [];
  // A use is an identifier that resolves to a top-level declaration of this module, not a local of the same name.
  const topLevel = (node: ts.Identifier) => {
    // `{ crate }` names the property and the value both; the value is what lands.
    const symbol = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
    let declaration: ts.Node | undefined = symbol?.declarations?.[0];
    while (declaration && (ts.isVariableDeclaration(declaration) || ts.isVariableDeclarationList(declaration) || ts.isBindingElement(declaration) || ts.isObjectBindingPattern(declaration) || ts.isArrayBindingPattern(declaration))) {
      declaration = declaration.parent;
    }
    return declaration?.parent === sourceFile && !ts.isImportDeclaration(declaration);
  };
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    const names = declaredNames(statement);
    const isType = ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement);
    const declaration: Declaration = { statement, names, exported: isExported(statement), uses: new Set(), valueUses: new Set(), convex: false, machinery: false, isType };
    walk(statement, (node, inType) => {
      // A function over a context, even one typed only by where it stands (a hook's `claims: async (ctx) => …`).
      if (!isType && !inType && ts.isFunctionLike(node) && node.parameters.some((parameter) => isContext(checker.getTypeAtLocation(parameter)))) declaration.convex = true;
      if (!ts.isIdentifier(node) || isPropertyName(node)) return;
      const imported = machineryOf(node);
      if (imported && !inType) declaration.machinery = true;
      if (imported && !(inType && imported in serverTypes)) declaration.convex = true;
      if (imported && inType && !isType && /Ctx$/.test(imported)) declaration.convex = true;
      if (topLevel(node)) {
        declaration.uses.add(node.text);
        if (!inType) declaration.valueUses.add(node.text);
      }
    });
    declarations.push(declaration);
    for (const name of names) byName.set(name, [...declarationsOf(name), declaration]);
  }
  for (const declaration of declarations) {
    for (const name of declaration.names) {
      declaration.uses.delete(name);
      declaration.valueUses.delete(name);
    }
  }
  // An export of the module stays S1's when S1 exports each of its names.
  for (const declaration of declarations) {
    const ownedNames = declaration.exported ? declaration.names.filter((name) => owned.exports.has(name)) : [];
    if (ownedNames.length === 0) continue;
    if (ownedNames.length < declaration.names.length) refusals.push(`${convexPath}: S1's ${s1!.servicePath} exports ${ownedNames.join(", ")} of ${declaration.names.join(", ")}, which one statement declares; port them together`);
    else s1Declarations.add(declaration);
  }
  // A declaration the codemod can't convert (it reads a validator's own fields, say) is ported by hand, like one over a
  // context: a function of it becomes a stub. A refusal in what still lands refuses the module below.
  const { edits, refusals: editRefusals } = validatorEdits(checker, sourceFile, convexPath);
  for (const declaration of declarations) {
    const { statement } = declaration;
    if (!declaration.isType && editRefusals.some(({ start }) => start >= statement.getStart(sourceFile) && start < statement.getEnd())) declaration.convex = true;
    // A registration is over a context, whether its builder is Convex's or a wrapper of this app's (`memberQuery`).
    if (registrationOf(checker, statement)) declaration.convex = true;
  }
  // A value that refers to a value over a context needs one too.
  for (let changed = true; changed; ) {
    changed = false;
    for (const declaration of declarations) {
      if (declaration.convex || declaration.isType) continue;
      if ([...declaration.valueUses].some((name) => declarationsOf(name).some((used) => used.convex && !used.isType))) changed = declaration.convex = true;
    }
  }

  const typeEdits = serverTypeEdits(sourceFile, machineryOf, (node, message) => editRefusals.push({ start: node.getStart(sourceFile), message: `${line(node)}: ${message}` }));
  edits.push(...typeEdits);
  const ranges: Array<[number, number]> = [];
  const textOf = (start: number, end: number) => {
    ranges.push([start, end]);
    const inside = edits.filter((edit) => edit.start >= start && edit.end <= end).map((edit) => ({ ...edit, start: edit.start - start, end: edit.end - start }));
    return applyEdits(text.slice(start, end), inside);
  };
  /** A value of this module or one it imports, as opposed to a global such as `Object` or `Set`. */
  const moduleValue = (node: ts.Identifier) => {
    const declaration = checker.getSymbolAtLocation(node)?.declarations?.[0];
    return topLevel(node) || (declaration !== undefined && (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration) || ts.isNamespaceImport(declaration)));
  };
  const dataModelImport = (statement: ts.ImportDeclaration) => /(^|\/)_generated\/dataModel(\.[jt]s)?$/.test((statement.moduleSpecifier as ts.StringLiteral).text);
  const taken = new Set([...byName.keys(), ...imports.filter((statement) => !dataModelImport(statement)).flatMap((statement) => importedNames(statement).map(({ local }) => local))]);
  const printed = typePrinter(checker, servicePath, new Set(taken), documentOf(program, checker));
  const fresh = (name: string) => {
    let candidate = name;
    for (let n = 2; taken.has(candidate); n++) candidate = `${name}${n}`;
    taken.add(candidate);
    return candidate;
  };

  // What lands: every export that needs no context, every stub, and what they refer to.
  const pieces = new Map<Declaration, string>();
  const needed = new Set<Declaration>();
  /** Names the stubs write: the service's contexts and the stub and job helpers. */
  const generated = new Set<string>();
  const need = (names: Iterable<string>) => {
    for (const name of names) {
      for (const declaration of declarationsOf(name)) {
        if (s1Declarations.has(declaration)) {
          if (declaration.isType) fromS1.add(name);
          else refusals.push(`${convexPath}: its stubs need S1's ${name} as a value, which an import from ${s1!.servicePath} would close a cycle for`);
          continue;
        }
        if (needed.has(declaration)) continue;
        needed.add(declaration);
        if (!declaration.convex) need(declaration.uses);
      }
    }
  };
  /** The module's own declarations a signature refers to: a parameter named like one (`key`) is no use of it. */
  const usesIn = (node: ts.Node | undefined) => {
    const found = new Set<string>();
    if (node) walk(node, (child) => ts.isIdentifier(child) && !isPropertyName(child) && topLevel(child) && found.add(child.text));
    return found;
  };
  for (const declaration of declarations) {
    const { statement } = declaration;
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      const literal = statement.moduleSpecifier as ts.StringLiteral;
      const target = literal.text.startsWith(".") ? resolveConvexImport(convexPath, literal.text, exists) : undefined;
      if (!target) refusals.push(`${line(statement)}: re-exports ${literal.text}, which names no module of ${convexRoot}/`);
      else edits.push({ start: literal.getStart(sourceFile), end: literal.getEnd(), text: JSON.stringify(specifierFrom(servicePath, servicePathOf(target))) });
      needed.add(declaration);
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      // `export { f }`: what it names lands with it, unless it is over a context, which only its own export can stub.
      const elements = statement.exportClause.elements;
      const isMachinery = (element: ts.ExportSpecifier) => {
        const target = checker.getExportSpecifierLocalTargetSymbol(element);
        return target !== undefined && machinerySymbols.has(target);
      };
      const exportedMachinery = elements.filter(isMachinery).map((element) => element.name.text);
      if (exportedMachinery.length === elements.length) {
        omitted.push(`${exportedMachinery.join(", ")}: Convex's machinery, exported by a list`);
        continue;
      }
      if (exportedMachinery.length > 0) refusals.push(`${line(statement)}: exports Convex's ${exportedMachinery.join(", ")} in a list beside the module's own`);
      const locals = elements.map((element) => (element.propertyName ?? element.name).text);
      const overContext = locals.filter((local) => declarationsOf(local).some((used) => used.convex));
      if (overContext.length > 0) refusals.push(`${line(statement)}: exports ${overContext.join(", ")} by a list; export the declaration itself`);
      need(locals.filter((local) => !overContext.includes(local)));
      needed.add(declaration);
      continue;
    }
    if (s1Declarations.has(declaration)) continue;
    if (declaration.names.length === 0 && !ts.isExportAssignment(statement)) {
      // A top-level statement with effects, such as filling a table, runs where its module lands.
      if (declaration.convex || declaration.machinery) refusals.push(`${line(statement)}: a top-level statement over a context or Convex's machinery`);
      else {
        need(declaration.uses);
        needed.add(declaration);
      }
      continue;
    }
    if (!declaration.exported && (ts.isVariableStatement(statement) || ts.isClassDeclaration(statement)) && hasEffects(statement, moduleValue)) {
      // `const seeded = cache.set(…)` runs when its module loads, whether or not anything reads it. State over a
      // context (`new WeakMap<QueryCtx, …>()`) only stubbed bodies read, so it is left out and listed.
      if (declaration.convex || declaration.machinery) omitted.push(`${declaration.names.join(", ")}: state over a context or Convex's machinery that only stubbed bodies read`);
      else need(declaration.names);
      continue;
    }
    if (!declaration.exported && !ts.isExportAssignment(statement)) continue;
    if (declaration.convex && ts.isVariableStatement(statement) && statement.declarationList.declarations.length > 1) {
      refusals.push(`${line(statement)}: declares ${declaration.names.join(", ")} in one statement over a context; declare each on its own`);
      continue;
    }
    if (!declaration.convex) {
      need(declaration.names.length > 0 ? declaration.names : declaration.uses);
      needed.add(declaration);
      continue;
    }
    const fn = functionOf(statement);
    const annotation = ts.isVariableStatement(statement) ? statement.declarationList.declarations[0]!.type : undefined;
    const foreign = fn && foreignIn([...fn.parameters, ...(fn.type ? [fn.type] : []), ...(annotation ? [annotation] : [])]);
    if (fn && foreign) {
      omitted.push(`${declaration.names[0]}: takes or returns Convex's ${foreign}`);
      continue;
    }
    if (fn) {
      try {
        pieces.set(declaration, helperStub(fn, statement, dottedPath(convexPath, declaration.names[0]!)));
        need([...fn.parameters, ...(fn.typeParameters ?? []), ...(fn.type ? [fn.type] : []), ...(annotation ? [annotation] : [])].flatMap((node) => [...usesIn(node)]));
      } catch (error) {
        omitted.push(`${declaration.names[0]}: ${(error as Error).message}`);
      }
      continue;
    }
    const registration = registrationOf(checker, statement);
    const name = declaration.names[0]!;
    const path = dottedPath(convexPath, name);
    if (!registration) {
      // A value over a context, such as a parse hook: it keeps its type, and throws on use until its stack ports it.
      const variable = ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1 ? statement.declarationList.declarations[0]! : undefined;
      const foreignType = variable?.type && foreignIn([variable.type]);
      if (ts.isClassDeclaration(statement)) omitted.push(`${name}: a class over a context, which its stack ports whole`);
      else if (!variable || !ts.isIdentifier(variable.name) || foreignType || declaration.machinery) omitted.push(`${name}: Convex's machinery, not a function or value over a context`);
      else {
        try {
          const type = variable.type ? textOf(variable.type.getStart(sourceFile), variable.type.getEnd()) : printed.print(checker.getTypeAtLocation(variable.name));
          pieces.set(declaration, `${textOf(statement.getFullStart(), statement.getStart(sourceFile))}export const ${name}: ${type} = notPortedValue("${path}");`);
          generated.add("notPortedValue");
          if (variable.type) need(usesIn(variable.type));
        } catch (error) {
          omitted.push(`${name}: ${(error as Error).message}`);
        }
      }
    } else if (owned.jobs.has(path)) omitted.push(`${name}: S1 ported it as the job ${path}`);
    else if (!reached.has(path)) omitted.push(`${name}: a registered ${registration.kind} no module reaches by name`);
    else if (registration.unreadable) refusals.push(`${line(statement)}: ${name} ${registration.unreadable}, so its args can't be read; write them out`);
    else {
      try {
        pieces.set(declaration, registeredStub(name, path, registration, reached.get(path)!));
        need(usesIn(registration.args));
      } catch (error) {
        omitted.push(`${name}: ${(error as Error).message}`);
      }
    }
  }
  // A contract stands where the generator leaves an export out, and only there.
  for (const [name, contract] of Object.entries(contracts[convexPath] ?? {})) {
    const declaration = declarationsOf(name).find((candidate) => candidate.exported);
    const left = omitted.findIndex((entry) => entry.startsWith(`${name}: `));
    if (!declaration) refusals.push(`${convexPath}: a contract for ${name}, which the module doesn't export; delete the contract`);
    else if (left === -1) refusals.push(`${convexPath}: a contract for ${name}, which the generator lands itself; delete the contract`);
    else {
      omitted.splice(left, 1);
      pieces.set(declaration, `\n\n${contract.text}`);
      generated.add("notPorted");
      need(contract.uses ?? []);
    }
  }
  // An inferred return type may name a type of this module that no export needed so far.
  need(printed.locals);
  const missing = [...needed].filter((declaration) => declaration.convex && !pieces.has(declaration) && !declaration.exported);
  for (const declaration of missing) refusals.push(`${line(declaration.statement)}: ${declaration.names.join(", ")} is over a context or Convex's machinery, and an export that lands needs it`);

  const landing = declarations.filter((declaration) => pieces.has(declaration) || (needed.has(declaration) && !declaration.convex));
  for (const { statement } of landing) {
    if (ts.isEnumDeclaration(statement)) refusals.push(`${line(statement)}: declares the enum ${statement.name.text}, which the service's erasableSyntaxOnly forbids; port it as a union of literals`);
  }
  const body = landing
    .map((declaration) => pieces.get(declaration) ?? textOf(declaration.statement.getFullStart(), declaration.statement.getEnd()))
    .join("")
    .replace(/^\s*\n/, "");
  const landedAt = (start: number) => ranges.some(([from, to]) => start >= from && start < to);
  refusals.push(...editRefusals.filter(({ start }) => landedAt(start)).map(({ message }) => message));
  // A name the skeleton writes for the service must mean the service's: a local of the same name would take it over.
  const written = new Set([
    ...typeEdits.filter(({ start }) => landedAt(start)).map(({ text: written }) => /^[A-Za-z]+/.exec(written)?.[0] ?? ""),
    ...generated,
    // The service's types a printed type names (`Doc`, `Id`), and zod's names where the codemod wrote them.
    ...[...printed.imports.values()].flatMap((names) => [...names]),
    ...edits.filter(({ start, text: written }) => landedAt(start) && /^zv?\./.test(written)).map(({ text: written }) => /^zv?/.exec(written)![0]),
  ]);
  for (const name of written) if (taken.has(name)) refusals.push(`${convexPath}: declares or imports ${name}, a name the skeleton writes for the service's own`);
  // A parameter, type parameter or local in what lands would take it over as well.
  walk(sourceFile, (node) => {
    const name = (node as ts.NamedDeclaration).name;
    if (!ts.isIdentifier(node) && name && ts.isIdentifier(name) && isDeclarationNode(node) && written.has(name.text) && !taken.has(name.text) && landedAt(name.getStart(sourceFile))) {
      refusals.push(`${line(name)}: declares ${name.text}, a name the skeleton writes for the service's own`);
    }
  });
  if (refusals.length > 0) return { refusals };

  const header = `// The module map's skeleton of ${convexPath}, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw\n// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.\n`;
  const siblingHeader = s1 && `// The module map's skeleton of what S1 left of ${convexPath}, written by tools/rewrite/moduleMap/skeleton.ts. S1's\n// ${s1.servicePath} re-exports it; its stubs throw notPorted until the stack that owns the module ports their bodies.\n`;
  const imported = importsFor(body, printed.imports);
  if (typeof imported !== "string") return imported;
  const importText = [imported, ...(fromS1.size > 0 ? [`import type { ${[...fromS1].sort().join(", ")} } from "${specifierFrom(servicePath, s1!.servicePath)}";`] : [])].filter(Boolean).join("\n");
  // What only types use is imported as a type: a runtime import kept for a signature would load its module.
  const output = importTypesAsTypes(servicePath, `${siblingHeader ?? header}${[importText, body].filter(Boolean).map((part) => `${part}\n`).join("\n")}`);
  // Nothing it writes reaches Convex, whatever the form of import; `import.meta` reaches no module, so it may stay.
  const writtenFile = parse(servicePath, output);
  const reachesConvex = [
    ...specifiers(writtenFile).filter(({ specifier }) => convexPackage.test(specifier) || machinery.test(specifier) || /(^|\/)_generated\//.test(specifier)).map(({ specifier }) => `imports ${specifier}`),
    ...dynamicImports(writtenFile).filter((what) => !what.endsWith(": import.meta")),
  ];
  if (reachesConvex.length > 0) return { refusals: reachesConvex.map((what) => `${convexPath}: its skeleton ${what}, which no skeleton may`) };
  // What it exports, read from what it writes: a stub's args schema and job are exports beside its function.
  const exports = exportedNames(writtenFile);
  return { servicePath, text: output, omitted: [...new Set(omitted)], exports };

  function helperStub(fn: ts.SignatureDeclaration & { body?: ts.Node }, statement: ts.Statement, path: string): string {
    // An overload keeps its signature in the service's types; only the implementation throws.
    if (!fn.body) return textOf(statement.getFullStart(), statement.getEnd());
    let head: string;
    if (fn.type) head = textOf(statement.getFullStart(), fn.body.getStart(sourceFile));
    else {
      // The return type goes after the parameters' own closing parenthesis; `ctx => …` gains parentheses first.
      const close = fn.getChildren(sourceFile).find((child) => child.kind === ts.SyntaxKind.CloseParenToken);
      const returns = printed.returnOf(fn);
      if (close) head = `${textOf(statement.getFullStart(), close.getEnd())}: ${returns}${textOf(close.getEnd(), fn.body.getStart(sourceFile))}`;
      else {
        const parameter = fn.parameters[0]!;
        const start = parameter.getStart(sourceFile);
        head = `${textOf(statement.getFullStart(), start)}(${textOf(start, parameter.getEnd())}): ${returns}${textOf(parameter.getEnd(), fn.body.getStart(sourceFile))}`;
      }
    }
    generated.add("notPorted");
    return `${head}{\n  throw notPorted("${path}");\n}${textOf(fn.body.getEnd(), statement.getEnd())}`;
  }

  function registeredStub(name: string, path: string, { kind, args, argsType, returns: returnsType }: Registration, reach: ReadonlySet<Reach>): string {
    const argsName = fresh(`${name}Args`);
    // What Convex registered, whatever wrapper built it: its own args and return types.
    // What a caller awaits: `Promise<string> | number` settles to `string | number`.
    const settled = checker.getAwaitedType(returnsType) ?? returnsType;
    const returns = printed.print(settled);
    // Args are a map of fields, or already a validator (`v.object(…)`), which the codemod made a schema of.
    let schema: string;
    if (args) {
      const argsText = textOf(args.getStart(sourceFile), args.getEnd());
      schema = validatorClassOf(checker.getTypeAtLocation(args)) ? argsText : `z.strictObject(${argsText})`;
    } else {
      // Convex checks nothing for a registration that declares no args: its args type is the whole contract.
      schema = `z.custom<${printed.print(argsType)}>()`;
    }
    generated.add("notPorted").add("z").add(contexts[kind]);
    if (reach.has("job") && kind !== "query") generated.add(`${kind}Job`);
    const lines = [
      `\n\nexport const ${argsName} = ${schema};`,
      `export async function ${name}(ctx: ${contexts[kind]}, args: z.infer<typeof ${argsName}>): Promise<${returns}> {\n  throw notPorted("${path}");\n}`,
    ];
    if (reach.has("job") && kind !== "query") lines.push(`export const ${fresh(`${name}Job`)} = ${kind}Job("${path}", ${argsName}, ${name});`);
    return lines.join("\n");
  }

  function importsFor(body: string, printedImports: ReadonlyMap<string, Set<string>>): string | { refusals: string[] } {
    const used = new Set<string>();
    walk(ts.createSourceFile("body.ts", body, ts.ScriptTarget.Latest, true), (node) => ts.isIdentifier(node) && !isPropertyName(node) && used.add(node.text));
    const lines: string[] = [];
    const refused: string[] = [];
    for (const statement of imports) {
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      if (specifier === "convex/values") continue;
      const kept = importedNames(statement).filter(({ local }) => used.has(local));
      if (kept.length === 0 && statement.importClause) continue;
      let target = specifier;
      if (/(^|\/)_generated\/dataModel(\.[jt]s)?$/.test(specifier)) {
        for (const { local, imported } of kept) {
          if (!serviceTypes[imported] || local !== imported) refused.push(`${convexPath}: imports ${imported} from the data model`);
        }
        continue; // Doc and Id come with the service's types below
      }
      if (specifier.startsWith(".")) {
        const resolved = resolveConvexImport(convexPath, specifier, exists);
        if (!resolved) {
          refused.push(`${convexPath}: imports ${specifier}, which names no module of ${convexRoot}/`);
          continue;
        }
        target = specifierFrom(servicePath, servicePathOf(resolved));
      }
      lines.push(importLine(statement, kept, target));
    }
    // What the skeleton writes is imported where it writes it; a module's own `notPorted` or `z` keeps its own.
    if (written.has("z")) lines.push(`import { z } from "zod";`);
    if (written.has("zv")) lines.push(`import { zv } from "${specifierFrom(servicePath, `${serviceRoot}/values.ts`)}";`);
    const service = new Map<string, Set<string>>();
    const add = (module: string, name: string) => service.set(module, (service.get(module) ?? new Set()).add(name));
    for (const [name, module] of Object.entries(serviceTypes)) if (used.has(name) && !taken.has(name)) add(module, name);
    for (const [module, names] of printedImports) for (const name of names) add(module, name);
    for (const [module, names] of [...service].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`import type { ${[...names].sort().join(", ")} } from "${specifierFrom(servicePath, `${serviceRoot}/${module}`)}";`);
    }
    const values: Array<[string, string]> = [
      ["notPorted", "notPorted.ts"],
      ["notPortedValue", "notPorted.ts"],
      ["mutationJob", "jobs/define.ts"],
      ["actionJob", "jobs/define.ts"],
    ];
    const valueImports = new Map<string, string[]>();
    for (const [name, module] of values) if (generated.has(name)) valueImports.set(module, [...(valueImports.get(module) ?? []), name]);
    for (const [module, names] of valueImports) lines.push(`import { ${names.join(", ")} } from "${specifierFrom(servicePath, `${serviceRoot}/${module}`)}";`);
    return refused.length > 0 ? { refusals: refused } : lines.join("\n");
  }
}

interface Registration {
  kind: "query" | "mutation" | "action";
  /** The args validator or fields the definition gives, when it gives them. */
  args?: ts.Expression;
  argsType: ts.Type;
  returns: ts.Type;
  /** Why the definition's args can't be read, such as a spread. */
  unreadable?: string;
}

/**
 * `export const name = <call>`, where the call's type is Convex's `RegisteredQuery<Visibility, Args, Returns>` or its
 * kin: whichever builder, alias or wrapper made it, that type names its kind, args and return. Its args validator is
 * read from the definition, `{ args, handler }` or a handler alone. What can't be read is marked, and refused when
 * another module reaches it.
 */
function registrationOf(checker: ts.TypeChecker, statement: ts.Statement): Registration | undefined {
  if (!ts.isVariableStatement(statement)) return undefined;
  const all = statement.declarationList.declarations;
  const found = all.map((declaration) => declaration.initializer && ts.isCallExpression(declaration.initializer) ? registeredCall(checker, declaration.initializer) : undefined).find(Boolean);
  if (!found) return undefined;
  const { call, registration } = found;
  if (all.length !== 1) return { ...registration, unreadable: "registers a function beside other names" };
  if (registration.unreadable) return registration;
  const definition = call.arguments[0];
  if (definition && (ts.isArrowFunction(definition) || ts.isFunctionExpression(definition))) return registration;
  if (!definition || !ts.isObjectLiteralExpression(definition)) return { ...registration, unreadable: "registers a definition given by reference" };
  if (definition.properties.some((p) => ts.isSpreadAssignment(p) || (p.name !== undefined && ts.isComputedPropertyName(p.name)))) {
    return { ...registration, unreadable: "spreads or computes its definition" };
  }
  // `{ args }` names its value as `args: args` would.
  const property = definition.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === "args");
  const args = property && (ts.isPropertyAssignment(property) ? property.initializer : (property as ts.ShorthandPropertyAssignment).name);
  if (args) {
    // A wrapper may register other args than it is given (adding a token, retyping a field): what the definition's
    // validators accept must be the registered args type, field by field. Types, not validators, are compared, so a
    // wrapper that swaps a validator for another of a compatible type (`v.any()` for `v.string()`, an added optional
    // nested field) passes; every wrapper in convex/ hands its definition's args through unchanged (d-afde4bcb).
    const given = checker.getTypeAtLocation(args);
    const accepted = (validator: ts.Type) => {
      const type = validator.getProperty("type");
      return type && checker.getTypeOfSymbolAtLocation(type, args);
    };
    const same = (a: ts.Type | undefined, b: ts.Type | undefined) => a !== undefined && b !== undefined && checker.isTypeAssignableTo(a, b) && checker.isTypeAssignableTo(b, a);
    const registered = registration.argsType;
    const names = (type: ts.Type) => type.getProperties().map((field) => field.name).sort().join();
    const agrees = validatorClassOf(given)
      ? same(accepted(given), registered)
      : names(given) === names(registered) &&
        given.getProperties().every((field) => {
          const own = registered.getProperty(field.name);
          return own !== undefined && same(accepted(checker.getTypeOfSymbolAtLocation(field, args)), checker.getTypeOfSymbolAtLocation(own, args));
        });
    if (!agrees) return { ...registration, unreadable: "registers other args than its definition gives" };
  }
  return { ...registration, args };
}

/** A call that registers a function, by its type: Convex's registered alias, or the same shape under another name. */
function registeredCall(checker: ts.TypeChecker, call: ts.CallExpression): { call: ts.CallExpression; registration: Registration } | undefined {
  const type = checker.getTypeAtLocation(call);
  const alias = type.aliasSymbol;
  const match = alias && /^Registered(Query|Mutation|Action)$/.exec(alias.name);
  const [, argsType, returns] = type.aliasTypeArguments ?? [];
  if (match && argsType && returns && alias!.declarations?.some((declaration) => /\/node_modules\/convex\//.test(declaration.getSourceFile().fileName))) {
    return { call, registration: { kind: match[1]!.toLowerCase() as Registration["kind"], argsType, returns } };
  }
  // `type M = RegisteredMutation<…>` renames the alias: the shape still says it registers, but no longer what.
  const isTrue = (name: string) => {
    const property = type.getProperty(name);
    return property !== undefined && checker.typeToString(checker.getTypeOfSymbolAtLocation(property, call)) === "true";
  };
  if (!isTrue("isConvexFunction")) return undefined;
  const kind = (["query", "mutation", "action"] as const).find((kind) => isTrue(`is${kind[0]!.toUpperCase()}${kind.slice(1)}`));
  return kind && { call, registration: { kind, argsType: type, returns: type, unreadable: "registers through a type that hides Convex's args and return" } };
}

/**
 * A property callers can't assign: declared `readonly`, or made so by the checker (`as const`, `Readonly<T>`), which
 * marks it with a check flag the public API doesn't type.
 */
function isReadonly(property: ts.Symbol): boolean {
  const internal = ts as unknown as { getCheckFlags(symbol: ts.Symbol): number; CheckFlags: { Readonly: number; Mapped: number } };
  const checkFlags = internal.getCheckFlags(property);
  if (checkFlags & internal.CheckFlags.Readonly) return true;
  // A mapped property (`-readonly [K in keyof T]`) sets its own modifiers; its declaration is the source's.
  if (checkFlags & internal.CheckFlags.Mapped) return false;
  return (property.declarations ?? []).some((declaration) => (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly) !== 0);
}

/** Convex's query, mutation or action context, however a module names it. */
function isContext(type: ts.Type): boolean {
  if (type.isUnionOrIntersection()) return type.types.some(isContext);
  const context = /^(Generic)?(Query|Mutation|Action)Ctx$/;
  // Convex's or the generated server's, not an app's type of the same name.
  const convexOwn = (symbol: ts.Symbol | undefined) =>
    symbol !== undefined && context.test(symbol.name) && (symbol.declarations ?? []).some((declaration) => /\/node_modules\/convex\/|\/_generated\/server(\.d)?\.ts$/.test(declaration.getSourceFile().fileName));
  return convexOwn(type.aliasSymbol) || convexOwn(type.getSymbol());
}

function functionOf(statement: ts.Statement): (ts.SignatureDeclaration & { body?: ts.Node }) | undefined {
  if (ts.isFunctionDeclaration(statement)) return statement;
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) return undefined;
  const initializer = statement.declarationList.declarations[0]!.initializer;
  return initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ? initializer : undefined;
}

/** Edits naming Convex's context and paging types as the service does; any other Convex type is refused. */
function serverTypeEdits(sourceFile: ts.SourceFile, machineryOf: (node: ts.Identifier) => string | undefined, refuse: (node: ts.Node, message: string) => void): Edit[] {
  const edits: Edit[] = [];
  const visit = (node: ts.Node): void => {
    const imported = ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) ? machineryOf(node.typeName) : undefined;
    if (ts.isTypeReferenceNode(node) && imported) {
      const convert = serverTypes[imported];
      if (!convert) {
        refuse(node, `names Convex's ${imported}, which the service has no counterpart for`);
        return;
      }
      const args = node.typeArguments ?? ts.factory.createNodeArray<ts.TypeNode>();
      const markers = args.map((_, index) => `\u0000${index}\u0000`);
      const template = convert(markers);
      if (!markers.some((marker) => template.includes(marker))) edits.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: template });
      else {
        // The argument keeps its own edits: only the text around it changes.
        const first = template.indexOf(markers[0]!);
        edits.push({ start: node.getStart(sourceFile), end: args.pos, text: template.slice(0, first) });
        edits.push({ start: args.end, end: node.getEnd(), text: template.slice(first + markers[0]!.length) });
        visit(args[0]!);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return edits;
}

/** Prints an inferred type in the service's names: `Doc` and `Id` from the Drizzle model, the module's own types imported. */
function typePrinter(checker: ts.TypeChecker, servicePath: string, localNames: ReadonlySet<string>, documentOf: (table: string) => ts.Type | undefined) {
  const imports = new Map<string, Set<string>>();
  const locals = new Set<string>();
  const want = (module: string, name: string) => {
    if (`${serviceRoot}/${module}` === servicePath) {
      locals.add(name);
      return name;
    }
    // A name this module declares itself is reached through an import type instead.
    if (localNames.has(name)) return `import(${JSON.stringify(specifierFrom(servicePath, `${serviceRoot}/${module}`))}).${name}`;
    imports.set(module, (imports.get(module) ?? new Set()).add(name));
    return name;
  };
  const fromConvexModule = (declaration: ts.Declaration | undefined) => {
    // A type declared inside a function lives only in its body, which a stub replaces: it is spelled out instead.
    if (declaration && !ts.isSourceFile(declaration.parent)) return undefined;
    const file = declaration?.getSourceFile().fileName;
    const at = file?.lastIndexOf(`/${convexRoot}/`);
    if (!file || at === undefined || at < 0 || file.includes("/node_modules/") || file.includes("/_generated/")) return undefined;
    const module = servicePathOf(file.slice(at + 1)).slice(serviceRoot.length + 1);
    // Another module's type that it keeps to itself can't be named here: the printer spells it out instead.
    if (`${serviceRoot}/${module}` !== servicePath) {
      const moduleSymbol = checker.getSymbolAtLocation(declaration!.getSourceFile());
      const name = (declaration as ts.NamedDeclaration).name?.getText();
      if (!moduleSymbol || !checker.getExportsOfModule(moduleSymbol).some((symbol) => symbol.name === name)) return undefined;
    }
    return module;
  };
  let depth = 0;
  const print = (type: ts.Type): string => {
    if (depth > 12) throw new Error(`names ${checker.typeToString(type)}, too deep a type to spell out`);
    depth++;
    try {
      return printType(type);
    } finally {
      depth--;
    }
  };
  const printType = (type: ts.Type): string => {
    const flags = type.flags;
    if (flags & ts.TypeFlags.Any) {
      // The checker's error type is an `any` too: a name it couldn't resolve (a lib the program lacks), not the module's own `any`.
      if ((type as { intrinsicName?: string }).intrinsicName === "error") throw new Error("names a type the checker can't resolve, so its signature can't be printed");
      return "any";
    }
    if (flags & ts.TypeFlags.Unknown) return "unknown";
    if (flags & ts.TypeFlags.Never) return "never";
    if (flags & ts.TypeFlags.Void) return "void";
    if (flags & ts.TypeFlags.Undefined) return "undefined";
    if (flags & ts.TypeFlags.Null) return "null";
    // The service compiles with erasableSyntaxOnly, which has no enums: a type that names one can't be written there.
    const declared = type.getSymbol();
    const enumName = declared && declared.flags & ts.SymbolFlags.EnumMember ? declared.declarations?.[0]?.parent : declared?.declarations?.find(ts.isEnumDeclaration);
    if (flags & ts.TypeFlags.EnumLike || (enumName && ts.isEnumDeclaration(enumName))) {
      const name = enumName && ts.isEnumDeclaration(enumName) ? enumName.name.text : checker.typeToString(type);
      throw new Error(`names the enum ${name}, which the service's erasableSyntaxOnly has no counterpart for`);
    }
    if (flags & (ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.BigInt | ts.TypeFlags.Boolean | ts.TypeFlags.Literal | ts.TypeFlags.TypeParameter)) {
      return checker.typeToString(type);
    }
    const alias = type.aliasSymbol;
    const fromConvex = (symbol: ts.Symbol) => symbol.declarations?.some((declaration) => /\/node_modules\/convex\/|\/_generated\/dataModel(\.d)?\.ts$/.test(declaration.getSourceFile().fileName)) ?? false;
    if (alias && (alias.name === "Id" || alias.name === "GenericId") && fromConvex(alias) && type.aliasTypeArguments?.length === 1) return `${want("db/columns.ts", "Id")}<${print(type.aliasTypeArguments[0]!)}>`;
    if (type.isUnion()) return printUnion(type.types);
    // An ID whose alias inference dropped is Convex's `string & { __tableName: T }`.
    const table = type.isIntersection() && type.types.length === 2 && type.types.some((member) => member.flags & ts.TypeFlags.String) ? tableOfBrand(type.types.find((member) => !(member.flags & ts.TypeFlags.String))!) : undefined;
    if (table) return `${want("db/columns.ts", "Id")}<${JSON.stringify(table)}>`;
    // A builder over Convex's (the website's `memberQuery`) returns a registration, which the service has no type for.
    const isTrue = (name: string) => {
      const property = type.getProperty(name);
      return property !== undefined && checker.typeToString(checker.getTypeOfSymbol(property)) === "true";
    };
    if (isTrue("isConvexFunction") && (isTrue("isQuery") || isTrue("isMutation") || isTrue("isAction"))) throw new Error("returns a Convex function registration, which the service's operations replace");
    if (type.isIntersection()) return type.types.map((member) => parenthesize(print(member))).join(" & ");
    if (alias) {
      const module = fromConvexModule(alias.declarations?.[0]);
      if (module) return `${want(module, alias.name)}${typeArguments(type.aliasTypeArguments)}`;
      if (alias.name in serverTypes && alias.declarations?.[0]?.getSourceFile().fileName.includes("/convex/dist/")) return mapServerType(alias.name, type.aliasTypeArguments);
    }
    const symbol = type.getSymbol();
    if (symbol?.name === "Promise") return `Promise<${print(checker.getTypeArguments(type as ts.TypeReference)[0]!)}>`;
    if (checker.isTupleType(type)) {
      // Each element keeps its flag: `T?`, `...T[]`, `...T`; the tuple keeps `readonly`.
      const target = (type as ts.TypeReference).target as ts.TupleType;
      const elements = checker.getTypeArguments(type as ts.TypeReference).map((element, index) => {
        const flag = target.elementFlags[index]!;
        if (flag & ts.ElementFlags.Optional) return `${parenthesize(print(element))}?`;
        if (flag & ts.ElementFlags.Rest) return `...${parenthesize(print(element))}[]`;
        if (flag & ts.ElementFlags.Variadic) return `...${print(element)}`;
        return print(element);
      });
      return `${target.readonly ? "readonly " : ""}[${elements.join(", ")}]`;
    }
    if (checker.isArrayType(type)) {
      const readonly = type.getSymbol()?.name === "ReadonlyArray" ? "readonly " : "";
      return `${readonly}${parenthesize(print(checker.getTypeArguments(type as ts.TypeReference)[0]!))}[]`;
    }
    if (symbol && (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) !== 0) {
      if (symbol.name in serverTypes && symbol.declarations?.[0]?.getSourceFile().fileName.includes("/convex/dist/")) {
        return mapServerType(symbol.name, (type as ts.TypeReference).typeArguments);
      }
      const module = fromConvexModule(symbol.declarations?.[0]);
      if (module) return `${want(module, symbol.name)}${typeArguments((type as ts.TypeReference).typeArguments)}`;
      if (symbol.declarations?.every((declaration) => /\/typescript5?\/lib\/lib\./.test(declaration.getSourceFile().fileName))) {
        // A built-in's arguments are printed like any type, so a module's own type inside one (`Map<string, Row>`) lands.
        const reference = ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0 ? (type as ts.TypeReference) : undefined;
        const parameters = reference?.target.typeParameters?.length ?? 0;
        return `${symbol.name}${typeArguments(reference ? checker.getTypeArguments(reference).slice(0, parameters) : undefined)}`;
      }
      throw new Error(`returns ${checker.typeToString(type)}, which the service has no counterpart for`);
    }
    if (flags & ts.TypeFlags.Object) {
      const id = type.getProperty("_id");
      // A whole document of a table: the same fields as the data model's, each as the data model types it.
      const table = id && checker.getTypeOfSymbol(id).aliasTypeArguments?.[0];
      const document = table?.isStringLiteral() ? documentOf(table.value) : undefined;
      // Same fields, and no index or call signature a document hasn't (`[key: string]: unknown` would be lost).
      const sameFields = (a: ts.Type, b: ts.Type) => {
        const names = (t: ts.Type) => t.getProperties().map((property) => property.name).sort().join("\n");
        const signatures = (t: ts.Type) => [checker.getIndexInfosOfType(t).length, t.getCallSignatures().length, t.getConstructSignatures().length].join();
        return names(a) === names(b) && signatures(a) === signatures(b);
      };
      if (table?.isStringLiteral() && document && sameFields(type, document) && checker.isTypeAssignableTo(type, document) && checker.isTypeAssignableTo(document, type)) {
        return `${want("db/schema/index.ts", "Doc")}<${JSON.stringify(table.value)}>`;
      }
      const properties = checker.getPropertiesOfType(type).map((property) => {
        const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
        const propertyType = checker.getTypeOfSymbol(property);
        // An optional property's `| undefined` is the `?` itself.
        const printedType = optional && propertyType.isUnion() ? printUnion(propertyType.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined))) : print(propertyType);
        return `${isReadonly(property) ? "readonly " : ""}${/^[A-Za-z_$][\w$]*$/.test(property.name) ? property.name : JSON.stringify(property.name)}${optional ? "?" : ""}: ${printedType}`;
      });
      const index = checker.getIndexInfosOfType(type).map((info) => `${info.isReadonly ? "readonly " : ""}[key: ${print(info.keyType)}]: ${print(info.type)}`);
      if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) throw new Error(`returns a function, ${checker.typeToString(type)}`);
      if (checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0) throw new Error(`returns a constructor, ${checker.typeToString(type)}`);
      return `{ ${[...properties, ...index].join("; ")} }`;
    }
    throw new Error(`returns ${checker.typeToString(type)}, which the printer can't name`);
  };
  function printUnion(types: readonly ts.Type[]): string {
    const members = types.map(print);
    const booleans = members.includes("true") && members.includes("false");
    return [...new Set(booleans ? ["boolean", ...members.filter((m) => m !== "true" && m !== "false")] : members)].join(" | ");
  }
  const mapServerType = (name: string, args: readonly ts.Type[] | undefined) => {
    const mapped = serverTypes[name]!((args ?? []).map(print));
    const service = /^[A-Za-z]+/.exec(mapped)![0];
    if (serviceTypes[service]) want(serviceTypes[service], service);
    return mapped;
  };
  const typeArguments = (args: readonly ts.Type[] | undefined) => (args && args.length > 0 ? `<${args.map(print).join(", ")}>` : "");
  const tableOfBrand = (brand: ts.Type) => {
    // Only the table's name: an index, call or construct signature beside it would be lost in `Id<T>`.
    const signatures = checker.getIndexInfosOfType(brand).length + brand.getCallSignatures().length + brand.getConstructSignatures().length;
    const [property, ...rest] = brand.flags & ts.TypeFlags.Object && signatures === 0 ? checker.getPropertiesOfType(brand) : [];
    const table = property?.name === "__tableName" && rest.length === 0 ? checker.getTypeOfSymbol(property) : undefined;
    return table?.isStringLiteral() ? table.value : undefined;
  };
  // A union or intersection at the top level, outside brackets and string literals, needs parentheses inside `[]`, `?` or `&`.
  const parenthesize = (printed: string) => {
    let nesting = 0;
    let quote: string | undefined;
    for (let index = 0; index < printed.length; index++) {
      const char = printed[index]!;
      if (quote) {
        if (char === "\\") index++;
        else if (char === quote) quote = undefined;
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if ("{[(<".includes(char)) nesting++;
      else if ("}])>".includes(char) && !(char === ">" && printed[index - 1] === "=")) nesting--;
      else if (nesting === 0 && (char === "|" || char === "&")) return `(${printed})`;
    }
    return printed;
  };
  return {
    imports: imports as ReadonlyMap<string, Set<string>>,
    /** This module's own types the printer named. */
    locals: locals as ReadonlySet<string>,
    print,
    returnOf: (fn: ts.SignatureDeclaration) => print(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(fn)!)),
    servicePath,
  };
}

function importedNames(statement: ts.ImportDeclaration): Array<{ local: string; imported: string; text: string }> {
  const clause = statement.importClause;
  if (!clause) return [];
  const found: Array<{ local: string; imported: string; text: string }> = [];
  if (clause.name) found.push({ local: clause.name.text, imported: "default", text: clause.name.text });
  const named = clause.namedBindings;
  if (named && ts.isNamespaceImport(named)) found.push({ local: named.name.text, imported: "*", text: `* as ${named.name.text}` });
  if (named && ts.isNamedImports(named)) for (const element of named.elements) found.push({ local: element.name.text, imported: (element.propertyName ?? element.name).text, text: element.getText() });
  return found;
}

/** The data model's document type of each table, read from `_generated/dataModel`'s `DataModel`. */
function documentOf(program: ts.Program, checker: ts.TypeChecker): (table: string) => ts.Type | undefined {
  const file = program.getSourceFiles().find((sourceFile) => new RegExp(`/${convexRoot}/_generated/dataModel(\\.d)?\\.ts$`).test(sourceFile.fileName));
  const moduleSymbol = file && checker.getSymbolAtLocation(file);
  const dataModel = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === "DataModel");
  const model = dataModel && checker.getDeclaredTypeOfSymbol(dataModel);
  return (table) => {
    const entry = model?.getProperty(table);
    const document = entry && checker.getTypeOfSymbol(entry).getProperty("document");
    return document && checker.getTypeOfSymbol(document);
  };
}

/**
 * Whether a statement changes something when its module loads, outside any function: an assignment, or a call or
 * `new` of the module's own values or its imports (`cache.set(…)`, `register(…)`). Built-ins (`new Set(…)`,
 * `Object.keys(…)`) change nothing another module sees.
 */
function hasEffects(statement: ts.Statement, moduleValue: (node: ts.Identifier) => boolean): boolean {
  let found = false;
  const rootOf = (expression: ts.Expression): ts.Expression => {
    while (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) || ts.isCallExpression(expression) || ts.isParenthesizedExpression(expression)) expression = expression.expression;
    return expression;
  };
  const visit = (node: ts.Node): void => {
    if (found) return;
    // A function runs only when called: its body counts where it is called at once, `(() => …)()`, also through a
    // cast or `satisfies`, or `.call`, `.apply` and `.bind`.
    if (ts.isFunctionLike(node)) {
      let call: ts.Node = node;
      for (;;) {
        const parent: ts.Node = call.parent;
        const wraps = ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent) || ts.isNonNullExpression(parent) || ts.isTypeAssertionExpression(parent);
        const invokes = ts.isPropertyAccessExpression(parent) && parent.expression === call && ["call", "apply", "bind"].includes(parent.name.text);
        if (!wraps && !invokes) break;
        call = parent;
      }
      if ((ts.isCallExpression(call.parent) || ts.isNewExpression(call.parent) || ts.isTaggedTemplateExpression(call.parent)) && (ts.isTaggedTemplateExpression(call.parent) ? call.parent.tag : call.parent.expression) === call) {
        ts.forEachChild(node, visit);
      } else if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node) && !ts.isFunctionDeclaration(node)) {
        // A method, accessor or constructor runs later, but a computed name and decorators run with its class.
        if ((node as ts.NamedDeclaration).name && ts.isComputedPropertyName((node as ts.NamedDeclaration).name!)) visit((node as ts.NamedDeclaration).name!);
      }
      return;
    }
    // A class runs its decorators, computed member names, static initializers and blocks where it is declared.
    if (ts.isClassLike(node)) {
      ts.getDecorators(node)?.forEach(visit);
      for (const member of node.members) {
        if (member.name && ts.isComputedPropertyName(member.name)) visit(member.name);
        if (ts.canHaveDecorators(member)) ts.getDecorators(member)?.forEach(visit);
        const isStatic = ts.isClassStaticBlockDeclaration(member) || (ts.canHaveModifiers(member) && ts.getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword));
        if (!isStatic) continue;
        if (ts.isClassStaticBlockDeclaration(member)) ts.forEachChild(member.body, visit);
        else if (ts.isPropertyDeclaration(member) && member.initializer) visit(member.initializer);
      }
      node.heritageClauses?.forEach(visit);
      return;
    }
    const callee = ts.isCallExpression(node) || ts.isNewExpression(node) ? rootOf(node.expression) : ts.isTaggedTemplateExpression(node) ? rootOf(node.tag) : undefined;
    const passes = (ts.isCallExpression(node) || ts.isNewExpression(node)) && (node.arguments ?? []).some((argument) => ts.isIdentifier(argument) && moduleValue(argument));
    // A module value passed to a call may be changed by it: `Object.assign(cache, …)`.
    if ((callee && ts.isIdentifier(callee) && moduleValue(callee)) || passes) found = true;
    else if (ts.isAwaitExpression(node) || ts.isDeleteExpression(node)) found = true;
    else if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) found = true;
    else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(statement);
  return found;
}

function isDeclarationNode(node: ts.Node): boolean {
  return (
    ts.isTypeParameterDeclaration(node) ||
    ts.isParameter(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isBindingElement(node) ||
    ts.isFunctionDeclaration(node) ||
    // `function notPorted() {}` as a value names a binding inside its own body.
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  );
}

function importedIdentifiers(statement: ts.ImportDeclaration): Array<{ node: ts.Identifier; imported: string }> {
  const clause = statement.importClause;
  if (!clause) return [];
  const found: Array<{ node: ts.Identifier; imported: string }> = [];
  if (clause.name) found.push({ node: clause.name, imported: "default" });
  const named = clause.namedBindings;
  if (named && ts.isNamespaceImport(named)) found.push({ node: named.name, imported: "*" });
  if (named && ts.isNamedImports(named)) for (const element of named.elements) found.push({ node: element.name, imported: (element.propertyName ?? element.name).text });
  return found;
}

function importLine(statement: ts.ImportDeclaration, kept: ReturnType<typeof importedNames>, specifier: string): string {
  if (!statement.importClause) return `import "${specifier}";`;
  const typeOnly = statement.importClause.isTypeOnly ? "type " : "";
  const defaults = kept.filter(({ imported }) => imported === "default").map(({ text }) => text);
  const namespace = kept.filter(({ imported }) => imported === "*").map(({ text }) => text);
  const named = kept.filter(({ imported }) => imported !== "default" && imported !== "*").map(({ text }) => text);
  const parts = [...defaults, ...namespace, ...(named.length > 0 ? [`{ ${named.join(", ")} }`] : [])];
  return `import ${typeOnly}${parts.join(", ")} from "${specifier}";`;
}

/** What a module exports, by the names it exports them under: a type when only a type declares it. */
export function exportedNames(file: ts.SourceFile): Skeleton["exports"] {
  const exports: Skeleton["exports"] = { values: [], types: [] };
  const isTypeStatement = (statement: ts.Statement) => ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement);
  const localTypes = new Set(file.statements.filter(isTypeStatement).flatMap(declaredNames));
  // A name a value declares too (`type Token` beside `const Token`) exports the value, and the type with it.
  const localValues = new Set(file.statements.filter((statement) => !isTypeStatement(statement)).flatMap(declaredNames));
  for (const statement of file.statements) {
    if (isExported(statement)) (isTypeStatement(statement) ? exports.types : exports.values).push(...declaredNames(statement));
    // An export list of the module's own names, as an export the module declares apart (`export { half, names }`).
    else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const local = (element.propertyName ?? element.name).text;
        const isType = statement.isTypeOnly || element.isTypeOnly || (localTypes.has(local) && !localValues.has(local));
        (isType ? exports.types : exports.values).push(element.name.text);
      }
    }
  }
  return exports;
}

function declaredNames(statement: ts.Statement): string[] {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
    return [statement.name.text];
  }
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap((declaration) => bindingNames(declaration.name));
  return [];
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)));
}

function isExported(statement: ts.Statement): boolean {
  return ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isQualifiedName(parent) && parent.right === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

/** Visits every node, saying whether it sits in a type. */
function walk(root: ts.Node, visit: (node: ts.Node, inType: boolean) => void): void {
  const go = (node: ts.Node, inType: boolean): void => {
    // `class A extends B` reads `B` as a value, though the parser types the heritage expression as a type node.
    const extendsValue = ts.isExpressionWithTypeArguments(node) && ts.isHeritageClause(node.parent) && node.parent.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(node.parent.parent);
    const typed = inType || (ts.isTypeNode(node) && !extendsValue);
    visit(node, typed);
    ts.forEachChild(node, (child) => go(child, typed));
  };
  go(root, false);
}
