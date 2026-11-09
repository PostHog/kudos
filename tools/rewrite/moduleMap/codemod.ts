// The codemod: a module whose body declares Convex validators, and touches no `ctx`, lands in the service with each
// validator turned into the zod schema that accepts and rejects the same values:
// - `v.object` becomes `z.strictObject`, since a Convex object refuses a field it doesn't declare;
// - `v.union(a, b)` becomes `z.union([a, b])`, and `v.union()` `z.never()`;
// - `v.number()` and `v.id(t)` become the service's `zv` schemas, where zod alone would judge apart;
// - `v.int64()` becomes `z.int64()`; `v.any()` and `v.bytes()`, which no module declares, are refused; every other
//   `v.x` is `z.x`;
// - `Infer<T>` becomes `z.infer<T>`, `ObjectType<F>` `z.infer<z.ZodObject<F>>`, `PropertyValidators` `z.ZodRawShape`
//   and `GenericValidator` `z.ZodType`;
// - a validator's `.fields` becomes `.shape` and its `.members` `.options`, found by the type checker, never by name;
//   `.omit("a", "b")` and `.pick` name their fields in a mask, `.omit({ a: true, b: true })`.
// Anything else from Convex is refused with where it is, so a module either converts whole or not at all.
import ts from "typescript5";
import { convexPackage, type Landed } from "./copy.ts";
import { applyEdits, planImports, servicePathOf, serviceRoot, specifierFrom } from "./imports.ts";

const calls: Record<string, string> = {
  string: "z.string",
  boolean: "z.boolean",
  null: "z.null",
  int64: "z.int64",
  literal: "z.literal",
  array: "z.array",
  object: "z.strictObject",
  record: "z.record",
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
const validatorClasses = /^V(Object|Union|Literal|Array|String|Float64|Int64|Boolean|Null|Any|Id|Bytes|Record|Optional)$/;

export function convertModule(program: ts.Program, sourceFile: ts.SourceFile, convexPath: string, exists: (path: string) => boolean): Landed {
  const checker = program.getTypeChecker();
  const text = sourceFile.text;
  const refusals: string[] = [];
  const at = (node: ts.Node) => `${convexPath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const replace = (start: number, end: number, replacement: string) => edits.push({ start, end, text: replacement });

  // The names this module takes from convex/values, by their symbols, so a local of the same name isn't touched.
  const imported = new Map<ts.Symbol, string>();
  let valuesImport: ts.ImportDeclaration | undefined;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || (statement.moduleSpecifier as ts.StringLiteral).text !== "convex/values") continue;
    valuesImport = statement;
    const named = statement.importClause?.namedBindings;
    if (statement.importClause?.name || !named || !ts.isNamedImports(named)) {
      refusals.push(`${at(statement)}: a default or namespace import of convex/values`);
      continue;
    }
    for (const element of named.elements) {
      const name = (element.propertyName ?? element.name).text;
      if (name !== "v" && !(name in types)) refusals.push(`${at(element)}: imports ${name} from convex/values, which has no zod counterpart here`);
      imported.set(checker.getSymbolAtLocation(element.name)!, name);
    }
  }
  const convexName = (node: ts.Identifier) => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol ? imported.get(symbol) : undefined;
  };

  let usesZv = false;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node) && (node.text === "z" || node.text === "zv") && !convexName(node)) {
      refusals.push(`${at(node)}: names ${node.text}, which the converted module imports`);
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && convexName(node.expression.expression) === "v") {
      const kind = node.expression.name.text;
      const target = calls[kind];
      if (!target) refusals.push(`${at(node)}: v.${kind} has no zod counterpart here`);
      else if (kind === "union" && node.arguments.length === 0) replace(node.getStart(sourceFile), node.getEnd(), "z.never()");
      else {
        usesZv ||= target.startsWith("zv.");
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
      if (!convert) refusals.push(`${at(node)}: ${name} is no type`);
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
      refusals.push(`${at(node)}: uses ${convexName(node)} other than as a call or a type`);
    } else if (ts.isPropertyAccessExpression(node)) {
      const validatorClass = checker.getTypeAtLocation(node.expression).getSymbol()?.getName();
      if (validatorClass && validatorClasses.test(validatorClass)) {
        const renamed = members[validatorClass]?.[node.name.text];
        if (!renamed) refusals.push(`${at(node)}: reads ${node.name.text} of a Convex validator, which zod has no counterpart for`);
        else if (renamed !== node.name.text) replace(node.name.getStart(sourceFile), node.name.getEnd(), renamed);
        else if (renamed === "omit" || renamed === "pick") {
          // Convex names the fields as arguments, zod as the keys of a mask.
          const call = node.parent;
          const names = ts.isCallExpression(call) && call.expression === node ? call.arguments : undefined;
          if (!names || names.length === 0 || !names.every(ts.isStringLiteral)) refusals.push(`${at(node)}: ${renamed}s fields it doesn't name as strings`);
          else replace(names.pos, names.end, `{ ${names.map((name) => `${name.getText(sourceFile)}: true`).join(", ")} }`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const servicePath = servicePathOf(convexPath);
  const plan = planImports(sourceFile, convexPath, exists, (specifier) =>
    specifier === "convex/values" ? true : convexPackage.test(specifier) ? "a converted module declares validators only; rewrite it" : true,
  );
  refusals.push(...plan.refusals);
  if (refusals.length > 0) return { refusals };
  if (valuesImport) {
    const typeOnly = valuesImport.importClause?.isTypeOnly ? "type " : "";
    const zod = [`import ${typeOnly}{ z } from "zod";`, ...(usesZv ? [`import { zv } from "${specifierFrom(servicePath, `${serviceRoot}/values.ts`)}";`] : [])];
    replace(valuesImport.getStart(sourceFile), valuesImport.getEnd(), zod.join("\n"));
  }
  return { servicePath, text: applyEdits(text, [...plan.edits, ...edits]) };
}

/** The text before the first marker and after the last, around the type arguments kept in place between them. */
function splitAround(template: string, markers: string[]): [string, string] {
  if (markers.length === 0) return [template, ""];
  const first = template.indexOf(markers[0]!);
  const last = template.indexOf(markers.at(-1)!) + markers.at(-1)!.length;
  return [template.slice(0, first), template.slice(last)];
}
