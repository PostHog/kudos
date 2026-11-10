// A ported test that waits: it reaches a body another stack hasn't ported yet, so today it ends in that body's
// `NotPortedError`. It runs anyway, so its setup and every step before the stub stay proven, and it fails when it ends
// any other way: a different error is a defect, and passing means the bodies it waits on have landed. The stack that
// merges the last of them turns it into a plain `test` and empties the row's `Waits on` in the test-port ledger.
import { test } from "vitest";
import { NotPortedError } from "../src/notPorted.ts";

/** A stack, as the test-port ledger names it. */
export type Stack = `S${number}`;

/**
 * Runs a waiting test's body. It answers the stub's path while the body ends in a `NotPortedError`, rethrows any other
 * failure, and throws when the body passes, naming the stacks so the last of them turns the test on.
 */
export async function stillWaiting(stacks: readonly Stack[], body: () => unknown): Promise<string> {
  try {
    await body();
  } catch (error) {
    if (error instanceof NotPortedError) return error.path;
    throw error;
  }
  throw new Error(`This test passes now: make it a plain test and empty its ledger row's Waits on (${stacks.join(" ")})`);
}

/** Declares a test that waits on the named stacks, as its ledger row's `Waits on` says. */
export function waitsOn(stacks: readonly [Stack, ...Stack[]], name: string, body: () => unknown, timeout?: number): void {
  test(`${name} (waits on ${stacks.join(" ")})`, async () => {
    await stillWaiting(stacks, body);
  }, timeout);
}
