// The equivalence check between a Convex validator and the zod schema the codemod made of it: while both exist, they
// must accept and reject alike. Values come from the validator's own shape: every kind of value it accepts, then each
// one broken at every position by a probe of every other kind, `undefined`, a missing field, an unknown one, and a
// record key Convex refuses.
// What Convex accepts is read from its validator's documented fields (kind, isOptional, fields, members, element,
// key, value), with one deliberate difference: an ID is any string, as the rewrite's IDs are (service/src/values.ts).
import type { GenericValidator } from "convex/values";

interface SafeParse {
  safeParse(value: unknown): { success: boolean };
}

type Node = GenericValidator & {
  kind: string;
  isOptional: "optional" | "required";
  fields?: Record<string, Node>;
  members?: Node[];
  element?: Node;
  key?: Node;
  value?: unknown;
};

const int64 = { min: -(2n ** 63n), max: 2n ** 63n - 1n };

// Convex's documented rule for a record's keys: ASCII, non-empty, not starting with "$" or "_" (and, as every field
// name, printable and at most 1024 characters). Written out here apart from service/src/values.ts on purpose.
const recordKey = (key: string) => /^[^$_][\x20-\x7e]{0,1023}$/.test(key) && /^[\x20-\x7e]+$/.test(key);
const refusedKeys = ["", "$dollar", "_underscore", "__proto__", "é", "tab\t", "k".repeat(1025)];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Whether Convex's validator accepts a value. */
export function convexAccepts(validator: GenericValidator, value: unknown): boolean {
  const node = validator as Node;
  if (value === undefined) return node.isOptional === "optional";
  switch (node.kind) {
    case "string":
    case "id":
      return typeof value === "string";
    case "float64":
      return typeof value === "number";
    case "int64":
      return typeof value === "bigint" && value >= int64.min && value <= int64.max;
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "literal":
      return value === node.value;
    case "array":
      return Array.isArray(value) && value.every((element) => convexAccepts(required(node.element!), element));
    case "object":
      return (
        isPlainObject(value) &&
        Object.keys(value).every((key) => key in node.fields!) &&
        Object.entries(node.fields!).every(([key, field]) => convexAccepts(field, value[key]))
      );
    case "record":
      return isPlainObject(value) && Object.entries(value).every(([key, field]) => recordKey(key) && convexAccepts(node.key!, key) && convexAccepts(required(node.value as Node), field));
    case "union":
      return node.members!.some((member) => convexAccepts(member, value));
    default:
      throw new Error(`No equivalence for a Convex ${node.kind} validator`);
  }
}

const required = (node: Node): Node => ({ ...node, isOptional: "required" }) as Node;

const probes: unknown[] = ["", "probe", 0, -1.5, NaN, Infinity, 0n, 2n ** 63n, true, null, [], [0], {}, { probe: 0 }];

/** Values the validator accepts, at least one per member and field. */
export function samples(validator: GenericValidator): unknown[] {
  const node = validator as Node;
  const optional = node.isOptional === "optional" ? [undefined] : [];
  switch (node.kind) {
    case "string":
      return ["", "text", ...optional];
    case "id":
      return ["k57c2f7b8a1e9d3c4b5a6f7e8d9c0b1a2", ...optional];
    case "float64":
      return [0, -2.5, NaN, Infinity, ...optional];
    case "int64":
      return [0n, int64.min, int64.max, ...optional];
    case "boolean":
      return [true, false, ...optional];
    case "null":
      return [null, ...optional];
    case "literal":
      return [node.value, ...optional];
    case "array": {
      const elements = samples(required(node.element!));
      return [[], elements, ...optional];
    }
    case "object": {
      // Each field's samples once: an optional field's are its required ones and a trailing `undefined`.
      const fields = Object.entries(node.fields!).map(([key, field]) => [key, samples(field), field.isOptional === "optional"] as const);
      const base = Object.fromEntries(fields.map(([key, own, isOptional]) => [key, (isOptional ? own.slice(0, -1) : own)[0]]));
      const varied = fields.flatMap(([key, own]) => own.map((sample) => withField(base, key, sample)));
      return [base, ...varied, ...optional];
    }
    case "record": {
      const keys = samples(node.key!).filter((key): key is string => typeof key === "string" && recordKey(key));
      const values = samples(required(node.value as Node));
      return [{}, Object.fromEntries(keys.map((key, index) => [key, values[index % values.length]])), ...optional];
    }
    case "union":
      return [...node.members!.flatMap((member) => samples(member)), ...optional];
    default:
      throw new Error(`No samples for a Convex ${node.kind} validator`);
  }
}

function withField(object: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const copy = { ...object };
  if (value === undefined) delete copy[key];
  else copy[key] = value;
  return copy;
}

/** Each sample broken once per position: a probe in place of every value, a missing field and an unknown one. */
export function cases(validator: GenericValidator): unknown[] {
  const node = validator as Node;
  const found = [...samples(node), ...probes, undefined];
  switch (node.kind) {
    case "array":
      found.push(...broken(required(node.element!)).map((element) => [element]), [undefined]);
      break;
    case "object": {
      const fields = Object.entries(node.fields!);
      const base = Object.fromEntries(fields.map(([key, field]) => [key, samples(required(field))[0]]));
      found.push({ ...base, unknownField: 0 });
      for (const [key, field] of fields) found.push(withField(base, key, undefined), ...broken(required(field)).map((value) => withField(base, key, value)));
      break;
    }
    case "record": {
      const value = samples(required(node.value as Node))[0];
      found.push(...broken(required(node.value as Node)).map((broke) => ({ key: broke })), { key: undefined }, ...refusedKeys.map((key) => ({ [key]: value })));
      break;
    }
    case "union":
      found.push(...node.members!.flatMap((member) => cases(member)));
      break;
  }
  return found;
}

const broken = (node: Node): unknown[] => cases(node).filter((value) => value !== undefined);

/** Every case on which the two disagree, with what each said; empty when they're equivalent. */
export function disagreements(validator: GenericValidator, schema: SafeParse): string[] {
  const found: string[] = [];
  for (const value of cases(validator)) {
    const convex = convexAccepts(validator, value);
    const zod = schema.safeParse(value).success;
    if (convex !== zod) found.push(`${show(value)}: Convex ${convex ? "accepts" : "rejects"}, zod ${zod ? "accepts" : "rejects"}`);
  }
  return found;
}

function show(value: unknown): string {
  if (value === undefined) return "undefined";
  // A field holding `undefined` is shown, where JSON would drop it.
  const shown = JSON.stringify(value, (_, item) =>
    item === undefined ? "\u0001undefined" : typeof item === "bigint" ? `${item}n` : typeof item === "number" && !Number.isFinite(item) ? String(item) : item,
  );
  return shown.replaceAll('"\\u0001undefined"', "undefined");
}
