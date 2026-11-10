// The ported Slack tests' send helper: a 500 ends a waiting test at a stub only when nothing else failed while it ran.
import { describe, expect, test } from "vitest";
import { NotPortedError } from "../notPorted.ts";
import type { LogLine } from "../../testing/backend.ts";
import { failureOf } from "./hugsTesting.ts";

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
