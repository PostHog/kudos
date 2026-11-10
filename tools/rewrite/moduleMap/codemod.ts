// The codemod: a module whose body declares Convex validators, and touches no `ctx`, lands in the service with each
// validator turned into the zod schema that accepts and rejects the same values:
// - `v.object` becomes `z.strictObject`, since a Convex object refuses a field it doesn't declare;
// - `v.union(a, b)` becomes `z.union([a, b])`, and `v.union()` `z.never()`;
// - `v.number()`, `v.id(t)` and `v.record(v.string(), x)` become the service's `zv` schemas, where zod alone would judge
//   apart; a record keyed otherwise is refused;
// - `v.int64()` becomes `z.int64()`; `v.any()` and `v.bytes()`, which no module declares, are refused; every other
//   `v.x` is `z.x`;
// - `Infer<T>` becomes `z.infer<T>`, `ObjectType<F>` `z.infer<z.ZodObject<F>>`, `PropertyValidators` `z.ZodRawShape`
//   and `GenericValidator` `z.ZodType`;
// - a validator's `.fields` becomes `.shape` and its `.members` `.options`, found by the type checker, never by name;
//   `.omit("a", "b")` and `.pick` name their fields in a mask, `.omit({ a: true, b: true })`.
// Anything else from Convex is refused with where it is, so a module either converts whole or not at all.
import ts from "typescript5";
import { convexPackage, dynamicImports, type Landed } from "./copy.ts";
import { applyEdits, planImports, servicePathOf, serviceRoot, specifierFrom } from "./imports.ts";

const calls: Record<string, string> = {
  string: "z.string",
  boolean: "z.boolean",
  null: "z.null",
  int64: "z.int64",
  literal: "z.literal",
  array: "z.array",
  object: "z.strictObject",
  record: "zv.record",
  optional: "z.optional",
  union: "z.union",
  number: "zv.number",
  float64: "zv.number",
  id: "zv.id",
};

const types: Record<string, (args: string[]) => string> = {
  Infer: ([type]) => `z.infer<${type}>`,
  ObjectType: ([fields]) => `z.infer<z.ZodObject<${fields}>>`,
  PropertyValidators: () => "z.ZodRawShape",
  GenericValidator: () => "z.ZodType",
};

/** A Convex validator's members that a zod schema names otherwise, by the validator's class. */
const members: Record<string, Record<string, string>> = {
  VObject: { fields: "shape", extend: "extend", partial: "partial", omit: "omit", pick: "pick" },
  VUnion: { members: "options" },
  VLiteral: { value: "value" },
  VArray: { element: "element" },
};
const validatorClasses = /^V(Object|Union|Literal|Array|String|Float64|Int64|Boolean|Null|Any|Id|Bytes|Record|Optional|CommitTs)$/;

export interface Edit {
  start: number;
  end: number;
  text: string;
}

/** The codemod's edits to a module's validators and their types, and what it refused, each by where it starts. */
export interface ValidatorEdits {
  edits: Edit[];
  refusals: Array<{ start: number; message: string }>;
  /** The module's imports of convex/values, which the converted module's zod imports replace. */
  valuesImports: ts.ImportDeclaration[];
}

export function convertModule(program: ts.Program, sourceFile: ts.SourceFile, convexPath: string, exists: (path: string) => boolean): Landed {
  const { edits, refusals, valuesImports } = validatorEdits(program.getTypeChecker(), sourceFile, convexPath);
  const servicePath = servicePathOf(convexPath);
  const plan = planImports(sourceFile, convexPath, exists, (specifier) =>
    specifier === "convex/values" ? true : convexPackage.test(specifier) ? "a converted module declares validators only; rewrite it" : true,
  );
  const refused = [...refusals.map(({ message }) => message), ...plan.refusals, ...dynamicImports(sourceFile).map((what) => `${convexPath}: ${what}, which no import edit reaches`)];
  if (refused.length > 0) return { refusals: refused };
  const [first, ...rest] = valuesImports;
  if (first) {
    // One zod import stands for all of them, a value import unless every one was type-only.
    const typeOnly = valuesImports.every((statement) => statement.importClause?.isTypeOnly);
    edits.push({ start: first.getStart(sourceFile), end: first.getEnd(), text: zodImports(servicePath, edits, typeOnly) });
    for (const statement of rest) edits.push({ start: statement.getFullStart(), end: statement.getEnd(), text: "" });
  } else if (edits.some(({ text }) => /^zv?\./.test(text))) {
    // A module that only reads another module's validators: `typeof x.type` is `z.infer` now.
    const first = sourceFile.statements[0]!.getStart(sourceFile);
    edits.push({ start: first, end: first, text: `${zodImports(servicePath, edits, true)}\n` });
  }
  return { servicePath, text: applyEdits(sourceFile.text, [...plan.edits, ...edits]) };
}

/** The imports a converted text needs in place of convex/values: zod, and the service's `zv` when an edit uses it. */
export function zodImports(servicePath: string, edits: readonly Edit[], typeOnly = false): string {
  const usesZv = edits.some(({ text }) => text.startsWith("zv."));
  return [`import ${typeOnly ? "type " : ""}{ z } from "zod";`, ...(usesZv ? [`import { zv } from "${specifierFrom(servicePath, `${serviceRoot}/values.ts`)}";`] : [])].join("\n");
}

export function validatorEdits(checker: ts.TypeChecker, sourceFile: ts.SourceFile, convexPath: string): ValidatorEdits {
  const refusals: ValidatorEdits["refusals"] = [];
  const refuse = (node: ts.Node, message: string) =>
    refusals.push({ start: node.getStart(sourceFile), message: `${convexPath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: ${message}` });
  const edits: Edit[] = [];
  const replace = (start: number, end: number, replacement: string) => edits.push({ start, end, text: replacement });

  // The names this module takes from convex/values, by their symbols, so a local of the same name isn't touched.
  const imported = new Map<ts.Symbol, string>();
  const valuesImports: ts.ImportDeclaration[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || (statement.moduleSpecifier as ts.StringLiteral).text !== "convex/values") continue;
    valuesImports.push(statement);
    const named = statement.importClause?.namedBindings;
    if (statement.importClause?.name || !named || !ts.isNamedImports(named)) {
      refuse(statement, `a default or namespace import of convex/values`);
      continue;
    }
    for (const element of named.elements) {
      const name = (element.propertyName ?? element.name).text;
      if (name !== "v" && !(name in types)) refuse(element, `imports ${name} from convex/values, which has no zod counterpart here`);
      imported.set(checker.getSymbolAtLocation(element.name)!, name);
    }
  }
  const convexName = (node: ts.Identifier) => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol ? imported.get(symbol) : undefined;
  };

  // `v.<kind>(…)`, where `v` is this module's import of Convex's `v`, whatever its local name.
  const isConvexCall = (node: ts.Node, kind: string): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === kind && ts.isIdentifier(node.expression.expression) && convexName(node.expression.expression) === "v";

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node) && (node.text === "z" || node.text === "zv") && !convexName(node)) {
      refuse(node, `names ${node.text}, which the converted module imports`);
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && convexName(node.expression.expression) === "v") {
      const kind = node.expression.name.text;
      const target = calls[kind];
      const [key] = node.arguments;
      if (!target) refuse(node, `v.${kind} has no zod counterpart here`);
      else if (kind === "record" && !(key && isConvexCall(key, "string") && key.arguments.length === 0)) {
        refuse(node, "a record keyed other than by v.string(), which zod would require every key of");
      } else if (kind === "union" && node.arguments.length === 0) replace(node.getStart(sourceFile), node.getEnd(), "z.never()");
      else {
        replace(node.expression.getStart(sourceFile), node.expression.getEnd(), target);
        if (kind === "union") {
          replace(node.arguments.pos, node.arguments.pos, "[");
          replace(node.arguments.end, node.arguments.end, "]");
        }
      }
      for (const argument of node.arguments) visit(argument);
      return;
    } else if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && convexName(node.typeName)) {
      const name = convexName(node.typeName)!;
      const convert = types[name];
      if (!convert) refuse(node, `${name} is no type`);
      else {
        // Type arguments are converted in place, then wrapped: their own edits stay inside their ranges.
        const args = node.typeArguments ?? ts.factory.createNodeArray<ts.TypeNode>();
        const marker = args.map((_, index) => `\u0000${index}\u0000`);
        const [before, after] = splitAround(convert(marker), marker);
        replace(node.getStart(sourceFile), args.length > 0 ? args.pos : node.getEnd(), before);
        if (args.length > 0) replace(args.end, node.getEnd(), after);
        for (const argument of args) visit(argument);
        return;
      }
    } else if (ts.isIdentifier(node) && convexName(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
      refuse(node, `uses ${convexName(node)} other than as a call or a type`);
    } else if (ts.isTypeQueryNode(node) && ts.isQualifiedName(node.exprName) && validatorClassOf(checker.getTypeAtLocation(node.exprName.left))) {
      // `typeof validator.type` is the type it accepts, `z.infer` of the schema.
      const { left, right } = node.exprName;
      if (right.text !== "type") refuse(node, `reads ${right.text} of a Convex validator, which zod has no counterpart for`);
      else replace(node.getStart(sourceFile), node.getEnd(), `z.infer<typeof ${left.getText(sourceFile)}>`);
      return;
    } else if (
      (ts.isElementAccessExpression(node) && validatorClassOf(checker.getTypeAtLocation(node.expression))) ||
      (ts.isIndexedAccessTypeNode(node) && validatorClassOf(checker.getTypeFromTypeNode(node.objectType)))
    ) {
      refuse(node, `reads a Convex validator's members other than by name`);
    } else if ((ts.isObjectBindingPattern(node) || ts.isPropertyAccessExpression(node)) && isOptionalValidator(checker, checker.getTypeAtLocation(ts.isPropertyAccessExpression(node) ? node.expression : node))) {
      // zod wraps an optional schema in `z.optional`, which has none of the inner schema's members.
      refuse(node, `reads a member of an optional Convex validator, which zod wraps in z.optional`);
    } else if (ts.isObjectBindingPattern(node) && validatorClassOf(checker.getTypeAtLocation(node))) {
      // `({ value }) => value` reads members by name too: each is renamed as a property read would be.
      const validatorClass = validatorClassOf(checker.getTypeAtLocation(node))!;
      for (const element of node.elements) {
        const name = element.propertyName ?? element.name;
        const renamed = !element.dotDotDotToken && ts.isIdentifier(name) ? members[validatorClass]?.[name.text] : undefined;
        if (!renamed) refuse(element, `reads a Convex validator's members other than by name`);
        else if (renamed !== (name as ts.Identifier).text) {
          if (element.propertyName) replace(name.getStart(sourceFile), name.getEnd(), renamed);
          else replace(name.getStart(sourceFile), name.getStart(sourceFile), `${renamed}: `);
        }
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const validatorClass = validatorClassOf(checker.getTypeAtLocation(node.expression));
      if (validatorClass) {
        const renamed = members[validatorClass]?.[node.name.text];
        if (!renamed) refuse(node, `reads ${node.name.text} of a Convex validator, which zod has no counterpart for`);
        else if (renamed !== node.name.text) replace(node.name.getStart(sourceFile), node.name.getEnd(), renamed);
        else if (renamed === "omit" || renamed === "pick") {
          // Convex names the fields as arguments, zod as the keys of a mask.
          const call = node.parent;
          const names = ts.isCallExpression(call) && call.expression === node ? call.arguments : undefined;
          if (!names || names.length === 0 || !names.every(ts.isStringLiteral)) refuse(node, `${renamed}s fields it doesn't name as strings`);
          else replace(names.pos, names.end, `{ ${names.map((name) => `${name.getText(sourceFile)}: true`).join(", ")} }`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { edits, refusals, valuesImports };
}

/**
 * The Convex validator class a value's type is, such as `VUnion`, or `Validator` for a value that may be any of
 * several classes (`GenericValidator`), whose members the codemod renames none of.
 */
export function validatorClassOf(type: ts.Type, depth = 0): string | undefined {
  if (depth > 8) return undefined;
  // A type parameter bound to a validator (`T extends typeof x`) reads as one.
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = type.getConstraint();
    return constraint ? validatorClassOf(constraint, depth + 1) : undefined;
  }
  // A validator with more on it (`typeof x & { tag: string }`) is still that validator.
  if (type.isIntersection()) return oneClass(type.types.map((member) => validatorClassOf(member, depth + 1)).filter((name) => name !== undefined));
  if (type.isUnion()) {
    // `undefined` or `null` beside a validator (an optional parameter) leaves it one; anything else makes it no validator.
    const members = type.types.filter((member) => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
    const classes = members.map((member) => validatorClassOf(member, depth + 1));
    return classes.includes(undefined) ? undefined : oneClass(classes as string[]);
  }
  return convexClass(type);
}

/** One class over several type arguments (`VLiteral<"a"> | VLiteral<"b">`) is that class; several are any validator. */
function oneClass(classes: string[]): string | undefined {
  const distinct = new Set(classes);
  if (distinct.size === 0) return undefined;
  return distinct.size === 1 ? [...distinct][0] : "Validator";
}

/** A validator whose `isOptional` is `"optional"`, such as `v.optional(v.object(…))`. */
function isOptionalValidator(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (!validatorClassOf(type)) return false;
  const property = type.getProperty("isOptional");
  const optional = property && checker.getTypeOfSymbol(property);
  return optional !== undefined && optional.isStringLiteral() && optional.value === "optional";
}

/** A validator class's name, when Convex's own package declares it; an app's class of the same name isn't one. */
function convexClass(type: ts.Type): string | undefined {
  const symbol = type.getSymbol();
  const fromConvex = symbol?.declarations?.some((declaration) => /\/node_modules\/convex\//.test(declaration.getSourceFile().fileName));
  return fromConvex && validatorClasses.test(symbol!.getName()) ? symbol!.getName() : undefined;
}

/** The text before the first marker and after the last, around the type arguments kept in place between them. */
function splitAround(template: string, markers: string[]): [string, string] {
  if (markers.length === 0) return [template, ""];
  const first = template.indexOf(markers[0]!);
  const last = template.indexOf(markers.at(-1)!) + markers.at(-1)!.length;
  return [template.slice(0, first), template.slice(last)];
}
