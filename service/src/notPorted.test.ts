import { expect, test } from "vitest";
import { NotPortedError, notPorted, notPortedValue } from "./notPorted.ts";

test("a body not ported yet fails by its former Convex path", () => {
  const error = notPorted("engine.awards.recordAward");
  expect(error).toBeInstanceOf(NotPortedError);
  expect(error.path).toBe("engine.awards.recordAward");
  expect(() => {
    throw error;
  }).toThrow("engine.awards.recordAward is not ported yet");
});

test("a value not ported yet can be imported and compared, and fails on any use", () => {
  const hook = notPortedValue<{ claim: () => string; name: string }>("store.inventory.ownedHook");
  expect([hook].includes(hook)).toBe(true);
  expect(() => hook.name).toThrow("store.inventory.ownedHook is not ported yet");
  expect(() => hook.claim()).toThrow(NotPortedError);
  expect(() => "name" in hook).toThrow(NotPortedError);
  expect(() => ({ ...hook })).toThrow(NotPortedError);
});
