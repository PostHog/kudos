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
import ts from "typescript5";
import { specifiers } from "./closure.ts";
import { validatorClassOf, validatorEdits, type Edit } from "./codemod.ts";
import { convexPackage, dynamicImports, type Landed } from "./copy.ts";
import { applyEdits, convexRoot, parse, resolveConvexImport, servicePathOf, serviceRoot, specifierFrom } from "./imports.ts";

export type Reach = "run" | "job";
/** Every registered function reached by name, by dotted path, and how. */
export type Reached = ReadonlyMap<string, ReadonlySet<Reach>>;

const builders: Record<string, "query" | "mutation" | "action"> = {
  query: "query",
  internalQuery: "query",
  mutation: "mutation",
  internalMutation: "mutation",
  action: "action",
  internalAction: "action",
};
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

interface Declaration {
  statement: ts.Statement;
  names: string[];
  exported: boolean;
  /** Top-level names of this module it refers to. */
  uses: Set<string>;
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
}

export function skeletonModule(program: ts.Program, sourceFile: ts.SourceFile, convexPath: string, reached: Reached, exists: (path: string) => boolean): Skeleton | { refusals: string[] } {
  const checker = program.getTypeChecker(); // binds the files, which sets the parents the walk reads
  const text = sourceFile.text;
  const servicePath = servicePathOf(convexPath);
  const refusals: string[] = [];
  const omitted: string[] = [];
  const line = (node: ts.Node) => `${convexPath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`;

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
  /**
   * The builder a registration calls, by the name Convex exports it under: through a local alias (`const q =
   * internalQuery`) too. The app's own wrappers (`memberQuery`) count by what their call returns, Convex's registered
   * query, mutation or action, so an imported helper that only shares a builder's name is none.
   */
  const builderOf = (node: ts.Identifier): string | undefined => {
    let symbol = checker.getSymbolAtLocation(node);
    for (let hops = 0; symbol && hops < 8; hops++) {
      const convex = machinerySymbols.get(symbol);
      if (convex) return convex;
      const declaration = symbol.declarations?.[0];
      if (declaration && ts.isImportSpecifier(declaration)) return ts.isCallExpression(node.parent) ? registeredKind(checker.getTypeAtLocation(node.parent)) : undefined;
      if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer || !ts.isIdentifier(declaration.initializer)) return undefined;
      if (!(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const)) return undefined;
      symbol = checker.getSymbolAtLocation(declaration.initializer);
    }
    return undefined;
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
  const byName = new Map<string, Declaration>();
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
    const declaration: Declaration = { statement, names, exported: isExported(statement), uses: new Set(), convex: false, machinery: false, isType };
    walk(statement, (node, inType) => {
      // A function over a context, even one typed only by where it stands (a hook's `claims: async (ctx) => …`).
      if (!isType && !inType && ts.isFunctionLike(node) && node.parameters.some((parameter) => isContext(checker.getTypeAtLocation(parameter)))) declaration.convex = true;
      if (!ts.isIdentifier(node) || isPropertyName(node)) return;
      const imported = machineryOf(node);
      if (imported && !inType) declaration.machinery = true;
      if (imported && !(inType && imported in serverTypes)) declaration.convex = true;
      if (imported && inType && !isType && /Ctx$/.test(imported)) declaration.convex = true;
      if (topLevel(node)) declaration.uses.add(node.text);
    });
    declarations.push(declaration);
    for (const name of names) byName.set(name, declaration);
  }
  for (const declaration of declarations) for (const name of declaration.names) declaration.uses.delete(name);
  // A declaration the codemod can't convert (it reads a validator's own fields, say) is ported by hand, like one over a
  // context: a function of it becomes a stub. A refusal in what still lands refuses the module below.
  const { edits, refusals: editRefusals } = validatorEdits(checker, sourceFile, convexPath);
  for (const declaration of declarations) {
    const { statement } = declaration;
    if (!declaration.isType && editRefusals.some(({ start }) => start >= statement.getStart(sourceFile) && start < statement.getEnd())) declaration.convex = true;
    // A registration is over a context, whether its builder is Convex's or a wrapper of this app's (`memberQuery`).
    if (registrationOf(statement, builderOf)) declaration.convex = true;
  }
  // A value that refers to a value over a context needs one too.
  for (let changed = true; changed; ) {
    changed = false;
    for (const declaration of declarations) {
      if (declaration.convex || declaration.isType) continue;
      if ([...declaration.uses].some((name) => byName.get(name)?.convex && !byName.get(name)!.isType)) changed = declaration.convex = true;
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
      const declaration = byName.get(name);
      if (declaration && !needed.has(declaration)) {
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
      const overContext = locals.filter((local) => byName.get(local)?.convex);
      if (overContext.length > 0) refusals.push(`${line(statement)}: exports ${overContext.join(", ")} by a list; export the declaration itself`);
      need(locals.filter((local) => !overContext.includes(local)));
      needed.add(declaration);
      continue;
    }
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
    const registration = registrationOf(statement, builderOf);
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
    } else if (!reached.has(path)) omitted.push(`${name}: a registered ${registration.kind} no module reaches by name`);
    else {
      try {
        pieces.set(declaration, registeredStub(name, path, registration, reached.get(path)!));
        need(usesIn(registration.args));
      } catch (error) {
        omitted.push(`${name}: ${(error as Error).message}`);
      }
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
  const importText = importsFor(body, printed.imports);
  if (typeof importText !== "string") return importText;
  const output = `${header}${[importText, body].filter(Boolean).map((part) => `${part}\n`).join("\n")}`;
  // Nothing it writes reaches Convex, whatever the form of import; `import.meta` reaches no module, so it may stay.
  const writtenFile = parse(servicePath, output);
  const reachesConvex = [
    ...specifiers(writtenFile).filter(({ specifier }) => convexPackage.test(specifier) || machinery.test(specifier) || /(^|\/)_generated\//.test(specifier)).map(({ specifier }) => `imports ${specifier}`),
    ...dynamicImports(writtenFile).filter((what) => !what.endsWith(": import.meta")),
  ];
  if (reachesConvex.length > 0) return { refusals: reachesConvex.map((what) => `${convexPath}: its skeleton ${what}, which no skeleton may`) };
  return { servicePath, text: output, omitted: [...new Set(omitted)] };

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

  function registeredStub(name: string, path: string, { kind, args, handler }: Registration, reach: ReadonlySet<Reach>): string {
    const argsName = fresh(`${name}Args`);
    const returns = printed.unwrapPromise(printed.returnOfType(checker.getTypeAtLocation(handler)));
    // Args are a map of fields, or already a validator (`v.object(…)`), which the codemod made a schema of.
    let schema: string;
    if (args) {
      const argsText = textOf(args.getStart(sourceFile), args.getEnd());
      schema = validatorClassOf(checker.getTypeAtLocation(args)) ? argsText : `z.strictObject(${argsText})`;
    } else {
      // Convex checks nothing for a registration that declares no args: the handler's own type is the whole contract.
      const second = checker.getTypeAtLocation(handler).getCallSignatures()[0]?.parameters[1];
      schema = `z.custom<${second ? printed.print(checker.getTypeOfSymbolAtLocation(second, handler)) : "Record<string, unknown>"}>()`;
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
  args?: ts.Expression;
  handler: ts.Expression;
}

/**
 * `export const name = internalMutation({ args, handler })`, or a builder given the handler alone; a builder imported
 * from Convex is known by the name Convex exports it under, the app's own (`memberQuery`) by its name.
 */
function registrationOf(statement: ts.Statement, builderOf: (node: ts.Identifier) => string | undefined): Registration | undefined {
  if (!ts.isVariableStatement(statement)) return undefined;
  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (!initializer || !ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression)) return undefined;
  const builder = builderOf(initializer.expression);
  const kind = builder ? builders[builder] : undefined;
  const definition = initializer.arguments[0];
  if (!kind || !definition) return undefined;
  if (!ts.isObjectLiteralExpression(definition)) return { kind, handler: definition };
  // `{ args }` names its value as `args: args` would.
  const property = (name: string): ts.Expression | undefined => {
    const found = definition.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === name);
    return found && (ts.isPropertyAssignment(found) ? found.initializer : (found as ts.ShorthandPropertyAssignment).name);
  };
  const handler = property("handler") ?? definition.properties.find((p) => ts.isMethodDeclaration(p) && p.name.getText() === "handler");
  if (!handler) return undefined;
  return { kind, args: property("args"), handler: handler as ts.Expression };
}

/** What a call returns when it registers a function: Convex's `RegisteredQuery<…>` and its kin, not a name alone. */
function registeredKind(type: ts.Type): Registration["kind"] | undefined {
  const alias = type.aliasSymbol;
  const match = alias && /^Registered(Query|Mutation|Action)$/.exec(alias.name);
  if (!match || !alias!.declarations?.some((declaration) => /\/node_modules\/convex\//.test(declaration.getSourceFile().fileName))) return undefined;
  return match[1]!.toLowerCase() as Registration["kind"];
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
    if (flags & ts.TypeFlags.Any) return "any";
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
    if (checker.isArrayType(type)) return `${parenthesize(print(checker.getTypeArguments(type as ts.TypeReference)[0]!))}[]`;
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
        return `${/^[A-Za-z_$][\w$]*$/.test(property.name) ? property.name : JSON.stringify(property.name)}${optional ? "?" : ""}: ${printedType}`;
      });
      const index = checker.getIndexInfosOfType(type).map((info) => `[key: ${print(info.keyType)}]: ${print(info.type)}`);
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
  const parenthesize = (printed: string) => (/[|&]/.test(printed) && !/^[{[(]/.test(printed) ? `(${printed})` : printed);
  const returnOfType = (type: ts.Type) => {
    const signature = type.getCallSignatures()[0];
    if (!signature) throw new Error(`has a handler of no call signature`);
    return print(checker.getReturnTypeOfSignature(signature));
  };
  return {
    imports: imports as ReadonlyMap<string, Set<string>>,
    /** This module's own types the printer named. */
    locals: locals as ReadonlySet<string>,
    print,
    returnOf: (fn: ts.SignatureDeclaration) => print(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(fn)!)),
    returnOfType,
    unwrapPromise: (printed: string) => (printed.startsWith("Promise<") && printed.endsWith(">") ? printed.slice(8, -1) : printed),
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
    ts.isClassDeclaration(node) ||
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
    const typed = inType || ts.isTypeNode(node);
    visit(node, typed);
    ts.forEachChild(node, (child) => go(child, typed));
  };
  go(root, false);
}
