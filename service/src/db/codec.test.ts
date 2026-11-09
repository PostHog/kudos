import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../../testing/database.ts";
import { decodeStored, encodeStored, parseExport, printExport, type Value } from "./codec.ts";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

// Every kind a document field holds, with the edges each encoding must keep.
const values: Array<[string, Value]> = [
  ["null", null],
  ["true", true],
  ["a string with a quote and an emoji", 'say "hi" 🦔'],
  ["an integer-valued float64", 3],
  ["a fraction", 0.1],
  ["the smallest float64", 5e-324],
  ["a float64 written with an exponent", 1e21],
  ["-0", -0],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
  ["an int64", 3n],
  ["the largest int64", 2n ** 63n - 1n],
  ["the smallest int64", -(2n ** 63n)],
  ["bytes", bytes(0, 1, 254, 255)],
  ["nested objects and arrays", { a: [1, 2n, { b: null }], "": "empty key" }],
  // The directory check's job args: an int64 attempt beside a message reference.
  ["the directory check's args", { ref: { workspace: "T0", conversation: "C0", message: "1.000100" }, attempt: 2n }],
];

describe("the stored encoding", () => {
  test.each(values)("%s survives encode and decode", (_, value) => {
    expect(decodeStored(encodeStored(value))).toStrictEqual(value);
  });

  test("an int64 and a float64 of the same number stay apart", () => {
    expect(decodeStored(encodeStored(3n)), "int64").toBe(3n);
    expect(decodeStored(encodeStored(3)), "float64").toBe(3);
  });

  test("a missing object field is left out and a null one kept", () => {
    expect(decodeStored(encodeStored({ a: undefined, b: null } as unknown as Value))).toStrictEqual({ b: null });
  });

  test("a field name starting with $ is refused, so a tag is never ambiguous", () => {
    expect(() => encodeStored({ $integer: "AQAAAAAAAAA=" })).toThrow("can't start with $");
  });

  test("an int64 out of range is refused", () => {
    expect(() => encodeStored(2n ** 63n)).toThrow("64-bit");
  });
});

describe("Postgres keeps the stored encoding in jsonb", () => {
  const database = useTestDatabase();

  test.each(values)("%s survives a jsonb column", async (_, value) => {
    const { rows } = await database.pool.query<{ stored: string }>("select $1::jsonb::text as stored", [encodeStored(value)]);

    expect(decodeStored(rows[0]!.stored)).toStrictEqual(value);
  });
});

describe("the export encoding", () => {
  test("numbers keep their kind from how they are written", () => {
    const parsed = parseExport('{"int":3,"float":3.0,"negativeZero":-0.0,"exponent":1e21,"big":9223372036854775807,"small":-9223372036854775808}');

    expect(parsed).toStrictEqual({ int: 3n, float: 3, negativeZero: -0, exponent: 1e21, big: 2n ** 63n - 1n, small: -(2n ** 63n) });
  });

  test("special floats and bytes are tagged", () => {
    const nan = printExport(Number.NaN);
    expect(parseExport(nan), "NaN").toBeNaN();
    expect(parseExport('{"$bytes":"AAH+/w=="}'), "bytes").toStrictEqual(bytes(0, 1, 254, 255));
  });

  test.each(values)("%s survives print and parse", (_, value) => {
    expect(parseExport(printExport(value))).toStrictEqual(value);
  });

  test("a float64 is always written with a dot or an exponent, an int64 never", () => {
    expect(printExport({ a: 3, b: -0, c: 3n, d: 1e21 })).toBe('{"a":3.0,"b":-0.0,"c":3,"d":1e+21}');
  });

  test("malformed export text is refused", () => {
    for (const text of ['{"a":1', "[1,]", '{"a":01}', "nope", '{"$integer":"AQ=="}', "1 2"]) expect(() => parseExport(text), text).toThrow();
  });
});
