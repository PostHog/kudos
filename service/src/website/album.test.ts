import { describe, expect, test } from "vitest";
import { memberIdIn } from "./album.ts";

describe("memberIdIn stands in for Convex's normalizeId on a person page's argument", () => {
  test("a string Postgres can hold passes on as the member, so the page's read finds the member or none", () => {
    expect(memberIdIn("k57a2bxv8r0f3m1n9c4d6e5w7h7q8yz1")).toBe("k57a2bxv8r0f3m1n9c4d6e5w7h7q8yz1");
    expect(memberIdIn("0b9f5c1e-7a52-4d8e-9a13-4a3f6c1d2e7b")).toBe("0b9f5c1e-7a52-4d8e-9a13-4a3f6c1d2e7b");
  });

  test("a string with a null character is no member, as Postgres refuses it as text before any read", () => {
    expect(memberIdIn("bad\u0000id")).toBeNull();
  });
});
