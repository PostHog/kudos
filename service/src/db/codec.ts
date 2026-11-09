// The service's one value codec, written from Convex's documented value encodings; it imports nothing from Convex.
//
// A value is what a Convex document field can hold: null, a boolean, a float64 (`number`), an int64 (`bigint`),
// a string, bytes (`ArrayBuffer`), an array or an object. Two text forms carry it:
//
// - **Stored** (`encodeStored`/`decodeStored`): what `jsonb` columns and job args hold. int64 is `{"$integer": base64}`,
//   bytes `{"$bytes": base64}`, and NaN, ±Infinity and -0 `{"$float": base64}` (8 little-endian bytes each); every
//   other number is a float64. Postgres keeps this form exactly: `jsonb` stores numbers as numeric, which would turn
//   `-0.0` into `0.0` and lose whether `3` was an int64, so nothing is left to the number's spelling.
// - **Export** (`parseExport`/`printExport`): the JSONL of a Convex snapshot export. int64 is a bare integer (`3`),
//   a finite float64 always has a dot or an exponent (`3.0`, `-0.0`, `1e21`), and NaN, ±Infinity and bytes are tagged
//   as above (`$float`, `$bytes`). `JSON.parse` would lose the difference, and int64 beyond 2^53, so this parser keeps each number's text.
//
// Field names never start with `$` in Convex, so a one-key object whose key does is always a tag.

export type Value = null | boolean | number | bigint | string | ArrayBuffer | Value[] | { [field: string]: Value };

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const MIN_INT64 = -(2n ** 63n);
const MAX_INT64 = 2n ** 63n - 1n;

export function encodeStored(value: Value): string {
  return JSON.stringify(toTagged(value));
}

export function decodeStored(text: string): Value {
  return fromTagged(JSON.parse(text) as Json, (number) => number);
}

/** Parses one export value, such as a JSONL line, keeping int64 and float64 apart by how each number is written. */
export function parseExport(text: string): Value {
  const parser = new ExportParser(text);
  const value = parser.value();
  parser.end();
  return value;
}

/** Writes a value as a Convex export writes it. Object fields keep the order they have. */
export function printExport(value: Value): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return checkedInt64(value).toString();
  if (typeof value === "number") return Number.isFinite(value) ? floatText(value) : JSON.stringify(floatTag(value));
  if (value instanceof ArrayBuffer) return JSON.stringify({ $bytes: Buffer.from(value).toString("base64") });
  if (Array.isArray(value)) return `[${value.map(printExport).join(",")}]`;
  return `{${Object.entries(value)
    .map(([field, inner]) => `${JSON.stringify(field)}:${printExport(inner)}`)
    .join(",")}}`;
}

function toTagged(value: Value): Json {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "bigint") return { $integer: int64Base64(checkedInt64(value)) };
  if (typeof value === "number") return isSpecial(value) ? floatTag(value) : value;
  if (value instanceof ArrayBuffer) return { $bytes: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(toTagged);
  const out: { [key: string]: Json } = {};
  for (const [field, inner] of Object.entries(value)) {
    if (inner === undefined) continue;
    if (field.startsWith("$")) throw new Error(`A field name can't start with $: ${field}`);
    out[field] = toTagged(inner);
  }
  return out;
}

function fromTagged(json: Json, number: (value: number) => Value): Value {
  if (json === null || typeof json === "boolean" || typeof json === "string") return json;
  if (typeof json === "number") return number(json);
  if (Array.isArray(json)) return json.map((inner) => fromTagged(inner, number));
  const keys = Object.keys(json);
  const tag = keys.length === 1 && keys[0]!.startsWith("$") ? keys[0]! : undefined;
  if (tag !== undefined) {
    const payload = json[tag];
    if (typeof payload !== "string") throw new Error(`Malformed ${tag} value`);
    const bytes = Buffer.from(payload, "base64");
    if (tag === "$bytes") return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (bytes.byteLength !== 8) throw new Error(`Malformed ${tag} value: ${bytes.byteLength} bytes`);
    if (tag === "$integer") return bytes.readBigInt64LE(0);
    if (tag === "$float") {
      const float = bytes.readDoubleLE(0);
      if (!isSpecial(float)) throw new Error(`Float ${float} should be written as a number`);
      return float;
    }
    throw new Error(`Unknown value tag ${tag}`);
  }
  const out: { [field: string]: Value } = {};
  for (const key of keys) out[key] = fromTagged(json[key]!, number);
  return out;
}

function isSpecial(value: number): boolean {
  return !Number.isFinite(value) || Object.is(value, -0);
}

function floatTag(value: number): Json {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleLE(value, 0);
  return { $float: bytes.toString("base64") };
}

function floatText(value: number): string {
  if (Object.is(value, -0)) return "-0.0";
  const text = JSON.stringify(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

function checkedInt64(value: bigint): bigint {
  if (value < MIN_INT64 || value > MAX_INT64) throw new Error(`BigInt ${value} does not fit into a 64-bit signed integer`);
  return value;
}

function int64Base64(value: bigint): string {
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(value, 0);
  return bytes.toString("base64");
}

/** A small JSON parser that reads numbers from their text: an integer literal is an int64, anything else a float64. */
class ExportParser {
  private at = 0;
  private readonly text: string;
  constructor(text: string) {
    this.text = text;
  }

  value(): Value {
    this.space();
    const char = this.text[this.at];
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') return this.string();
    if (char === "-" || (char !== undefined && char >= "0" && char <= "9")) return this.number();
    for (const [word, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (this.text.startsWith(word, this.at)) {
        this.at += word.length;
        return value;
      }
    }
    throw this.error("a value");
  }

  end(): void {
    this.space();
    if (this.at !== this.text.length) throw this.error("the end of the value");
  }

  private object(): Value {
    this.at++;
    const fields: Array<[string, Value]> = [];
    this.space();
    if (this.text[this.at] === "}") {
      this.at++;
      return {};
    }
    for (;;) {
      this.space();
      if (this.text[this.at] !== '"') throw this.error("a field name");
      const field = this.string();
      this.space();
      if (this.text[this.at++] !== ":") throw this.error('":"');
      fields.push([field, this.value()]);
      this.space();
      const next = this.text[this.at++];
      if (next === "}") break;
      if (next !== ",") throw this.error('"," or "}"');
    }
    const [only] = fields;
    if (fields.length === 1 && only![0].startsWith("$")) {
      // A tag: reuse the stored form's decoder, whose payload is a base64 string either way.
      return fromTagged({ [only![0]]: only![1] as Json }, (number) => number);
    }
    return Object.fromEntries(fields);
  }

  private array(): Value[] {
    this.at++;
    const items: Value[] = [];
    this.space();
    if (this.text[this.at] === "]") {
      this.at++;
      return items;
    }
    for (;;) {
      items.push(this.value());
      this.space();
      const next = this.text[this.at++];
      if (next === "]") return items;
      if (next !== ",") throw this.error('"," or "]"');
    }
  }

  private string(): string {
    const match = /^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(this.text.slice(this.at));
    if (!match) throw this.error("a string");
    this.at += match[0].length;
    return JSON.parse(match[0]) as string;
  }

  private number(): number | bigint {
    const match = /^-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.text.slice(this.at));
    if (!match) throw this.error("a number");
    this.at += match[0].length;
    if (match[1] === undefined && match[2] === undefined) return checkedInt64(BigInt(match[0]));
    return Number(match[0]);
  }

  private space(): void {
    while (" \t\n\r".includes(this.text[this.at] ?? "x")) this.at++;
  }

  private error(expected: string): Error {
    return new Error(`Expected ${expected} at position ${this.at} of an export value`);
  }
}
