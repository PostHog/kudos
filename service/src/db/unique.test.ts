import { expect, test } from "vitest";
import { unique } from "./unique.ts";

test("no row is null, one row is that row", () => {
  expect(unique("allowanceSpending", []), "no row").toBeNull();
  expect(unique("allowanceSpending", [{ spent: 2 }]), "one row").toEqual({ spent: 2 });
});

test("two rows are refused with Convex's own words, which the analytics boundary recognises", () => {
  expect(() => unique("allowanceSpending", [{ spent: 1 }, { spent: 2 }]), "two rows").toThrow(
    new Error("unique() query returned more than one result from table allowanceSpending:"),
  );
});
