// The ported Slack tests' send helper: a 500 ends a waiting test at a stub only when nothing else failed while it ran.
import { describe, expect, test } from "vitest";
import { NotPortedError } from "../notPorted.ts";
import type { LogLine } from "../../testing/backend.ts";
import { notPorted } from "../notPorted.ts";
import { atOnce, failureOf } from "./hugsTesting.ts";

const failed = (error: string): LogLine => ({ level: "error", message: "slack request failed", fields: { path: "/slack/events", error } });
const path = "slack.reactions.reactionAdded";

describe("a send through the front door", () => {
  test("that answered ends in nothing, whatever another request logged", () => {
    expect(failureOf(200, [failed("TypeError")], path)).toBeNull();
  });

  test("that answered 500 behind a stub ends at the stub", () => {
    expect(failureOf(500, [{ level: "info", message: "other", fields: {} }, failed("NotPortedError")], path)).toBeInstanceOf(NotPortedError);
  });

  test("that answered 500 while a real failure and a stub were logged, as two sends at once, ends in the real failure", () => {
    for (const logs of [[failed("NotPortedError"), failed("TypeError")], [failed("TypeError"), failed("NotPortedError")]]) {
      const failure = failureOf(500, logs, path);
      expect(failure).not.toBeInstanceOf(NotPortedError);
      expect(failure?.message).toContain("TypeError");
    }
  });

  test("that answered 500 with nothing logged ends in nothing here, and the test reads the 500 itself", () => {
    expect(failureOf(500, [], path)).toBeNull();
  });
});

describe("sends at once", () => {
  function deferred<T>() {
    let settle!: { resolve: (value: T) => void; reject: (error: unknown) => void };
    const promise = new Promise<T>((resolve, reject) => (settle = { resolve, reject }));
    return { promise, ...settle };
  }

  test("end in a real failure that comes after another send ended at a stub", async () => {
    const [stub, real] = [deferred<Response>(), deferred<Response>()];
    const both = atOnce([stub.promise, real.promise]);
    stub.reject(notPorted(path));
    await Promise.resolve();
    real.reject(new TypeError("a real failure"));
    await expect(both).rejects.toThrow("a real failure");
  });

  test("end in a real failure whatever it rejected with, undefined among them", async () => {
    for (const reason of [undefined, null, "a string"]) {
      const both = atOnce([Promise.reject(notPorted(path)), Promise.reject(reason)]);
      await both.then(
        () => expect.unreachable("the sends were expected to fail"),
        (failure: unknown) => expect(failure).toBe(reason),
      );
    }
  });

  test("end at the stub when no send failed for real, and answer every send when none failed", async () => {
    await expect(atOnce([Promise.reject(notPorted(path)), Promise.resolve(1)])).rejects.toBeInstanceOf(NotPortedError);
    expect(await atOnce([Promise.resolve(1), Promise.resolve("two")])).toEqual([1, "two"]);
  });
});
