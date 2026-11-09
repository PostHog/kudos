// Writes the rewrite's Drizzle schema from today's convex/schema.ts, once; the output is then owned by hand.
// Input: the JSON Convex's `defineSchema(...).export()` returns. It reads that JSON only and imports nothing from Convex.
//
// The column rule (spec #110, "The data model"):
// - a field whose every value is one scalar kind gets a typed column: string and ID `text COLLATE "C"`, number
//   `double precision`, int64 `bigint`, boolean `boolean`; optional makes it nullable, and SQL NULL means missing;
// - a required field of one scalar kind or null gets the same typed column, nullable, and SQL NULL means null;
// - every other field (object, array, record, a union across kinds, one that may be both missing and null) gets a
//   `jsonb` column in the codec's stored encoding.
// Every Convex index becomes a B-tree on its fields, then `_creationTime`, then `_id`, with every nullable column
// ascending NULLS FIRST as Convex orders missing and null before any value. A nested index field becomes a stored
// generated column of its scalar type.

export type Validator =
  | { type: "string" | "number" | "bigint" | "boolean" | "null" | "any" | "bytes" }
  | { type: "id"; tableName: string }
  | { type: "literal"; value: string | number | boolean | null | { $integer: string } | { $float: string } }
  | { type: "array"; value: Validator }
  | { type: "record"; keys: Validator; values: { fieldType: Validator; optional: boolean } }
  | { type: "object"; value: Record<string, Field> }
  | { type: "union"; value: Validator[] };

export interface Field {
  fieldType: Validator;
  optional: boolean;
}

export interface ExportedTable {
  tableName: string;
  indexes: Array<{ indexDescriptor: string; fields: string[] }>;
  searchIndexes: unknown[];
  vectorIndexes: unknown[];
  documentType: Validator | null;
}

export interface ExportedSchema {
  tables: ExportedTable[];
}

type Scalar = "string" | "number" | "bigint" | "boolean";
export type Kind = Scalar | "null" | "other";

export type Column =
  | { field: string; kind: Scalar; nullable: boolean; nullMeansNull: boolean; validator: Validator }
  | { field: string; kind: "value"; nullable: boolean; validator: Validator };

export interface Output {
  /** Path relative to `service/src/db/schema/`, and its source. */
  files: Record<string, string>;
  /** Indexed fields stored as jsonb: Postgres orders them by its jsonb rules, not Convex's, so each query on them must. */
  mixedIndexFields: string[];
}

export function kindsOf(validator: Validator): Set<Kind> {
  switch (validator.type) {
    case "union":
      return new Set(validator.value.flatMap((member) => [...kindsOf(member)]));
    case "literal": {
      const value = validator.value;
      if (value === null) return new Set(["null"]);
      if (typeof value === "object") return new Set(["$integer" in value ? "bigint" : "number"]);
      return new Set([typeof value as Scalar]);
    }
    case "id":
    case "string":
      return new Set(["string"]);
    case "number":
    case "bigint":
    case "boolean":
    case "null":
      return new Set([validator.type]);
    default:
      return new Set(["other"]);
  }
}

const scalars = new Set<Kind>(["string", "number", "bigint", "boolean"]);

export function columnOf(field: string, { fieldType, optional }: Field): Column {
  const kinds = kindsOf(fieldType);
  const nonNull = [...kinds].filter((kind) => kind !== "null");
  const single = nonNull.length === 1 && scalars.has(nonNull[0]!) ? (nonNull[0] as Scalar) : undefined;
  if (single && !kinds.has("null")) return { field, kind: single, nullable: optional, nullMeansNull: false, validator: fieldType };
  if (single && !optional) return { field, kind: single, nullable: true, nullMeansNull: true, validator: fieldType };
  return { field, kind: "value", nullable: optional, validator: fieldType };
}

/** The fields of a document type; a union of objects (a table of variants) has every variant's fields. */
export function fieldsOf(documentType: Validator): Record<string, Field> {
  if (documentType.type === "object") return documentType.value;
  if (documentType.type !== "union") throw new Error(`A document type must be an object or a union of objects, not ${documentType.type}`);
  const variants = documentType.value.map(fieldsOf);
  const names = [...new Set(variants.flatMap((variant) => Object.keys(variant)))];
  return Object.fromEntries(
    names.map((name) => {
      const present = variants.map((variant) => variant[name]).filter((field): field is Field => field !== undefined);
      const types = present.map((field) => field.fieldType);
      const fieldType: Validator = types.length === 1 ? types[0]! : { type: "union", value: types };
      return [name, { fieldType, optional: present.length < variants.length || present.some((field) => field.optional) }];
    }),
  );
}

/** The TypeScript type of a value a validator accepts. */
export function typeOf(validator: Validator): string {
  switch (validator.type) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
    case "null":
      return validator.type;
    case "any":
      return "Value";
    case "bytes":
      return "ArrayBuffer";
    case "id":
      return `Id<${JSON.stringify(validator.tableName)}>`;
    case "literal":
      // An int64 literal is tagged `$integer`; NaN, ±Infinity and -0 are tagged `$float`.
      if (typeof validator.value === "object" && validator.value !== null) return "$integer" in validator.value ? "bigint" : "number";
      return JSON.stringify(validator.value);
    case "array":
      return `Array<${typeOf(validator.value)}>`;
    case "record":
      return `Record<${typeOf(validator.keys)}, ${typeOf(validator.values.fieldType)}>`;
    case "object":
      return objectType(validator.value);
    case "union":
      return [...new Set(validator.value.map((member) => (member.type === "union" ? `(${typeOf(member)})` : typeOf(member))))].join(" | ");
  }
}

function objectType(fields: Record<string, Field>): string {
  const entries = Object.entries(fields).map(([name, field]) => `${JSON.stringify(name)}${field.optional ? "?" : ""}: ${typeOf(field.fieldType)}`);
  return entries.length === 0 ? "Record<string, never>" : `{ ${entries.join("; ")} }`;
}

const builders: Record<Scalar | "value", string> = { string: "str", number: "f64", bigint: "i64", boolean: "bool", value: "value" };

function columnSource(column: Column): string {
  let source = `${builders[column.kind]}()`;
  if (column.kind !== "value") {
    const type = typeOf(column.validator);
    const plain = { string: "string", number: "number", bigint: "bigint", boolean: "boolean" }[column.kind];
    const withoutNull = column.nullMeansNull ? type.split(" | ").filter((part) => part !== "null").join(" | ") : type;
    if (withoutNull !== plain) source += `.$type<${withoutNull}>()`;
  }
  return column.nullable ? source : `${source}.notNull()`;
}

/** A nested index field as a stored generated column, read from its jsonb parent only when it holds its kind. */
function nestedColumn(path: string, fields: Record<string, Field>): { key: string; source: string } {
  const [parent, ...rest] = path.split(".");
  const top = fields[parent!];
  if (!top) throw new Error(`Index field ${path} has no top-level field ${parent}`);
  let field: Field = top;
  for (const step of rest) {
    const objects: Validator[] = field.fieldType.type === "union" ? field.fieldType.value.filter((member) => member.type === "object") : [field.fieldType];
    const only = objects.length === 1 ? objects[0] : undefined;
    const next: Field | undefined = only?.type === "object" ? only.value[step] : undefined;
    if (!next) throw new Error(`Index field ${path} doesn't name an object field at ${step}`);
    field = next;
  }
  const kinds = [...kindsOf(field.fieldType)].filter((kind) => kind !== "null");
  const kind = kinds.length === 1 ? kinds[0] : undefined;
  const json = `"${parent}"${rest.map((step) => `->'${step}'`).join("")}`;
  const text = `"${parent}"${rest.slice(0, -1).map((step) => `->'${step}'`).join("")}->>'${rest.at(-1)}'`;
  const key = path.replaceAll(".", "$");
  if (kind === "string") return { key, source: `str(${JSON.stringify(path)}).generatedAlwaysAs(sql\`CASE jsonb_typeof(${json}) WHEN 'string' THEN ${text} END\`)` };
  // NaN, ±Infinity and -0 are stored as `{"$float": name}`, a name `double precision` reads.
  if (kind === "number")
    return {
      key,
      source: `f64(${JSON.stringify(path)}).generatedAlwaysAs(sql\`CASE jsonb_typeof(${json}) WHEN 'number' THEN (${text})::double precision WHEN 'object' THEN (${json}->>'$float')::double precision END\`)`,
    };
  if (kind === "boolean")
    return { key, source: `bool(${JSON.stringify(path)}).generatedAlwaysAs(sql\`CASE jsonb_typeof(${json}) WHEN 'boolean' THEN (${text})::boolean END\`)` };
  throw new Error(`Nested index field ${path} holds ${kinds.join(", ")}; give it a column by hand`);
}

/** Postgres cuts identifiers at 63 bytes; a long index name keeps a hash of the whole so two never collide. */
export function indexName(table: string, index: string): string {
  const name = `${table}_${index}`;
  if (name.length <= 63) return name;
  let hash = 0;
  for (const char of name) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return `${name.slice(0, 54)}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function tableSource(table: ExportedTable, mixedIndexFields: string[]): { source: string; docType: string } {
  if (!table.documentType) throw new Error(`${table.tableName} has no document type`);
  if (table.searchIndexes.length > 0 || table.vectorIndexes.length > 0) throw new Error(`${table.tableName} has a search or vector index`);
  const fields = fieldsOf(table.documentType);
  const columns = Object.entries(fields).map(([name, field]) => columnOf(name, field));
  const nested = new Map<string, { key: string; source: string }>();
  for (const { fields: indexFields } of table.indexes) {
    for (const path of indexFields) if (path.includes(".") && !nested.has(path)) nested.set(path, nestedColumn(path, fields));
  }

  const lines = [
    `    _id: id(),`,
    `    _creationTime: creationTime(),`,
    ...columns.map((column) => `    ${key(column.field)}: ${columnSource(column)},`),
    ...[...nested.values()].map((column) => `    ${key(column.key)}: ${column.source},`),
  ];
  const nullable = new Set([...columns.filter((column) => column.nullable).map((column) => column.field), ...[...nested.values()].map(({ key }) => key)]);
  const indexes = table.indexes.map(({ indexDescriptor, fields: indexFields }) => {
    const parts = indexFields.map((path) => {
      const name = nested.get(path)?.key ?? path;
      const column = columns.find((candidate) => candidate.field === path);
      if (column?.kind === "value") mixedIndexFields.push(`${table.tableName}.${indexDescriptor}: ${path}`);
      const ref = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? `t.${name}` : `t[${JSON.stringify(name)}]`;
      return nullable.has(name) ? `${ref}.asc().nullsFirst()` : ref;
    });
    return `    index(${JSON.stringify(indexName(table.tableName, indexDescriptor))}).on(${[...parts, "t._creationTime", "t._id"].join(", ")}),`;
  });

  const name = table.tableName;
  let source = `export const ${name} = pgTable(\n  ${JSON.stringify(name)},\n  {\n${lines.join("\n")}\n  },\n  (t) => [\n${indexes.join("\n")}\n  ],\n);\n`;
  const nullMeansNull = columns.filter((column) => column.kind !== "value" && column.nullMeansNull).map((column) => column.field);
  if (nullMeansNull.length > 0) source += `nullValued(${name}, ${JSON.stringify(nullMeansNull)});\n`;
  const docType = `{ _id: Id<${JSON.stringify(name)}>; _creationTime: number } & (${typeOf(table.documentType)})`;
  return { source, docType };
}

export function generate(schema: ExportedSchema, domainOf: (table: string) => string, skip: ReadonlySet<string>): Output {
  const mixedIndexFields: string[] = [];
  const byDomain = new Map<string, Array<{ name: string; source: string; docType: string }>>();
  for (const table of schema.tables) {
    if (skip.has(table.tableName)) continue;
    const domain = domainOf(table.tableName);
    const list = byDomain.get(domain) ?? [];
    list.push({ name: table.tableName, ...tableSource(table, mixedIndexFields) });
    byDomain.set(domain, list);
  }

  const files: Record<string, string> = {};
  const domains = [...byDomain.keys()].sort();
  for (const domain of domains) {
    const tables = byDomain.get(domain)!;
    const body = tables.map(({ source }) => source).join("\n");
    const imports = [
      `import { sql } from "drizzle-orm";`,
      `import { index, pgTable } from "drizzle-orm/pg-core";`,
      `import type { Value } from "../codec.ts";`,
      `import { bool, creationTime, f64, i64, id, str, value, type Id } from "../columns.ts";`,
      `import { nullValued } from "../documents.ts";`,
    ].filter((line) => {
      const names = /import (?:type )?\{ ([^}]+) \}/.exec(line)![1]!.split(", ").map((name) => name.replace(/^type /, ""));
      return names.some((name) => new RegExp(`\\b${name.replace("$", "\\$")}\\b`).test(`${body}\n${tables.map((t) => t.docType).join("\n")}`));
    });
    const docs = `export interface ${pascal(domain)}Documents {\n${tables.map(({ name, docType }) => `  ${name}: ${docType};`).join("\n")}\n}\n`;
    files[`${domain}.ts`] = `// Generated once from convex/schema.ts by tools/rewrite/drizzle; owned by hand from here on.\n${imports.join("\n")}\n\n${body}\n${docs}`;
  }
  files["index.ts"] = [
    `// The rewrite's data model: one table per Convex table, by the column rule in tools/rewrite/drizzle/generate.ts.`,
    `// Indexed fields stored as jsonb, which Postgres orders by its own jsonb rules: every query that orders on one says how.`,
    ...mixedIndexFields.map((line) => `//   ${line}`),
    ...domains.map((domain) => `import type { ${pascal(domain)}Documents } from "./${domain}.ts";`),
    ``,
    ...domains.map((domain) => `export * from "./${domain}.ts";`),
    `export * from "./service.ts";`,
    ``,
    `/** Every table's document type, by table name. */`,
    `export type Documents = ${domains.map((domain) => `${pascal(domain)}Documents`).join(" &\n  ")};`,
    `export type TableName = keyof Documents;`,
    `export type Doc<Table extends TableName> = Documents[Table];`,
    ``,
  ].join("\n");
  return { files, mixedIndexFields };
}

/** An object key or property access: bare when the name is an identifier. */
function key(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function pascal(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
