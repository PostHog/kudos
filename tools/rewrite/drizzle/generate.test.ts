// @vitest-environment node
import { describe, expect, test } from "vitest";
import { columnOf, fieldsOf, indexName, tableSource, type Field, type Validator } from "./generate.ts";

const string: Validator = { type: "string" };
const nil: Validator = { type: "null" };
const field = (fieldType: Validator, optional = false): Field => ({ fieldType, optional });
const union = (...value: Validator[]): Validator => ({ type: "union", value });
const literal = (value: string | number | boolean | null): Validator => ({ type: "literal", value });

describe("the column rule", () => {
  test.each([
    ["a required string", field(string), { kind: "string", nullable: false }],
    ["an optional string", field(string, true), { kind: "string", nullable: true, nullMeansNull: false }],
    ["an ID", field({ type: "id", tableName: "members" }), { kind: "string", nullable: false }],
    ["a union of string literals", field(union(literal("a"), literal("b"))), { kind: "string", nullable: false }],
    ["an int64 literal", field({ type: "literal", value: { $integer: "AQAAAAAAAAA=" } }), { kind: "bigint" }],
    ["a required string or null", field(union(string, nil)), { kind: "string", nullable: true, nullMeansNull: true }],
    ["an optional string or null", field(union(string, nil), true), { kind: "value", nullable: true }],
    ["a string or a number", field(union(string, { type: "number" })), { kind: "value", nullable: false }],
    ["an object", field({ type: "object", value: { a: field(string) } }), { kind: "value" }],
    ["an array", field({ type: "array", value: string }), { kind: "value" }],
    ["bytes", field({ type: "bytes" }), { kind: "value" }],
    ["any", field({ type: "any" }), { kind: "value" }],
  ] as const)("%s", (_, input, expected) => {
    expect(columnOf("f", input)).toMatchObject(expected);
  });
});

describe("a table of variants", () => {
  test("has every variant's fields, optional where a variant lacks one", () => {
    const fields = fieldsOf(
      union(
        { type: "object", value: { kind: field(literal("a")), shared: field(string), onlyA: field(string) } },
        { type: "object", value: { kind: field(literal("b")), shared: field(string) } },
      ),
    );

    expect(columnOf("shared", fields.shared!)).toMatchObject({ kind: "string", nullable: false });
    expect(columnOf("onlyA", fields.onlyA!)).toMatchObject({ kind: "string", nullable: true });
    expect(columnOf("kind", fields.kind!)).toMatchObject({ kind: "string", nullable: false });
  });
});

describe("indexes", () => {
  test("a nullable column is indexed ascending with nulls first, and every index ends in _creationTime and _id", () => {
    const { source } = tableSource(
      {
        tableName: "things",
        documentType: { type: "object", value: { a: field(string), b: field(string, true) } },
        indexes: [{ indexDescriptor: "by_a_b", fields: ["a", "b"] }],
        searchIndexes: [],
        vectorIndexes: [],
      },
      [],
    );

    expect(source).toContain(`index("things_by_a_b").on(t.a, t.b.asc().nullsFirst(), t._creationTime, t._id)`);
  });

  test("a nested index field becomes a generated column read only when it holds its kind", () => {
    const mixed: string[] = [];
    const { source } = tableSource(
      {
        tableName: "things",
        documentType: { type: "object", value: { who: field({ type: "object", value: { user: field(string) } }, true) } },
        indexes: [{ indexDescriptor: "by_user", fields: ["who.user"] }],
        searchIndexes: [],
        vectorIndexes: [],
      },
      mixed,
    );

    expect(source).toContain(`who$user: str("who.user").generatedAlwaysAs(sql\`CASE jsonb_typeof("who"->'user') WHEN 'string' THEN "who"->>'user' END\`)`);
    expect(source).toContain(`t.who$user.asc().nullsFirst()`);
    expect(mixed, "a typed nested field isn't a jsonb index field").toEqual([]);
  });

  test("a long index name is cut to Postgres's 63 bytes with a hash, so two never collide", () => {
    const a = indexName("aVeryLongTableNameThatGoesOnAndOn", "by_workspace_and_member_and_something_a");
    const b = indexName("aVeryLongTableNameThatGoesOnAndOn", "by_workspace_and_member_and_something_b");

    expect(a.length).toBeLessThanOrEqual(63);
    expect(a).not.toBe(b);
    expect(indexName("t", "by_x"), "a short name stays as it is").toBe("t_by_x");
  });
});
